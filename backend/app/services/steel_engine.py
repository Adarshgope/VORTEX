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

with no per-route capacity. The optimum of that program is degenerate: the whole
requirement goes to the single cheapest feasible routing. That closed form is
what is computed here, so the result is identical to the PuLP solve without
taking on the solver dependency — and every other routing is still returned,
priced and ranked, so the operator sees what was rejected and by how much.

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
    PORT_BY_CODE,
    PORTS,
    RAIL_BY_PAIR,
    RAIL_FALLBACK,
    SUPPLIER_BY_ID,
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


def _price_route(supplier, port, vessel, plant, *, usd_inr, vlsfo, freight_factor,
                 slow_steaming):
    """Full landed cost for one origin/port pair. Returns None when infeasible."""
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
    delay_days = port["live_delay_days"]
    total_wait_days = port["wait_hours"] / 24.0 + delay_days

    if slow_steaming:
        # Virtual arrival: slow down to meet the berth window. No anchorage
        # demurrage, but the longer passage is paid for in charter hire.
        demurrage = 0.0
        extra_charter = delay_days * vessel["hire_usd_per_day"] / dwt
        bunker_saved = ((vessel["fuel_full_tpd"] - vessel["fuel_slow_tpd"])
                        * supplier["sailing_days"] * vlsfo) / dwt
    else:
        chargeable_days = max(0.0, total_wait_days - FREE_LAYTIME_DAYS)
        demurrage = chargeable_days * port["demurrage_day_usd"] / dwt
        extra_charter = 0.0
        bunker_saved = 0.0

    freight = (supplier["base_freight_usd_per_t"]
               * vessel["scale_freight_factor"] * freight_factor)

    ocean_usd = (supplier["fob_usd_per_t"] + freight
                 + supplier["quality_adj_usd_per_t"] + port["tariff_usd_per_t"]
                 + demurrage + extra_charter - bunker_saved)

    rail_inr, rail_km, rail_published = _rail_leg(port["code"], plant["id"])
    godown_inr = plant["godown_rate_inr"]
    landed_inr = ocean_usd * usd_inr + rail_inr + godown_inr

    return {
        "feasible": True,
        "reason": f"Clear to berth at {port['short']}",
        "ocean_usd_per_t": round(ocean_usd, 2),
        "landed_inr_per_t": round(landed_inr, 2),
        "rail_km": rail_km,
        "rail_published": rail_published,
        "total_wait_days": round(total_wait_days, 2),
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
                    "live_delay_days", "note")} for p in PORTS],
        "vessels": [{k: v[k] for k in
                     ("id", "name", "dwt", "draft_req_m", "fuel_full_tpd",
                      "fuel_slow_tpd", "scale_freight_factor", "hire_usd_per_day",
                      "note")} for v in VESSELS],
        "suppliers": [{k: s[k] for k in
                       ("id", "name", "grade", "fob_usd_per_t", "sailing_days",
                        "base_freight_usd_per_t", "quality_adj_usd_per_t")}
                      for s in SUPPLIERS],
        "macro": {**base, "vlsfo_usd_per_t": vlsfo},
        "defaults": {
            "plant": PLANTS[0]["id"],
            "vessel": VESSELS[0]["id"],
            "volume_t": 150000,
            "crude_shock_pct": 0.0,
            "vlsfo_usd_per_t": vlsfo,
            "usd_inr": base["usd_inr"],
            "bdry": base["bdry"],
            "slow_steaming": True,
            "horizon": 14,
        },
        "limits": {
            "volume_t": {"min": MIN_VOLUME_T, "max": MAX_VOLUME_T, "step": 10000},
            "crude_shock_pct": {"min": -30, "max": 50, "step": 5},
            "vlsfo_usd_per_t": {"min": round(vlsfo * 0.55), "max": round(vlsfo * 1.75),
                                "step": 5},
            "usd_inr": {"min": round(base["usd_inr"] * 0.9, 1),
                        "max": round(base["usd_inr"] * 1.1, 1), "step": 0.25},
            "bdry": {"min": round(base["bdry"] * 0.5, 1),
                     "max": round(base["bdry"] * 1.8, 1), "step": 0.05},
        },
        "model": ml_engine.model_status(),
    }


def _tactical(change_pct, best_entry, horizon):
    """The banner call, on the same thresholds ML/app.py uses."""
    if change_pct > 2.0:
        return {
            "level": "critical",
            "action": "ADVANCE SPOT CHARTER BOOKINGS",
            "detail": (f"The {horizon}-day model projects freight up {change_pct:+.2f}%. "
                       f"Lock vessel fixtures now to hedge the escalation."),
        }
    if change_pct < -2.0:
        return {
            "level": "clear",
            "action": "DEFER FIXTURES — BUY SPOT",
            "detail": (f"Freight is projected {change_pct:+.2f}% over {horizon} days, "
                       f"with the low on day {best_entry['day']}. Run down buffer stock "
                       f"and fix against the dip."),
        }
    return {
        "level": "warning",
        "action": "STAGGER CHARTER CONTRACTS",
        "detail": (f"Outlook is range-bound at {change_pct:+.2f}% over {horizon} days. "
                   f"Split the requirement and negotiate spot discounts."),
    }


def plan(payload=None):
    """
    Price every routing, allocate the order and assemble the financial ledger.

    Every field is optional — a bare `{}` returns the default Rourkela plan.
    """
    payload = payload if isinstance(payload, dict) else {}

    plant = PLANT_BY_ID.get(payload.get("plant")) or PLANTS[0]
    vessel = VESSEL_BY_ID.get(payload.get("vessel")) or VESSELS[0]
    volume = _clamp(_to_float(payload.get("volume_t"), 150000), MIN_VOLUME_T, MAX_VOLUME_T)
    slow_steaming = bool(payload.get("slow_steaming", True))

    base = ml_engine.macro_baseline()
    crude_shock = _clamp(_to_float(payload.get("crude_shock_pct"), 0.0), -30.0, 50.0)
    brent = base["brent_usd"] * (1.0 + crude_shock / 100.0)

    # The bunker slider defaults to Brent parity but may be driven independently.
    vlsfo = _to_float(payload.get("vlsfo_usd_per_t"), None)
    if vlsfo is None:
        vlsfo = brent * VLSFO_CRUDE_PARITY
    vlsfo = _clamp(vlsfo, 50.0, 3000.0)

    usd_inr = _clamp(_to_float(payload.get("usd_inr"), base["usd_inr"]), 40.0, 200.0)
    bdry = _clamp(_to_float(payload.get("bdry"), base["bdry"]), 4.0, 60.0)

    # Ocean freight tracks the freight index: ML/app.py's supplier base rates are
    # quoted at the baseline index level, so a move in BDRY scales them.
    freight_factor = bdry / base["bdry"] if base["bdry"] else 1.0

    horizon = 30 if _to_float(payload.get("horizon"), 14) >= 22 else 14
    forecast = ml_engine.forecast_index(
        horizon=horizon, crude_shock_pct=crude_shock, bdry_level=bdry)

    # -- price every routing ------------------------------------------------
    routes, infeasible = [], []
    for supplier in SUPPLIERS:
        for port in PORTS:
            priced = _price_route(
                supplier, port, vessel, plant,
                usd_inr=usd_inr, vlsfo=vlsfo, freight_factor=freight_factor,
                slow_steaming=slow_steaming)
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
            "feasible": False,
            "plant": plant, "vessel": vessel, "volume_t": volume,
            "macro": {"bdry": round(bdry, 2), "brent_usd": round(brent, 2),
                      "vlsfo_usd_per_t": round(vlsfo, 2), "usd_inr": round(usd_inr, 2),
                      "crude_shock_pct": crude_shock, "as_of": base["as_of"]},
            "routes": [], "infeasible": infeasible, "allocation": None, "ledger": None,
            "forecast": forecast,
            "tactical": {
                "level": "critical",
                "action": "NO FEASIBLE ROUTING",
                "detail": (f"{vessel['name']} cannot berth at any port serving "
                           f"{plant['short']}. Select a smaller vessel class."),
            },
            "slow_steaming": slow_steaming,
        }

    # -- allocate (closed form of the LP) -----------------------------------
    best = routes[0]
    best["allocated_t"] = int(volume)
    worst = routes[-1]

    total_inr = best["landed_inr_per_t"] * volume
    baseline_inr = worst["landed_inr_per_t"] * volume
    savings_inr = baseline_inr - total_inr

    # What the Virtual Arrival toggle is actually worth: re-price the chosen
    # routing the other way round and take the difference.
    counterfactual = _price_route(
        SUPPLIER_BY_ID[best["supplier_id"]], PORT_BY_CODE[best["port_code"]],
        vessel, plant, usd_inr=usd_inr, vlsfo=vlsfo, freight_factor=freight_factor,
        slow_steaming=not slow_steaming)
    virtual_arrival_inr = (
        (counterfactual["landed_inr_per_t"] - best["landed_inr_per_t"]) * volume
        if counterfactual.get("feasible") else 0.0)

    bunker_saved_usd = (
        (vessel["fuel_full_tpd"] - vessel["fuel_slow_tpd"])
        * SUPPLIER_BY_ID[best["supplier_id"]]["sailing_days"] * vlsfo
        / vessel["dwt"] * volume) if slow_steaming else 0.0

    ledger = {
        "total_inr": round(total_inr),
        "total_crore": round(total_inr / 1e7, 2),
        "avg_landed_inr_per_t": best["landed_inr_per_t"],
        "baseline_inr_per_t": worst["landed_inr_per_t"],
        "baseline_crore": round(baseline_inr / 1e7, 2),
        "savings_inr": round(savings_inr),
        "savings_crore": round(savings_inr / 1e7, 2),
        "savings_pct": round(savings_inr / baseline_inr * 100.0, 2) if baseline_inr else 0.0,
        "virtual_arrival_inr": round(virtual_arrival_inr),
        "virtual_arrival_crore": round(virtual_arrival_inr / 1e7, 2),
        "bunker_saved_usd": round(bunker_saved_usd),
        "parcels": max(1, -(-int(volume) // vessel["dwt"])),
    }

    return {
        "feasible": True,
        "plant": plant,
        "vessel": vessel,
        "volume_t": int(volume),
        "slow_steaming": slow_steaming,
        "macro": {
            "bdry": round(bdry, 2),
            "brent_usd": round(brent, 2),
            "vlsfo_usd_per_t": round(vlsfo, 2),
            "usd_inr": round(usd_inr, 2),
            "crude_shock_pct": crude_shock,
            "freight_factor": round(freight_factor, 4),
            "as_of": base["as_of"],
        },
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
            "breakdown": best["breakdown"],
        },
        "routes": routes,
        "infeasible": infeasible,
        "ledger": ledger,
        "forecast": forecast,
        "tactical": _tactical(forecast["change_pct"], forecast["best_entry"], horizon),
    }
