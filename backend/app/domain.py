"""
Ministry of Steel — bulk cargo sourcing reference data.

Everything here is lifted from the SteelNav prototype (`ML/app.py`): the four
east-coast discharge ports that serve the integrated steel plants, the FOIS rail
legs inland, the dry-bulk classes that can work those berths, and the three
seaborne coking/thermal coal origins.

Money conventions
-----------------
* Seaborne legs are quoted in USD/tonne and converted at the working USD/INR.
* Inland rail (FOIS) and stockyard holding are already INR/tonne.
* `demurrage_day_usd` is a whole-ship day rate, spread over the parcel.
"""

# ---------------------------------------------------------------------------
# Discharge ports. draft/dwt are the governing berth constraints; wait_hours is
# the historic average anchorage queue before a berth frees up.
#
# `queue_delay_days` is the additional anchorage backlog carried on top of
# wait_hours. ML/app.py calls its equivalent a "live" figure and tries to scrape
# it from https://paradipport.gov.in/vessel_status.aspx — that page returns 404,
# so the scrape never matched anything and the values below are exactly the
# constants its except-branch fell back to. They are Indian Ports Association
# reference averages, not a live feed, and the API reports them as such
# (`congestion.source == "reference"`); the field was renamed off "live_" so the
# payload stops implying a telemetry link that does not exist.
# ---------------------------------------------------------------------------

PORTS = [
    {
        "code": "INDHM", "name": "Dhamra Port", "short": "Dhamra", "state": "Odisha",
        "max_draft_m": 18.5, "max_dwt": 180000, "wait_hours": 12.0,
        "tariff_usd_per_t": 3.40, "demurrage_day_usd": 25000, "queue_delay_days": 0.5,
        "note": "Deepest private berth on the coast; shortest queue.",
    },
    {
        "code": "INPRT", "name": "Paradip Port", "short": "Paradip", "state": "Odisha",
        "max_draft_m": 17.1, "max_dwt": 180000, "wait_hours": 18.5,
        "tariff_usd_per_t": 2.80, "demurrage_day_usd": 25000, "queue_delay_days": 1.5,
        "note": "Lowest tariff; mechanised coal handling plant.",
    },
    {
        "code": "INVTZ", "name": "Visakhapatnam Port", "short": "Vizag",
        "state": "Andhra Pradesh",
        "max_draft_m": 18.1, "max_dwt": 200000, "wait_hours": 24.2,
        "tariff_usd_per_t": 3.10, "demurrage_day_usd": 28000, "queue_delay_days": 2.0,
        "note": "Only berth on the coast built for 200k DWT; feeds RINL by conveyor.",
    },
    {
        "code": "INHLD", "name": "Haldia Dock Complex", "short": "Haldia",
        "state": "West Bengal",
        "max_draft_m": 11.5, "max_dwt": 65000, "wait_hours": 38.4,
        "tariff_usd_per_t": 4.20, "demurrage_day_usd": 20000, "queue_delay_days": 3.0,
        "note": "Riverine draft limit caps intake at Supramax; longest queue.",
    },
]

# ---------------------------------------------------------------------------
# Destination steel plants. godown_rate_inr is ground rent plus yard handling
# and the working-capital charge on stock held at the plant, in INR/tonne.
# ---------------------------------------------------------------------------

PLANTS = [
    {"id": "rourkela", "name": "SAIL Rourkela Steel Plant", "short": "Rourkela",
     "state": "Odisha", "godown_rate_inr": 48.0},
    {"id": "bokaro", "name": "SAIL Bokaro Steel Plant", "short": "Bokaro",
     "state": "Jharkhand", "godown_rate_inr": 42.0},
    {"id": "vizag", "name": "RINL Vizag Steel Plant", "short": "RINL Vizag",
     "state": "Andhra Pradesh", "godown_rate_inr": 35.0},
]

# ---------------------------------------------------------------------------
# FOIS rail legs, port -> plant. Rates are the published freight per tonne.
# ---------------------------------------------------------------------------

RAIL_LEGS = [
    {"port": "INDHM", "plant": "rourkela", "distance_km": 330, "fois_inr_per_t": 630.0},
    {"port": "INPRT", "plant": "rourkela", "distance_km": 365, "fois_inr_per_t": 680.0},
    {"port": "INHLD", "plant": "rourkela", "distance_km": 420, "fois_inr_per_t": 790.0},
    {"port": "INVTZ", "plant": "rourkela", "distance_km": 680, "fois_inr_per_t": 1180.0},

    {"port": "INHLD", "plant": "bokaro", "distance_km": 370, "fois_inr_per_t": 695.0},
    {"port": "INDHM", "plant": "bokaro", "distance_km": 450, "fois_inr_per_t": 820.0},
    {"port": "INPRT", "plant": "bokaro", "distance_km": 480, "fois_inr_per_t": 870.0},
    {"port": "INVTZ", "plant": "bokaro", "distance_km": 790, "fois_inr_per_t": 1340.0},

    {"port": "INVTZ", "plant": "vizag", "distance_km": 25, "fois_inr_per_t": 95.0},
    {"port": "INPRT", "plant": "vizag", "distance_km": 550, "fois_inr_per_t": 980.0},
    {"port": "INDHM", "plant": "vizag", "distance_km": 610, "fois_inr_per_t": 1090.0},
    {"port": "INHLD", "plant": "vizag", "distance_km": 890, "fois_inr_per_t": 1520.0},
]

# Charged when no published leg exists — deliberately punitive so the optimiser
# never quietly prefers an unmapped routing.
RAIL_FALLBACK = {"distance_km": 950.0, "fois_inr_per_t": 1800.0}

# ---------------------------------------------------------------------------
# Vessel classes. scale_freight_factor is the USD/t freight premium a smaller
# hull carries over a Capesize on the same leg; fuel figures are tonnes/day at
# full speed and at slow-steaming speed.
# ---------------------------------------------------------------------------

VESSELS = [
    {"id": "capesize", "name": "Capesize", "dwt": 170000, "draft_req_m": 17.5,
     "fuel_full_tpd": 45.0, "fuel_slow_tpd": 26.0, "scale_freight_factor": 1.00,
     "hire_usd_per_day": 25000,
     "note": "Cheapest per tonne, but only Dhamra, Vizag and Paradip can berth her."},
    {"id": "panamax", "name": "Panamax", "dwt": 75000, "draft_req_m": 13.0,
     "fuel_full_tpd": 28.0, "fuel_slow_tpd": 16.0, "scale_freight_factor": 1.35,
     "hire_usd_per_day": 17000,
     "note": "The workhorse; clears every east-coast berth except Haldia."},
    {"id": "supramax", "name": "Supramax", "dwt": 58000, "draft_req_m": 10.5,
     "fuel_full_tpd": 22.0, "fuel_slow_tpd": 13.0, "scale_freight_factor": 1.60,
     "hire_usd_per_day": 13500,
     "note": "The only class Haldia's river draft accepts."},
]

# ---------------------------------------------------------------------------
# Seaborne origins. base_freight_usd is the Capesize reference rate on the leg
# at the baseline freight index; quality_adj prices the coal grade against a
# premium hard coking benchmark.
# ---------------------------------------------------------------------------

SUPPLIERS = [
    {"id": "australia", "name": "Australia", "grade": "Premium Hard Coking",
     "fob_usd_per_t": 222.0, "sailing_days": 14,
     "base_freight_usd_per_t": 16.5, "quality_adj_usd_per_t": 0.0},
    {"id": "south_africa", "name": "South Africa", "grade": "Semi-Soft Coking",
     "fob_usd_per_t": 210.0, "sailing_days": 18,
     "base_freight_usd_per_t": 19.0, "quality_adj_usd_per_t": 4.5},
    {"id": "indonesia", "name": "Indonesia", "grade": "Sub-bituminous Thermal",
     "fob_usd_per_t": 196.0, "sailing_days": 9,
     "base_freight_usd_per_t": 13.0, "quality_adj_usd_per_t": 10.0},
]

# Barrels of Brent to a tonne of VLSFO — the parity ML/app.py prices bunkers on.
VLSFO_CRUDE_PARITY = 7.33

# Laytime allowed before demurrage starts running, in days.
FREE_LAYTIME_DAYS = 2.0

# ---------------------------------------------------------------------------
# PSU dual-tier procurement framework.
#
# SAIL and RINL buy on two tiers at once: a long-term framework contract (LTC)
# that carries the baseload and protects blast-furnace continuity, and spot
# auction tenders that chase freight dips. ML/app.py prices the LTC leg as a
# negotiated discount on the same stack — 4.5% off FOB and 4% off ocean freight
# for the committed volume — and with no demurrage or extra charter hire at all,
# because the framework buys pre-booked priority berthing slots and the supplier
# carries the discharge window.
# ---------------------------------------------------------------------------

LTC_FOB_FACTOR = 0.955          # 4.5% long-term volume discount on FOB cargo
LTC_FREIGHT_FACTOR = 0.96       # 4% off the ocean freight leg on committed tonnage
DEFAULT_SPOT_RATIO_PCT = 30     # the PSU standard 70:30 LTC:spot split

PORT_BY_CODE = {p["code"]: p for p in PORTS}
PLANT_BY_ID = {p["id"]: p for p in PLANTS}
VESSEL_BY_ID = {v["id"]: v for v in VESSELS}
SUPPLIER_BY_ID = {s["id"]: s for s in SUPPLIERS}
RAIL_BY_PAIR = {(r["port"], r["plant"]): r for r in RAIL_LEGS}
