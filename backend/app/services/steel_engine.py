"""
Bulk cargo sourcing & freight optimiser.

A direct port of the decision engine in `ML/app.py`: for a given steel plant,
order volume and vessel class, price every (seaborne origin x discharge port)
routing all the way to the plant stockyard, then allocate the order.

The allocation
--------------
A PSU does not buy one way. SAIL and RINL run a dual-tier framework — a
long-term contract (LTC) carrying the baseload so the blast furnaces never run
dry, and spot auction tenders chasing freight dips with the balance — so
`ML/app.py` splits the order on an operator-set ratio (70:30 LTC:spot by
default) and allocates both tiers in one program:

    minimise  sum_r  x_spot_r * spot_cost_r  +  x_ltc_r * ltc_cost_r
    s.t.      sum_r  x_spot_r == demand * spot_ratio
              sum_r  x_ltc_r  == demand * (1 - spot_ratio)
              x_spot_r, x_ltc_r >= 0

That same program is handed to PuLP's CBC solver here, so the allocation is a
genuine LP solve rather than an imitation of one.

The optimum is degenerate — with no capacity ceiling each quota goes wholly to
the cheapest feasible routing *on its own tier* — so the closed form agrees with
CBC to the tonne. The two tiers need not pick the same routing: the LTC stack
drops exactly the demurrage and charter-hire terms that separate one port's
queue from another's, so a berth that spot pricing rejects for its anchorage
backlog can still be the right home for framework tonnage. That closed form is
kept as the fallback for an environment without PuLP, and `ledger.solver`
records which one produced the answer. Every other routing is still returned,
priced on both tiers and ranked, so the operator sees what was rejected and by
how much.

Cost stack, per tonne
---------------------
Spot tier — full market exposure, and the queue is the buyer's problem:

    FOB cargo
  + ocean freight        supplier base x vessel scale factor x freight index
  + coal grade adjustment
  + port tariff
  + demurrage            only when steaming full ahead into a queue
  + extra charter hire   only when slow-steaming through that queue
  - bunker saved         only when slow-steaming
  = ocean USD/t  ->  x USD/INR
  + FOIS rail INR/t
  + plant godown INR/t
  = landed INR/t

LTC tier — the framework's negotiated terms on committed tonnage:

    FOB cargo x 0.955    4.5% long-term volume discount
  + ocean freight x 0.96 4% off the committed leg
  + coal grade adjustment
  + port tariff
  - bunker saved         still earned when slow-steaming
  = ocean USD/t  ->  the same rail and godown legs

with no demurrage and no extra charter hire at all: the framework buys
pre-booked priority berthing slots, so the supplier carries the discharge
window rather than the plant.
"""

from ..domain import (
    DEFAULT_SPOT_RATIO_PCT,
    FREE_LAYTIME_DAYS,
    LTC_FOB_FACTOR,
    LTC_FREIGHT_FACTOR,
    PLANT_BY_ID,
    PLANTS,
    PORT_BY_CODE,
    PORTS,
    RAIL_BY_PAIR,
    RAIL_FALLBACK,
    SUPPLIERS,
    VESSEL_BY_ID,
    VESSELS,
    VLSFO_CRUDE_PARITY,
)
from . import ml_engine

MIN_VOLUME_T = 10000
MAX_VOLUME_T = 500000

# ML/app.py's mid-voyage telemetry slider: which day of the passage the parcel
# already at sea is on.
MAX_VOYAGE_DAY = 20
DEFAULT_VOYAGE_DAY = 4


def _to_float(value, default):
    if value is None or value == "":
        return default
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return default if out != out or out in (float("inf"), float("-inf")) else out


def _clamp(value, lo, hi):
    return max(lo, min(hi, value))


# ---------------------------------------------------------------------------
# Routing economics
# ---------------------------------------------------------------------------

def _rail_leg(port_code, plant_id):
    leg = RAIL_BY_PAIR.get((port_code, plant_id))
    if leg:
        return leg["fois_inr_per_t"], leg["distance_km"], True
    return RAIL_FALLBACK["fois_inr_per_t"], RAIL_FALLBACK["distance_km"], False


def _price_route(supplier, port, vessel, *, plant_id, usd_inr, vlsfo, slow_steaming,
                 port_delay_days, godown_inr):
    """
    Full landed cost for one origin/port pair, on both procurement tiers.

    Returns the spot stack and the LTC stack off the same physical voyage, so
    the optimiser can put framework tonnage and auction tonnage on different
    routings when the queue economics say it should. Infeasible routings say why.
    """
    if vessel["draft_req_m"] > port["max_draft_m"]:
        return {
            "feasible": False,
            "reason": (f"{vessel['name']} needs {vessel['draft_req_m']:.1f} m draft; "
                       f"{port['short']} allows {port['max_draft_m']:.1f} m"),
        }
    if vessel["dwt"] > port["max_dwt"]:
        return {
            "feasible": False,
            "reason": (f"{vessel['name']} is {vessel['dwt']:,} DWT; "
                       f"{port['short']} tops out at {port['max_dwt']:,} DWT"),
        }

    dwt = vessel["dwt"]
    # ML/app.py: effective_delay_days = live_delay + port_wait_adder — the
    # operator's congestion spike sits on top of the port's reference queue.
    delay_days = port["queue_delay_days"] + port_delay_days
    total_wait_days = port["wait_hours"] / 24.0 + delay_days
    chargeable_days = max(0.0, total_wait_days - FREE_LAYTIME_DAYS)
    demurrage_full_speed = chargeable_days * port["demurrage_day_usd"] / dwt

    if slow_steaming:
        # Virtual arrival: slow down to meet the berth window. No anchorage
        # demurrage, but the longer passage is paid for in charter hire.
        demurrage = 0.0
        extra_charter = delay_days * vessel["hire_usd_per_day"] / dwt
        bunker_saved = ((vessel["fuel_full_tpd"] - vessel["fuel_slow_tpd"])
                        * supplier["sailing_days"] * vlsfo) / dwt
    else:
        demurrage = demurrage_full_speed
        extra_charter = 0.0
        bunker_saved = 0.0

    freight = supplier["base_freight_usd_per_t"] * vessel["scale_freight_factor"]

    # -- spot tier: the index in full, and the anchorage queue is the buyer's --
    ocean_usd = (supplier["fob_usd_per_t"] + freight
                 + supplier["quality_adj_usd_per_t"] + port["tariff_usd_per_t"]
                 + demurrage + extra_charter - bunker_saved)

    # -- LTC tier: framework discounts, and priority berthing means no queue --
    # The bunker credit still applies: slow-steaming saves the same fuel whoever
    # holds the berth window.
    ltc_fob = supplier["fob_usd_per_t"] * LTC_FOB_FACTOR
    ltc_freight = freight * LTC_FREIGHT_FACTOR
    ocean_ltc_usd = (ltc_fob + ltc_freight
                     + supplier["quality_adj_usd_per_t"] + port["tariff_usd_per_t"]
                     - bunker_saved)

    rail_inr, rail_km, rail_published = _rail_leg(port["code"], plant_id)
    landed_inr = ocean_usd * usd_inr + rail_inr + godown_inr
    landed_ltc_inr = ocean_ltc_usd * usd_inr + rail_inr + godown_inr

    return {
        "feasible": True,
        "reason": f"Clear to berth at {port['short']}",
        "ocean_usd_per_t": round(ocean_usd, 2),
        "landed_inr_per_t": round(landed_inr, 2),
        "ocean_ltc_usd_per_t": round(ocean_ltc_usd, 2),
        "landed_ltc_inr_per_t": round(landed_ltc_inr, 2),
        # What the framework terms are worth per tonne on this routing.
        "ltc_discount_inr_per_t": round(landed_inr - landed_ltc_inr, 2),
        "rail_km": rail_km,
        "rail_published": rail_published,
        "total_wait_days": round(total_wait_days, 2),
        "queue_delay_days": round(delay_days, 2),
        # What full-speed steaming into this queue would have cost in demurrage
        # — ML/app.py's "dead-freight fines" figure for the advisory.
        "demurrage_avoided_usd_per_t": round(demurrage_full_speed if slow_steaming else 0.0, 2),
        # The multi-modal breakdown, all in INR/t so the bars add up on screen.
        "breakdown": {
            "fob": round(supplier["fob_usd_per_t"] * usd_inr, 2),
            "ocean_freight": round(freight * usd_inr, 2),
            "grade_adj": round(supplier["quality_adj_usd_per_t"] * usd_inr, 2),
            "port_handling": round(port["tariff_usd_per_t"] * usd_inr, 2),
            "demurrage": round(demurrage * usd_inr, 2),
            "extra_charter": round(extra_charter * usd_inr, 2),
            "bunker_saved": round(-bunker_saved * usd_inr, 2),
            "rail_fois": round(rail_inr, 2),
            "godown": round(godown_inr, 2),
        },
        # Same legs on framework terms — demurrage and charter hire fall away.
        "breakdown_ltc": {
            "fob": round(ltc_fob * usd_inr, 2),
            "ocean_freight": round(ltc_freight * usd_inr, 2),
            "grade_adj": round(supplier["quality_adj_usd_per_t"] * usd_inr, 2),
            "port_handling": round(port["tariff_usd_per_t"] * usd_inr, 2),
            "demurrage": 0.0,
            "extra_charter": 0.0,
            "bunker_saved": round(-bunker_saved * usd_inr, 2),
            "rail_fois": round(rail_inr, 2),
            "godown": round(godown_inr, 2),
        },
        "usd_components": {
            "fob": supplier["fob_usd_per_t"],
            "freight": round(freight, 2),
            "grade_adj": supplier["quality_adj_usd_per_t"],
            "tariff": port["tariff_usd_per_t"],
            "demurrage": round(demurrage, 2),
            "extra_charter": round(extra_charter, 2),
            "bunker_saved": round(bunker_saved, 2),
        },
        "usd_components_ltc": {
            "fob": round(ltc_fob, 2),
            "freight": round(ltc_freight, 2),
            "grade_adj": supplier["quality_adj_usd_per_t"],
            "tariff": port["tariff_usd_per_t"],
            "demurrage": 0.0,
            "extra_charter": 0.0,
            "bunker_saved": round(bunker_saved, 2),
        },
    }


# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------

def _empty_allocation(routes):
    return {r["id"]: {"spot": 0.0, "ltc": 0.0} for r in routes}


def _allocate_closed_form(routes, spot_volume, ltc_volume):
    """
    The LP's degenerate optimum, in closed form.

    With no per-route capacity each quota goes wholly to the cheapest routing on
    its own tier — and those need not be the same routing, since the LTC stack
    drops the demurrage and charter terms that separate the ports' queues.
    """
    alloc = _empty_allocation(routes)
    if spot_volume > 0:
        best = min(routes, key=lambda r: r["landed_inr_per_t"])
        alloc[best["id"]]["spot"] = float(spot_volume)
    if ltc_volume > 0:
        best = min(routes, key=lambda r: r["landed_ltc_inr_per_t"])
        alloc[best["id"]]["ltc"] = float(ltc_volume)
    return alloc


def _allocate(routes, spot_volume, ltc_volume):
    """
    Solve ML/app.py's dual-tier allocation program:

        minimise  sum_r  x_spot_r * spot_cost_r  +  x_ltc_r * ltc_cost_r
        s.t.      sum_r  x_spot_r == spot_volume
                  sum_r  x_ltc_r  == ltc_volume
                  x_spot_r, x_ltc_r >= 0

    Returns (allocation by route id as {"spot": t, "ltc": t}, solver label).

    Any failure — PuLP absent, no CBC binary, a non-optimal status, a solution
    that does not add up — drops to the closed form rather than surfacing a
    solver problem as a broken sourcing plan.
    """
    try:
        import pulp as pl
    except Exception:  # noqa: BLE001
        return (_allocate_closed_form(routes, spot_volume, ltc_volume),
                "closed form (PuLP not installed)")

    try:
        problem = pl.LpProblem("VORTEX_sourcing_allocation", pl.LpMinimize)
        ids = [r["id"] for r in routes]
        spot_cost = {r["id"]: r["landed_inr_per_t"] for r in routes}
        ltc_cost = {r["id"]: r["landed_ltc_inr_per_t"] for r in routes}
        x_spot = pl.LpVariable.dicts("allocated_spot_t", ids, lowBound=0, cat="Continuous")
        x_ltc = pl.LpVariable.dicts("allocated_ltc_t", ids, lowBound=0, cat="Continuous")

        # Objective: the blended bill across both procurement tiers.
        problem += pl.lpSum(x_spot[i] * spot_cost[i] + x_ltc[i] * ltc_cost[i] for i in ids)
        # One quota per tier — the 70:30 framework split, as constraints.
        problem += pl.lpSum(x_spot[i] for i in ids) == spot_volume
        problem += pl.lpSum(x_ltc[i] for i in ids) == ltc_volume

        problem.solve(pl.PULP_CBC_CMD(msg=False))
        status = pl.LpStatus[problem.status]
        if status != "Optimal":
            return (_allocate_closed_form(routes, spot_volume, ltc_volume),
                    f"closed form (CBC returned {status})")

        alloc = {i: {"spot": float(x_spot[i].varValue or 0.0),
                     "ltc": float(x_ltc[i].varValue or 0.0)} for i in ids}
        # Guard against a solution that silently misses either quota.
        for tier, quota in (("spot", spot_volume), ("ltc", ltc_volume)):
            booked = sum(a[tier] for a in alloc.values())
            if abs(booked - quota) > max(1.0, quota * 1e-6):
                return (_allocate_closed_form(routes, spot_volume, ltc_volume),
                        f"closed form (CBC solution failed the {tier} quota check)")
        return alloc, "PuLP CBC"
    except Exception as exc:  # noqa: BLE001 — a solver fault is not a 500
        return (_allocate_closed_form(routes, spot_volume, ltc_volume),
                f"closed form ({exc.__class__.__name__} from PuLP)")


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------

def options():
    """Everything the control panel needs to render itself."""
    base = ml_engine.macro_baseline()
    vlsfo = round(base["brent_usd"] * VLSFO_CRUDE_PARITY, 2)
    return {
        "plants": [{k: p[k] for k in ("id", "name", "short", "state", "godown_rate_inr")}
                   for p in PLANTS],
        "ports": [{k: p[k] for k in
                   ("code", "name", "short", "state", "max_draft_m", "max_dwt",
                    "wait_hours", "tariff_usd_per_t", "demurrage_day_usd",
                    "queue_delay_days", "note")} for p in PORTS],
        "vessels": [{k: v[k] for k in
                     ("id", "name", "dwt", "draft_req_m", "fuel_full_tpd",
                      "fuel_slow_tpd", "scale_freight_factor", "hire_usd_per_day",
                      "note")} for v in VESSELS],
        "suppliers": [{k: s[k] for k in
                       ("id", "name", "grade", "fob_usd_per_t", "sailing_days",
                        "base_freight_usd_per_t", "quality_adj_usd_per_t")}
                      for s in SUPPLIERS],
        "macro": {**base, "vlsfo_usd_per_t": vlsfo},
        # Anchorage queues are IPA reference averages, not telemetry. ML/app.py's
        # scrape target (paradipport.gov.in/vessel_status.aspx) 404s, so no live
        # congestion feed exists to wire up and the UI must not imply one.
        "congestion": {
            "source": "reference",
            "detail": ("Indian Ports Association reference averages. No live "
                       "berth-queue feed is published for these ports."),
            "ports": {p["code"]: p["queue_delay_days"] for p in PORTS},
        },
        # The framework terms the LTC tier is priced on, so the contract ledger
        # can state them rather than hard-coding them in the UI.
        "contract_terms": {
            "default_spot_ratio_pct": DEFAULT_SPOT_RATIO_PCT,
            "ltc_fob_discount_pct": round((1.0 - LTC_FOB_FACTOR) * 100.0, 1),
            "ltc_freight_discount_pct": round((1.0 - LTC_FREIGHT_FACTOR) * 100.0, 1),
        },
        # ML/app.py's sidebar, control for control.
        "defaults": {
            "plant": PLANTS[0]["id"],
            "vessel": VESSELS[0]["id"],
            "volume_t": 150000,
            "spot_ratio_pct": DEFAULT_SPOT_RATIO_PCT,
            # ML/app.py opens the crude slider on the market's own 14-day 95%
            # VaR rather than on zero, so the default view is already a stress
            # test sized by live volatility.
            "crude_shock_pct": base["crude_var_14d_pct"],
            "port_delay_days": 0.0,
            "godown_rate_inr": PLANTS[0]["godown_rate_inr"],
            "slow_steaming": True,
            "track_in_transit": True,
            "voyage_day": DEFAULT_VOYAGE_DAY,
        },
        "limits": {
            "volume_t": {"min": MIN_VOLUME_T, "max": MAX_VOLUME_T, "step": 10000},
            "spot_ratio_pct": {"min": 0, "max": 100, "step": 5},
            # Step 1, as ML/app.py has it — the VaR default is rarely a round
            # multiple of five, and the slider has to be able to sit on it.
            "crude_shock_pct": {"min": -30, "max": 50, "step": 1},
            "port_delay_days": {"min": 0.0, "max": 8.0, "step": 0.5},
            "godown_rate_inr": {"min": 20.0, "max": 120.0, "step": 2.0},
            "voyage_day": {"min": 1, "max": MAX_VOYAGE_DAY, "step": 1},
        },
        "model": ml_engine.model_status(),
    }


def _tactical(forecast, spot_ratio_pct, spot_volume):
    """
    The banner call — ML/app.py's two states, on its +2% threshold.

    Both states name the spot tranche, because that is the only tonnage the
    call is actually about: the LTC baseload is already fixed on framework
    terms and is not exposed to the 14-day freight path either way.
    """
    pct = forecast["change_pct"]
    best_day = forecast["best_entry"]["day"]
    best_when = forecast["best_entry"]["weekday"]
    tranche = f"{spot_ratio_pct:.0f}% spot allocation ({spot_volume:,.0f} MT)"

    if forecast["escalating"]:
        return {
            "level": "critical",
            "action": "ADVANCE SPOT CHARTER BOOKINGS",
            "detail": (f"The 14-day ML engine (R² = {ml_engine.MODEL_R2}) projects freight "
                       f"to rise by {pct:+.2f}%. Lock vessel fixtures immediately for the "
                       f"{tranche} to hedge against rate escalation."),
        }
    return {
        "level": "clear",
        "action": "STAGGER SPOT CHARTER CONTRACTS",
        "detail": (f"14-day freight outlook remains stable/soft ({pct:+.2f}%). Rely on the "
                   f"baseload LTC inventory and schedule spot auction bidding for the "
                   f"{tranche} on day {best_day} ({best_when})."),
    }


def _telemetry(route, vessel, *, tracking, voyage_day, slow_steaming):
    """
    ML/app.py's "Real-Time Mid-Voyage Telemetry" card: a parcel already at sea on
    the allocated routing, and whether the queue waiting for it can still be
    absorbed by easing off the throttle.

    A vessel `voyage_day` days out has `sailing_days - voyage_day` days of
    passage left, and that is the entire budget virtual arrival has to spend:
    slowing down can soak up a queue only up to that many days. Past it the ship
    arrives before the berth frees whatever she does, and the remainder is time
    at anchorage on demurrage. Figures are whole-ship USD, as ML/app.py quotes
    them, not per tonne.
    """
    port = PORT_BY_CODE.get(route["port_code"])
    if not tracking or voyage_day <= 0 or port is None:
        return None

    sailing_days = route["sailing_days"]
    day = int(min(voyage_day, sailing_days))
    days_to_eta = max(0, sailing_days - day)
    queue_days = route["total_wait_days"]
    day_rate = port["demurrage_day_usd"]

    if slow_steaming and days_to_eta >= queue_days:
        absorbed, status = True, "ABSORBED"
        detail = "Virtual arrival covers the whole queue — no time at anchorage."
        exposed_days = 0.0
    elif slow_steaming:
        absorbed, status = False, "PARTIAL"
        exposed_days = round(queue_days - days_to_eta, 1)
        detail = (f"Speed reduction runs out {exposed_days:.1f} days short of the "
                  f"berth window — the ship queues for the remainder.")
    else:
        # Without virtual arrival she steams full ahead and waits it out; only
        # the free laytime is uncharged.
        absorbed, status = False, "EXPOSED"
        exposed_days = round(max(0.0, queue_days - FREE_LAYTIME_DAYS), 1)
        detail = ("Steaming full ahead into an unmitigated queue — everything past "
                  f"{FREE_LAYTIME_DAYS:.0f} days free laytime is on demurrage.")

    return {
        "tracking": True,
        "voyage_day": day,
        "sailing_days": sailing_days,
        "days_to_eta": days_to_eta,
        "progress_pct": round(day / sailing_days * 100.0, 1) if sailing_days else 0.0,
        "supplier": route["supplier"],
        "port_short": route["port_short"],
        "vessel": vessel["name"],
        "queue_days": round(queue_days, 1),
        "absorbable_days": days_to_eta,
        "exposed_days": exposed_days,
        "absorbed": absorbed,
        "status": status,
        "status_detail": detail,
        "demurrage_risk_usd": round(exposed_days * day_rate),
        "demurrage_day_usd": day_rate,
        "slow_steaming": slow_steaming,
    }


def _contract(*, spot_ratio_pct, spot_volume, ltc_volume, spot_best, ltc_best,
              spot_inr, ltc_inr, ltc_discount_inr, forecast):
    """
    ML/app.py's "LTC vs Spot Contract Ledger": what each tier bought, on what
    terms, and when it executes. The comparison rows are that tab's table.
    """
    ltc_ratio_pct = 100.0 - spot_ratio_pct
    best_day = forecast["best_entry"]["day"]
    best_when = f"{forecast['best_entry']['weekday']}, {forecast['best_entry']['date']}"
    fmt = lambda t: f"{t:,.0f} MT"  # noqa: E731

    return {
        "spot_ratio_pct": round(spot_ratio_pct, 1),
        "ltc_ratio_pct": round(ltc_ratio_pct, 1),
        "spot_volume_t": int(round(spot_volume)),
        "ltc_volume_t": int(round(ltc_volume)),
        "spot_inr": round(spot_inr),
        "ltc_inr": round(ltc_inr),
        "spot_crore": round(spot_inr / 1e7, 2),
        "ltc_crore": round(ltc_inr / 1e7, 2),
        # What the framework terms saved against buying that same tonnage,
        # on that same routing, at spot.
        "ltc_discount_inr": round(ltc_discount_inr),
        "ltc_discount_crore": round(ltc_discount_inr / 1e7, 2),
        "fob_discount_pct": round((1.0 - LTC_FOB_FACTOR) * 100.0, 1),
        "freight_discount_pct": round((1.0 - LTC_FREIGHT_FACTOR) * 100.0, 1),
        "execution_day": best_day,
        "execution_date": forecast["best_entry"]["date"],
        "execution_label": best_when,
        "ltc": {
            "title": "Long-term framework contracts",
            "volume_t": int(round(ltc_volume)),
            "ratio_pct": round(ltc_ratio_pct, 1),
            "routing": (f"{ltc_best['supplier']} → {ltc_best['port_short']}"
                        if ltc_best else None),
            "landed_inr_per_t": ltc_best["landed_ltc_inr_per_t"] if ltc_best else None,
            "pricing": ("Quarterly index-linked benchmark with a negotiated "
                        f"{(1.0 - LTC_FOB_FACTOR) * 100:.1f}% volume discount on FOB "
                        f"and {(1.0 - LTC_FREIGHT_FACTOR) * 100:.0f}% off the committed "
                        "freight leg."),
            "demurrage": "Supplier-backed priority discharge windows — near-zero exposure.",
            "rationale": "Blast furnace continuity and supply security.",
        },
        "spot": {
            "title": "Spot auction bidding",
            "volume_t": int(round(spot_volume)),
            "ratio_pct": round(spot_ratio_pct, 1),
            "routing": (f"{spot_best['supplier']} → {spot_best['port_short']}"
                        if spot_best else None),
            "landed_inr_per_t": spot_best["landed_inr_per_t"] if spot_best else None,
            "pricing": ("Live spot freight plus a dynamic vessel fixture auction, "
                        "fired on the model's timing trigger."),
            "demurrage": "Carried by the plant — managed via virtual arrival.",
            "rationale": "Margin enhancement and freight arbitrage.",
        },
        "comparison": [
            {"category": "Tonnage allocated",
             "ltc": fmt(ltc_volume), "spot": fmt(spot_volume)},
            {"category": "Allocation share",
             "ltc": f"{ltc_ratio_pct:.0f}%", "spot": f"{spot_ratio_pct:.0f}%"},
            {"category": "Procurement rationale",
             "ltc": "Blast furnace continuity & supply security",
             "spot": "Margin enhancement & freight arbitrage"},
            {"category": "Execution trigger",
             "ltc": "Quarterly / annual schedule",
             "spot": f"Dynamic ML window (day {best_day})"},
            {"category": "Port demurrage exposure",
             "ltc": "Pre-booked priority berthing slots",
             "spot": "Managed via virtual arrival / slow-steaming"},
        ],
    }


def plan(payload=None):
    """
    Price every routing, allocate the order across both procurement tiers and
    assemble the financial ledger.

    Inputs are ML/app.py's sidebar: plant, volume, the spot/LTC policy split,
    vessel class, Brent crude shock, simulated port congestion spike, plant
    godown rate, the slow-steaming toggle and the mid-voyage telemetry controls.
    BDRY, Brent, VLSFO and USD/INR are live readings, not inputs. Every field is
    optional — a bare `{}` returns the default plan.
    """
    payload = payload if isinstance(payload, dict) else {}

    plant = PLANT_BY_ID.get(payload.get("plant")) or PLANTS[0]
    vessel = VESSEL_BY_ID.get(payload.get("vessel")) or VESSELS[0]
    volume = _clamp(_to_float(payload.get("volume_t"), 150000), MIN_VOLUME_T, MAX_VOLUME_T)
    slow_steaming = bool(payload.get("slow_steaming", True))
    crude_shock = _clamp(_to_float(payload.get("crude_shock_pct"), 0.0), -30.0, 50.0)
    port_delay = _clamp(_to_float(payload.get("port_delay_days"), 0.0), 0.0, 8.0)
    godown = _clamp(_to_float(payload.get("godown_rate_inr"), plant["godown_rate_inr"]),
                    20.0, 120.0)

    # PSU dual-tier split: the slider sets the spot share, LTC takes the rest.
    spot_ratio = _clamp(_to_float(payload.get("spot_ratio_pct"), DEFAULT_SPOT_RATIO_PCT),
                        0.0, 100.0)
    spot_volume = volume * spot_ratio / 100.0
    ltc_volume = volume - spot_volume

    # Mid-voyage telemetry: a parcel already underway on the chosen routing.
    track_in_transit = bool(payload.get("track_in_transit", True))
    voyage_day = int(_clamp(_to_float(payload.get("voyage_day"), DEFAULT_VOYAGE_DAY),
                            1, MAX_VOYAGE_DAY))

    base = ml_engine.macro_baseline()
    brent = base["brent_usd"] * (1.0 + crude_shock / 100.0)
    vlsfo = brent * VLSFO_CRUDE_PARITY
    usd_inr = base["usd_inr"]

    forecast = ml_engine.forecast_index(
        crude_shock_pct=crude_shock, port_delay_days=port_delay,
        vessel_factor=vessel["scale_freight_factor"], godown_rate_inr=godown)

    macro = {
        "bdry": base["bdry"],
        "brent_usd": round(brent, 2),
        "vlsfo_usd_per_t": round(vlsfo, 2),
        "usd_inr": round(usd_inr, 2),
        "crude_shock_pct": crude_shock,
        # The empirical 14-day 95% VaR the shock slider is seeded from, so the
        # panel can say whether the operator is sitting on it or has moved off it.
        "crude_var_14d_pct": base["crude_var_14d_pct"],
        "as_of": base["as_of"],
        "source": base["source"],
        "is_live": base.get("is_live", False),
    }
    inputs = {
        "plant": plant, "vessel": vessel, "volume_t": int(volume),
        "slow_steaming": slow_steaming, "port_delay_days": port_delay,
        "godown_rate_inr": godown, "spot_ratio_pct": spot_ratio,
        "track_in_transit": track_in_transit, "voyage_day": voyage_day,
        "macro": macro,
    }

    # -- price every routing ------------------------------------------------
    routes, infeasible = [], []
    for supplier in SUPPLIERS:
        for port in PORTS:
            priced = _price_route(
                supplier, port, vessel, plant_id=plant["id"], usd_inr=usd_inr,
                vlsfo=vlsfo, slow_steaming=slow_steaming,
                port_delay_days=port_delay, godown_inr=godown)
            row = {
                "id": f"{supplier['id']}-{port['code']}",
                "supplier": supplier["name"],
                "supplier_id": supplier["id"],
                "grade": supplier["grade"],
                "sailing_days": supplier["sailing_days"],
                "port": port["name"],
                "port_short": port["short"],
                "port_code": port["code"],
                "allocated_t": 0,
                "allocated_spot_t": 0,
                "allocated_ltc_t": 0,
                **priced,
            }
            (routes if priced["feasible"] else infeasible).append(row)

    routes.sort(key=lambda r: r["landed_inr_per_t"])
    cheapest_ltc = min(routes, key=lambda r: r["landed_ltc_inr_per_t"]) if routes else None
    for i, r in enumerate(routes):
        r["rank"] = i + 1
        r["premium_inr_per_t"] = round(r["landed_inr_per_t"] - routes[0]["landed_inr_per_t"], 2)
        r["premium_ltc_inr_per_t"] = round(
            r["landed_ltc_inr_per_t"] - cheapest_ltc["landed_ltc_inr_per_t"], 2)

    if not routes:
        return {
            **inputs, "feasible": False,
            "routes": [], "infeasible": infeasible, "allocation": None, "ledger": None,
            "allocation_split": [], "solver": None, "advisory": None,
            "forecast": forecast, "contract": None, "telemetry": None,
            "tactical": {
                "level": "critical",
                "action": "NO FEASIBLE ROUTING",
                "detail": (f"{vessel['name']} cannot berth at any port serving "
                           f"{plant['short']}. Select a smaller vessel class."),
            },
        }

    # -- allocate both tiers (the LP from ML/app.py) ------------------------
    allocation_map, solver = _allocate(routes, spot_volume, ltc_volume)
    for r in routes:
        booked = allocation_map.get(r["id"]) or {}
        r["allocated_spot_t"] = int(round(booked.get("spot", 0.0)))
        r["allocated_ltc_t"] = int(round(booked.get("ltc", 0.0)))
        r["allocated_t"] = r["allocated_spot_t"] + r["allocated_ltc_t"]
        # What this routing's own tonnage actually cost per tonne, across the
        # tiers it won — the number the allocation row should be read on.
        r["blended_inr_per_t"] = round(
            (r["allocated_spot_t"] * r["landed_inr_per_t"]
             + r["allocated_ltc_t"] * r["landed_ltc_inr_per_t"]) / r["allocated_t"], 2
        ) if r["allocated_t"] else None

    best = max(routes, key=lambda r: r["allocated_t"])
    worst = routes[-1]
    split = [r for r in routes if r["allocated_t"] > 0]
    spot_best = max(routes, key=lambda r: r["allocated_spot_t"]) if spot_volume > 0 else None
    ltc_best = max(routes, key=lambda r: r["allocated_ltc_t"]) if ltc_volume > 0 else None

    spot_inr = sum(r["landed_inr_per_t"] * r["allocated_spot_t"] for r in routes)
    ltc_inr = sum(r["landed_ltc_inr_per_t"] * r["allocated_ltc_t"] for r in routes)
    total_inr = spot_inr + ltc_inr
    # What the framework terms are worth: the LTC tonnage repriced at the spot
    # stack on the very same routings, less what it actually cost.
    ltc_discount_inr = sum(r["ltc_discount_inr_per_t"] * r["allocated_ltc_t"] for r in routes)
    baseline_inr = worst["landed_inr_per_t"] * volume
    savings_inr = baseline_inr - total_inr

    # ML/app.py's ledger lines: fuel saved under Virtual Arrival, demurrage
    # paid without it, and the fines a slow-steamed vessel dodged. Demurrage
    # touches the spot tranche only — LTC buys a berthing slot.
    bunker_saved_usd = sum(r["usd_components"]["bunker_saved"] * r["allocated_t"] for r in routes)
    demurrage_paid_usd = sum(r["usd_components"]["demurrage"] * r["allocated_spot_t"] for r in routes)
    demurrage_avoided_usd = sum(
        r["demurrage_avoided_usd_per_t"] * r["allocated_spot_t"] for r in routes)

    ledger = {
        "total_inr": round(total_inr),
        "total_crore": round(total_inr / 1e7, 2),
        "avg_landed_inr_per_t": round(total_inr / volume, 2) if volume else 0.0,
        "baseline_inr_per_t": worst["landed_inr_per_t"],
        "baseline_crore": round(baseline_inr / 1e7, 2),
        "savings_inr": round(savings_inr),
        "savings_crore": round(savings_inr / 1e7, 2),
        "savings_pct": round(savings_inr / baseline_inr * 100.0, 2) if baseline_inr else 0.0,
        "spot_inr": round(spot_inr),
        "ltc_inr": round(ltc_inr),
        "ltc_discount_inr": round(ltc_discount_inr),
        "ltc_discount_crore": round(ltc_discount_inr / 1e7, 2),
        "bunker_saved_usd": round(bunker_saved_usd),
        "demurrage_paid_usd": round(demurrage_paid_usd),
        "demurrage_avoided_usd": round(demurrage_avoided_usd),
        "parcels": max(1, -(-int(volume) // vessel["dwt"])),
        "solver": solver,
    }

    # ML/app.py's "Mid-Voyage Telemetry Advisory", shown past a 2-day spike.
    advisory = None
    if port_delay > 2.0:
        advisory = {
            "title": "Mid-voyage advisory",
            "detail": (f"High port wait ({port_delay:.1f} days added) detected. "
                       + (f"Speed parameters were recalculated to absorb the delay, "
                          f"avoiding ${demurrage_avoided_usd:,.0f} in dead-freight fines."
                          if slow_steaming else
                          f"Steaming full ahead into this queue incurs "
                          f"${demurrage_paid_usd:,.0f} in demurrage — enable Virtual "
                          f"Arrival to absorb it.")),
        }

    return {
        **inputs, "feasible": True,
        "allocation": {
            "supplier": best["supplier"],
            "grade": best["grade"],
            "port": best["port"],
            "port_short": best["port_short"],
            "vessel": vessel["name"],
            "volume_t": int(volume),
            "landed_inr_per_t": best["landed_inr_per_t"],
            "landed_ltc_inr_per_t": best["landed_ltc_inr_per_t"],
            "blended_inr_per_t": best["blended_inr_per_t"],
            "ocean_usd_per_t": best["ocean_usd_per_t"],
            "rail_km": best["rail_km"],
            "sailing_days": best["sailing_days"],
            "queue_delay_days": best["queue_delay_days"],
            "breakdown": best["breakdown"],
            "breakdown_ltc": best["breakdown_ltc"],
        },
        "allocation_split": [
            {"id": r["id"], "supplier": r["supplier"], "port_short": r["port_short"],
             "allocated_t": r["allocated_t"], "allocated_spot_t": r["allocated_spot_t"],
             "allocated_ltc_t": r["allocated_ltc_t"],
             "landed_inr_per_t": r["landed_inr_per_t"],
             "landed_ltc_inr_per_t": r["landed_ltc_inr_per_t"],
             "blended_inr_per_t": r["blended_inr_per_t"]}
            for r in split
        ],
        "solver": solver,
        "routes": routes,
        "infeasible": infeasible,
        "ledger": ledger,
        "advisory": advisory,
        "forecast": forecast,
        "contract": _contract(
            spot_ratio_pct=spot_ratio, spot_volume=spot_volume, ltc_volume=ltc_volume,
            spot_best=spot_best, ltc_best=ltc_best, spot_inr=spot_inr, ltc_inr=ltc_inr,
            ltc_discount_inr=ltc_discount_inr, forecast=forecast),
        "telemetry": _telemetry(
            best, vessel, tracking=track_in_transit, voyage_day=voyage_day,
            slow_steaming=slow_steaming),
        "tactical": _tactical(forecast, spot_ratio, spot_volume),
    }
