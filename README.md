# VORTEX

**Vessel Optimization & Rate Tracking for East-coast eXports/imports**
Smart India Hackathon 2026 · Problem Statement **SIH26006**

Predictive freight analytics for bulk cargo chartering across India's eastern
seaboard — forecast rate volatility, respect port constraint envelopes, pick the
right vessel class, and price the cargo all the way to the godown.

---

## Running it

Two processes: Flask on **5050**, Vite on **5173**. The Vite dev server proxies
`/api` to Flask, so the browser only ever talks to its own origin — there is no
API port to configure on the frontend side unless the backend is somewhere
unusual.

### Both at once

```bash
./start_dev.sh                     # or: cd frontend && npm run dev:full
```

It creates the backend virtualenv if missing, installs requirements, copies the
trained freight models out of `../ML` into `backend/app/ml_models/` on first run,
steps past a busy port, and starts Flask and Vite together with the frontend
already pointed at the API. `Ctrl-C` stops both. `--backend` / `--frontend` run
one side only.

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py                      # http://localhost:5050
```

> **Why 5050 and not Flask's usual 5000:** on macOS, Control Center's AirPlay
> Receiver owns port 5000 and answers every HTTP request with an empty `403`. A
> frontend pointed there falls silently into demo mode — every panel renders,
> nothing is real, and the only tell is the **DEMO MODE** pill in the header.
> `run.py` refuses to start on a busy port and says what to do instead.

### Frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173 — proxies /api → :5050
```

If the backend is on a non-default port, point the dev proxy at it:

```bash
VITE_API_URL=http://127.0.0.1:5051 npm run dev
```

If the header pill reads **DEMO MODE**, the browser is not reaching Flask. Hover
the pill: it names the URL it tried and the status it got.

### Signing in

Register a new account, or use the seeded demo desk:

```
demo@vortex.in  /  vortex2026
```

The login screen also has an **Explore with the demo desk** button that skips the
API entirely.

---

## MongoDB

The connection string is intentionally **empty** so you can paste your Atlas
credentials in. Open `backend/app/config.py`:

```python
MONGO_URI = os.environ.get("MONGO_URI", "")   # ← paste your Atlas URI here
```

or export it instead:

```bash
export MONGO_URI="mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
```

With no URI the app runs on an in-memory store with the same interface, so
registration and login work out of the box. `GET /api/health` reports which
backing store is live.

---

## What's in it

### Module 1 — Scroll-driven landing page

One pinned GSAP `ScrollTrigger` timeline drives a five-stage story:

| Stage | What happens |
|-------|--------------|
| **1 · Hero** | The VORTEX container hangs on heavy chains over an animated deep-sea swell |
| **2 · Deck landing** | A cargo vessel enters from the left and stops beneath it; her three deck containers read **RELIABLE**, **ACCURATE**, **TRUSTED** |
| **2 · The drop** | The chains pay out at a steady pace, the container seats on the stack, and the frame shudders on impact as the twist-locks engage |
| **3 · Outro** | A gold wipe hands over to the outbound leg; the fully stacked vessel glides right to left with specular sweeps and a gentle container vibration |
| **4 · About** | Two-column block: illustrated terminal with a floating trust card, plus the platform pitch and six capability bullets |
| **5 · Footer** | Deep navy, social links, suggestion box, contact |

The whole scene is laid out in a fixed 1280×720 coordinate space
(`src/lib/scene.js`) and scaled to the viewport — that is what makes the
container land exactly on the stack at any screen size. `prefers-reduced-motion`
skips the choreography and renders the final composition.

### Module 2 — Sourcing dashboard

Controls on the left, the decision on the right across four tabs.

| Region | Contents |
|---|---|
| **Control rail** | `ML/app.py`'s sidebar, control for control: destination steel plant (SAIL Rourkela / SAIL Bokaro / RINL Vizag), order volume, the spot/LTC policy split, vessel class, the three stress-test sliders (Brent crude shock %, simulated port congestion spike in days, plant godown rate ₹/MT), the Virtual Arrival toggle and the mid-voyage telemetry controls. BDRY, Brent, VLSFO and USD/INR are live readings, not inputs |
| **Tactical banner** | The procurement call — ADVANCE SPOT CHARTER BOOKINGS above a +2% projected move, STAGGER SPOT CHARTER CONTRACTS otherwise: `ML/app.py`'s two states on its threshold, each naming the spot tranche it applies to |
| **Metrics bar** | Live BDRY with its 14-day target, Brent crude $/bbl, VLSFO bunker $/MT, USD/INR |
| **Optimal sourcing plan** | Every feasible origin × discharge-port routing, ranked and priced to the plant on both tiers: supplier origin, discharge port, the LTC and spot tonnage it won, ocean and FOIS rail legs, spot ₹/MT, LTC ₹/MT, premium over rank 1 |
| **Mid-voyage telemetry** | `ML/app.py`'s in-transit card for the allocated routing: passage progress, days to ETA, the queue at the discharge port, how much of it slowing down can still absorb, and the demurrage exposed if it cannot |
| **LTC vs spot ledger** | The dual-tier split: tonnage, spend and routing per tier, the framework's pricing and berthing terms, what the LTC discount is worth, and the side-by-side comparison table |
| **Multi-modal cost stack** | The allocated routing split into FOB, ocean freight, grade adjustment, port handling, demurrage, rail and godown, in ₹/MT |
| **Financial ledger** | Procurement budget in ₹ crores and average landed cost, split across the framework and spot tranches; fuel saved and demurrage eliminated under Virtual Arrival, or demurrage paid without it; the mid-voyage advisory once a congestion spike passes two days |
| **Freight index forecast** | `ML/app.py`'s 14-day tactical engine: realised BDRY flowing into the forward curve, the optimal charter window, its four timing metrics and the day-by-day procurement schedule with green / amber / red signals |

Slider moves re-post the whole scenario, so every panel updates together.

---

## API

All routes are under `/api`. `flask-cors` is used when installed; otherwise the
app adds the headers itself.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Service, database and ML model status |
| GET | `/api/steel/options` | Plants, ports, vessel classes, origins, macro baseline, contract terms, slider ranges |
| POST | `/api/steel/plan` | **The optimiser** — ranked routings, dual-tier allocation, contract ledger, mid-voyage telemetry, financial ledger and forecast |
| POST | `/api/predict/freight` | **ML** 14-day BDRY forecast: forward curve, optimal booking day, day-by-day signals |
| GET | `/api/predict/freight` | Same forecast from a query string — `?crude_shock_pct=10&port_delay_days=2` |
| GET | `/api/predict/status` | Model health, feature list and live-feed state |
| GET | `/api/predict/macro` | Latest observed BDRY / Brent / USD-INR and their provenance |
| POST | `/api/predict/refresh` | Force a live market pull and re-baseline |
| POST | `/api/auth/register` · `/api/auth/login` · GET `/api/auth/me` | Session |

### The sourcing optimiser

A PSU does not buy one way. SAIL and RINL run a dual-tier framework — a long-term
contract (LTC) carrying the baseload so the blast furnaces never run dry, and
spot auction tenders chasing freight dips with the balance — so `ML/app.py`
splits the order on an operator-set ratio (70:30 LTC:spot by default) and
allocates both tiers in one program:

```
minimise  sum_r  x_spot_r * spot_cost_r  +  x_ltc_r * ltc_cost_r
s.t.      sum_r  x_spot_r == demand * spot_ratio
          sum_r  x_ltc_r  == demand * (1 - spot_ratio)
          x_spot_r, x_ltc_r >= 0
```

with no per-route capacity. `steel_engine.py` hands that exact program to PuLP's
CBC solver, so the allocation is a real LP solve rather than an imitation of one,
and `ledger.solver` records which engine answered.

The program is degenerate — with no capacity ceiling each quota goes wholly to
the cheapest feasible routing on its own tier — so the closed form agrees with
CBC to the tonne, and it is kept as the fallback for an environment without PuLP.
The two were checked against each other across 2,160 feasible scenarios (3 plants
× 3 vessel classes × 3 volumes × 4 crude shocks × 5 spot/LTC ratios × both
steaming modes × two congestion levels) with zero disagreement. The two tiers
need not pick the same routing: the LTC stack drops exactly the
demurrage and charter-hire terms that separate one port's queue from another's,
so a berth that spot pricing rejects for its anchorage backlog can still be the
right home for framework tonnage. Every rejected routing is still priced on both
tiers and ranked, so the desk sees what was passed over and by how much.

Cost stack, per tonne. Spot tier — full market exposure, and the queue is the
buyer's problem:

```
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
```

LTC tier — the framework's negotiated terms on committed tonnage:

```
  FOB cargo x 0.955    4.5% long-term volume discount
+ ocean freight x 0.96 4% off the committed leg
+ coal grade adjustment
+ port tariff
- bunker saved         still earned when slow-steaming
= ocean USD/t  ->  the same rail and godown legs
```

with no demurrage and no extra charter hire at all: the framework buys pre-booked
priority berthing slots, so the supplier carries the discharge window rather than
the plant.

Feasibility is a hard gate on vessel draft against berth draft and on DWT against
the port's maximum call size — which is why Capesize clears only Dhamra and
Vizag, and Haldia's river draft accepts nothing above Supramax.

**Virtual Arrival** is the toggle that matters: steaming full ahead into a queue
pays demurrage at the port's day rate spread over the parcel, while slow-steaming
pays extra charter hire instead but saves the bunker difference across the whole
passage. The ledger prices the plan both ways and reports the delta.

**Mid-voyage telemetry** reads the allocated routing as a parcel already at sea.
A vessel `voyage_day` days out has `sailing_days - voyage_day` days of passage
left, and that is the entire budget virtual arrival has to spend: slowing down
can soak up a queue only up to that many days. Past it she arrives before the
berth frees whatever she does, and the remainder is time at anchorage on
demurrage — which is why the card can read *absorbed*, *partially absorbed* or
*exposed* on the same routing depending on how far along she already is.

**The crude-shock slider opens on the market's own tail risk.** Rather than
defaulting to zero, `ML/app.py` derives a 14-day 95% Value-at-Risk straight off
the traded Brent series — `1.645 * daily_volatility * sqrt(14)`, the one-tailed
95% normal quantile scaled by root-time — and seeds the slider with it, so the
first view a desk gets is already a stress test sized by live volatility.
`ml_engine.crude_var_pct()` reproduces that on the same series the forecast is
scored against.

### The trained freight models

`POST /api/predict/freight` is served by a `HistGradientBoostingRegressor`
trained in the sibling **ML** project and shipped in `backend/app/ml_models/`:

| Artefact | Horizon | Out-of-sample price-level R² |
|---|---|---|
| `freight_forecast_14d.pkl` | 14 days | 0.706 |
| `feature_columns.pkl` | — | the nine feature names, in training order |

`freight_forecast_30d.pkl` also comes out of the training script but is
deliberately not loaded: `ML/app.py` is a 14-day product
(`days_ahead = np.arange(1, 15)`) and no feature was ever built on the 30-day
model, so the API and the dashboard do not offer one.

It does **not** predict a price level — it predicts the *delta*
`BDRY(t+14) − BDRY(t)`, from nine stationary features rebuilt at inference time by
`services/ml_engine.py` from the BDRY freight index, Brent crude and USD/INR:

```
BDRY_P_Diff_1 / _5 / _14     price change over 1, 5, 14 sessions
BDRY_EMA_7 / _21             EMA minus spot — distance from its own trend
Crude_P_Diff_7               Brent 7-session move
Crude_EMA_14                 Brent EMA minus spot
USDINR_Diff_7                rupee 7-session move
Rolling_Vol_14               14-session std-dev of daily BDRY changes
```

The day-by-day path is `ML/app.py`'s curve, term for term:

```
forward_drift = model_slope + crude_slope + port_risk_slope + vessel_spread + holding_pressure
price[d]      = spot × (1 + forward_drift × d + 0.12 × sin(0.45 × d))
```

where `crude_slope`, `port_risk_slope`, `vessel_spread` and `holding_pressure`
are that app's coefficients on the four sidebar inputs, and `model_slope` is the
one thing it lacked — the trained model's 14-day delta on the *actual* series,
spread across the horizon. The best day, the peak, the window saving, the
day-by-day signals and the banner thresholds are computed exactly as the app
does them. Because every slider feeds the drift, every slider moves the target,
the percentage and the optimal day — which the earlier straight-line curve
never did.

### The live market feed

`ML/data.py` and `ML/src/run_all_data.py` pull three daily series off Yahoo
Finance to build the training set. `services/live_data.py` performs the *same*
pull while the API is running, so the models score today's market instead of the
CSV snapshot frozen into `app/ml_models/`:

| Ticker | Series | Column |
|---|---|---|
| `BDRY` | Breakwave Dry Bulk Shipping ETF | `Freight_Index_BDRY` |
| `BZ=F` | Brent crude futures | `Brent_Crude_USD` |
| `USDINR=X` | Rupee spot | `USD_INR_Exchange_Rate` |

The swap is safe because the feed and the training CSV are the *same series*: on
2026-07-20, the CSV's last row, the live pull returns BDRY 12.19 / Brent 89.22 /
USD-INR 96.28 — matching the CSV to the cent. The model sees the distribution it
was fitted on, only current. It matters: that frozen row had BDRY at 12.19 while
the market was trading at 16.30, so the dashboard was reading ~34% below spot.

Three tiers, best first — live feed, bundled CSV, deterministic synthetic walk.
Start-up loads the CSV synchronously and fires the live pull on a daemon thread,
so no request ever waits on the network and a machine with no connectivity boots
identically. Every panel badges which tier it is showing; a stale chart is never
passed off as a live one.

```bash
VORTEX_LIVE_DATA=0    # disable the feed entirely (offline demos)
VORTEX_LIVE_TTL=3600  # seconds before a cached pull is refetched
```

- **Why a hand-set crude slope next to a model that already reads crude** —
  the tree saturates: on today's series the highest split on `Crude_P_Diff_7`
  sits below the current 7-day move, so a +5% and a +50% shock land in the same
  leaf. The model is therefore scored on real crude for the *baseline* slope,
  and the shock slider is the same hypothetical overlay it is in `ML/app.py`.
  Nothing is counted twice, and the slider always moves the curve.
- **Graceful fallback** — a missing pickle, a missing CSV, an absent
  scikit-learn or a missing request field all degrade to a deterministic analytic
  forecast of the *identical* response shape, flagged in the model badge. The
  browser mirror in `fallback.js` reproduces the same feature recipe, so the tab
  renders identically with Flask stopped.

---

## Offline behaviour

Every dashboard request goes through `fetchOrFallback`. If Flask is unreachable,
`src/lib/fallback.js` recomputes the same answer in the browser — the reference
data is identical to `domain.py` and the cost stack reproduces `steel_engine.py`
line for line, so the rupee figures match and every panel keeps working. Each
panel badges its source **DEMO** instead of **LIVE**.

Two things cannot be mirrored. The pickles do not run in the browser, so the
forecast falls back to the same analytic estimator the Python service uses when
scikit-learn is absent. And with Flask unreachable there is no live market feed,
so the mirror scores its own deterministic macro baseline. Both are stated on the
badges rather than implied away, and response shapes are kept identical between
the two paths — verified field by field against the running API.

The mirror only steps in for a backend that is *unreachable* (connection
refused, proxy 502, timeout, non-JSON). A `4xx` means the request itself was
wrong, and that is surfaced in the panel with a **Retry** rather than papered
over. A panel whose request fails outright shows what happened instead of a
skeleton that never resolves, and an amber strip under the header names the URL
and status the browser got whenever any panel is on the mirror.

---

## Layout

```
start_dev.sh                one command for backend + frontend
backend/
  run.py                    entry point, port preflight
  requirements.txt
  app/
    __init__.py             application factory, CORS, model warm-up
    config.py               MONGO_URI lives here (left empty)
    db.py                   Mongo access with an in-memory fallback
    domain.py               plants, ports, FOIS rail legs, vessels, origins
    ml_models/              trained .pkl models + the training feature CSV
    routes/                 auth · steel · predict blueprints
    services/
      steel_engine.py       routing economics, LP allocation, ledger
      ml_engine.py          model loading, feature recipe, index forecast
      live_data.py          Yahoo Finance macro pull (the ML ingestion path)
      auth.py               PBKDF2 credentials + signed session tokens
frontend/
  src/
    lib/                    api client, offline mirror, hooks, formatting, scene
    components/landing/     Navbar · ScrollStage · ShipScene · About · Footer
    components/dashboard/   ui primitives · ControlPanel · MetricsBar ·
                            SourcingPlan · CostBreakdown · Ledger · ForecastPanel
    pages/                  Landing · AuthPage · Dashboard
```

---

## Design system

*Ocean Blue & Shipment Box Gold.* Deep navy `#0A192F` / `#0B2545`, ocean cobalt
`#134074`, coastal blue `#1D4ED8`–`#3B82F6`; cargo gold `#EAB308`, amber
`#F59E0B`, hazard yellow `#FDE047`. Surfaces are frosted glass over dark ocean.

Chart series use a separate four-step categorical set
(`#d97706 · #3b82f6 · #059669 · #f43f5e`) chosen for the dark chart surface:
every step sits inside the OKLCH 0.48–0.67 dark lightness band, clears the chroma
floor, holds worst-adjacent colour-blind ΔE 8.3 and normal-vision ΔE 24.0, and
exceeds 3:1 contrast. Charts with a single series use the brand gold instead. No
chart uses two y-axes.
