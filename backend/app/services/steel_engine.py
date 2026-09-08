"""
Bulk cargo sourcing & freight optimiser.

A direct port of the decision engine in `ML/app.py`: for a given steel plant,
order volume and vessel class, price every (seaborne origin x discharge port)
routing all the way to the plant stockyard, then allocate the order.

The allocation
--------------
`ML/app.py` states the LP as

    minimise  sum_r  x_r * landed_cost_r
    s.t.      sum_r  x_r = demand,   x_r >= 0

with no per-route capacity. That same program is handed to PuLP's CBC solver
here, so the allocation is a genuine LP solve rather than an imitation of one.

The optimum is degenerate — with no capacity ceiling the whole requirement goes
to the single cheapest feasible routing — so the closed form agrees with CBC to
the tonne. That closed form is kept as the fallback for an environment without
PuLP, and `ledger.solver` records which one produced the answer. Every other
routing is still returned, priced and ranked, so the operator sees what was
rejected and by how much.

Cost stack, per tonne
---------------------
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
"""

from ..domain import (
    FREE_LAYTIME_DAYS,
    PLANT_BY_ID,
    PLANTS,
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
    """Full landed cost for one origin/port pair. Infeasible routings say why."""
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

    ocean_usd = (supplier["fob_usd_per_t"] + freight
                 + supplier["quality_adj_usd_per_t"] + port["tariff_usd_per_t"]
                 + demurrage + extra_charter - bunker_saved)

    rail_inr, rail_km, rail_published = _rail_leg(port["code"], plant_id)
    landed_inr = ocean_usd * usd_inr + rail_inr + godown_inr

    return {
        "feasible": True,
        "reason": f"Clear to berth at {port['short']}",
        "ocean_usd_per_t": round(ocean_usd, 2),
        "landed_inr_per_t": round(landed_inr, 2),
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
        "usd_components": {
            "fob": supplier["fob_usd_per_t"],
            "freight": round(freight, 2),
            "grade_adj": supplier["quality_adj_usd_per_t"],
            "tariff": port["tariff_usd_per_t"],
            "demurrage": round(demurrage, 2),
            "extra_charter": round(extra_charter, 2),
            "bunker_saved": round(bunker_saved, 2),
        },
    }


# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------

def _allocate_closed_form(routes, volume):
    """Whole requirement to the cheapest routing — the LP's degenerate optimum."""
    return {routes[0]["id"]: float(volume)}


def _allocate(routes, volume):
    """
    Solve ML/app.py's allocation program:

        minimise  sum_r  x_r * landed_inr_per_t_r
        s.t.      sum_r  x_r == volume
                  x_r >= 0

    Returns (allocation by route id, solver label). `routes` must be sorted
    cheapest-first so the fallback picks the right one.

    Any failure — PuLP absent, no CBC binary, a non-optimal status, a solution
    that does not add up — drops to the closed form rather than surfacing a
    solver problem as a broken sourcing plan.
    """
    try:
        import pulp as pl
    except Exception:  # noqa: BLE001
        return _allocate_closed_form(routes, volume), "closed form (PuLP not installed)"

    try:
        problem = pl.LpProblem("VORTEX_sourcing_allocation", pl.LpMinimize)
        ids = [r["id"] for r in routes]
        cost = {r["id"]: r["landed_inr_per_t"] for r in routes}
        x = pl.LpVariable.dicts("allocated_t", ids, lowBound=0, cat="Continuous")

        problem += pl.lpSum(x[i] * cost[i] for i in ids)          # objective
        problem += pl.lpSum(x[i] for i in ids) == volume          # meet the order

        problem.solve(pl.PULP_CBC_CMD(msg=False))
        status = pl.LpStatus[problem.status]
        if status != "Optimal":
            return (_allocate_closed_form(routes, volume),
                    f"closed form (CBC returned {status})")

        alloc = {i: float(x[i].varValue or 0.0) for i in ids}
        # Guard against a solution that silently misses the demand constraint.
        if abs(sum(alloc.values()) - volume) > max(1.0, volume * 1e-6):
            return (_allocate_closed_form(routes, volume),
                    "closed form (CBC solution failed the demand check)")
        return alloc, "PuLP CBC"
    except Exception as exc:  # noqa: BLE001 — a solver fault is not a 500
        return (_allocate_closed_form(routes, volume),
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
        # ML/app.py's sidebar, control for control.
        "defaults": {
            "plant": PLANTS[0]["id"],
            "vessel": VESSELS[0]["id"],
            "volume_t": 150000,
            "crude_shock_pct": 0.0,
            "port_delay_days": 0.0,
            "godown_rate_inr": PLANTS[0]["godown_rate_inr"],
            "slow_steaming": True,
        },
        "limits": {
            "volume_t": {"min": MIN_VOLUME_T, "max": MAX_VOLUME_T, "step": 10000},
            "crude_shock_pct": {"min": -30, "max": 50, "step": 5},
            "port_delay_days": {"min": 0.0, "max": 8.0, "step": 0.5},
            "godown_rate_inr": {"min": 20.0, "max": 120.0, "step": 2.0},
        },
        "model": ml_engine.model_status(),
    }


def _tactical(forecast):
    """The banner call — ML/app.py's two states, on its +2% threshold."""
    pct = forecast["change_pct"]
    if forecast["escalating"]:
        return {
            "level": "critical",
            "action": "ADVANCE SPOT CHARTER BOOKINGS",
            "detail": (f"The 14-day ML engine (R² = {ml_engine.MODEL_R2}) projects freight "
                       f"to rise by {pct:+.2f}%. Lock vessel fixtures immediately to hedge "
                       f"against escalation."),
        }
    return {
        "level": "clear",
        "action": "STAGGER CHARTER CONTRACTS",
        "detail": (f"14-day freight outlook remains stable/soft ({pct:+.2f}%). Rely on "
                   f"safety buffer stock and negotiate spot charter discounts."),
    }


def plan(payload=None):
    """
    Price every routing, allocate the order and assemble the financial ledger.

    Inputs are ML/app.py's sidebar: plant, volume, vessel class, Brent crude
    shock, simulated port congestion spike, plant godown rate and the slow-
    steaming toggle. BDRY, Brent, VLSFO and USD/INR are live readings, not
    inputs. Every field is optional — a bare `{}` returns the default plan.
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
        "as_of": base["as_of"],
        "source": base["source"],
        "is_live": base.get("is_live", False),
    }
    inputs = {
        "plant": plant, "vessel": vessel, "volume_t": int(volume),
        "slow_steaming": slow_steaming, "port_delay_days": port_delay,
        "godown_rate_inr": godown, "macro": macro,
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
                **priced,
            }
            (routes if priced["feasible"] else infeasible).append(row)

    routes.sort(key=lambda r: r["landed_inr_per_t"])
    for i, r in enumerate(routes):
        r["rank"] = i + 1
        r["premium_inr_per_t"] = round(r["landed_inr_per_t"] - routes[0]["landed_inr_per_t"], 2)

    if not routes:
        return {
            **inputs, "feasible": False,
            "routes": [], "infeasible": infeasible, "allocation": None, "ledger": None,
            "allocation_split": [], "solver": None, "advisory": None,
            "forecast": forecast,
            "tactical": {
                "level": "critical",
                "action": "NO FEASIBLE ROUTING",
                "detail": (f"{vessel['name']} cannot berth at any port serving "
                           f"{plant['short']}. Select a smaller vessel class."),
            },
        }

    # -- allocate (the LP from ML/app.py) -----------------------------------
    allocation_map, solver = _allocate(routes, volume)
    for r in routes:
        r["allocated_t"] = int(round(allocation_map.get(r["id"], 0.0)))
    best = max(routes, key=lambda r: r["allocated_t"])
    worst = routes[-1]
    split = [r for r in routes if r["allocated_t"] > 0]

    total_inr = sum(r["landed_inr_per_t"] * r["allocated_t"] for r in routes)
    baseline_inr = worst["landed_inr_per_t"] * volume
    savings_inr = baseline_inr - total_inr

    # ML/app.py's ledger lines: fuel saved under Virtual Arrival, demurrage
    # paid without it, and the fines a slow-steamed vessel dodged.
    bunker_saved_usd = best["usd_components"]["bunker_saved"] * volume
    demurrage_paid_usd = best["usd_components"]["demurrage"] * volume
    demurrage_avoided_usd = best["demurrage_avoided_usd_per_t"] * volume

    ledger = {
        "total_inr": round(total_inr),
        "total_crore": round(total_inr / 1e7, 2),
        "avg_landed_inr_per_t": round(total_inr / volume, 2) if volume else 0.0,
        "baseline_inr_per_t": worst["landed_inr_per_t"],
        "baseline_crore": round(baseline_inr / 1e7, 2),
        "savings_inr": round(savings_inr),
        "savings_crore": round(savings_inr / 1e7, 2),
        "savings_pct": round(savings_inr / baseline_inr * 100.0, 2) if baseline_inr else 0.0,
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
            "ocean_usd_per_t": best["ocean_usd_per_t"],
            "rail_km": best["rail_km"],
            "sailing_days": best["sailing_days"],
            "queue_delay_days": best["queue_delay_days"],
            "breakdown": best["breakdown"],
        },
        "allocation_split": [
            {"id": r["id"], "supplier": r["supplier"], "port_short": r["port_short"],
             "allocated_t": r["allocated_t"], "landed_inr_per_t": r["landed_inr_per_t"]}
            for r in split
        ],
        "solver": solver,
        "routes": routes,
        "infeasible": infeasible,
        "ledger": ledger,
        "advisory": advisory,
        "forecast": forecast,
        "tactical": _tactical(forecast),
    }
