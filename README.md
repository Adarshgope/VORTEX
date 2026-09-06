# VORTEX

**Vessel Optimization & Rate Tracking for East-coast eXports/imports**
Smart India Hackathon 2026 · Problem Statement **SIH26006**

Predictive freight analytics for bulk cargo chartering across India's eastern
seaboard — forecast rate volatility, respect port constraint envelopes, pick the
right vessel class, and price the cargo all the way to the godown.

---

## Running it

Two processes: Flask on **5000**, Vite on **5173**.

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
python run.py                      # http://localhost:5000
```

> **macOS:** Control Center's AirPlay Receiver also listens on port 5000.
> `run.py` detects this and tells you what to do — either turn AirPlay Receiver
> off in *System Settings → General → AirDrop & Handoff*, or run on another port:
>
> ```bash
> PORT=5050 python run.py
> ```

### Frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

If the backend is on a non-default port, point the frontend at it:

```bash
VITE_API_URL=http://localhost:5050 npm run dev
```

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

One screen, no tab stack: controls on the left, the decision on the right.

| Region | Contents |
|---|---|
| **Control rail** | Destination steel plant (SAIL Rourkela / SAIL Bokaro / RINL Vizag), order volume, vessel class, macro stress-test sliders (Brent crude shock %, VLSFO bunker $/MT, USD/INR, BDRY index), Virtual Arrival toggle, 14/30-day forecast horizon |
| **Tactical banner** | The procurement call — ADVANCE SPOT CHARTER BOOKINGS / STAGGER CHARTER CONTRACTS / DEFER FIXTURES, driven by the model's projected move |
| **Metrics bar** | Live BDRY with its 14/30-day target, Brent crude $/bbl, VLSFO bunker $/MT, USD/INR |
| **Optimal sourcing plan** | Every feasible origin × discharge-port routing, ranked and priced to the plant: supplier origin, discharge port, allocated volume, ocean / port / FOIS rail legs, landed ₹/MT, premium over rank 1 |
| **Multi-modal cost stack** | The allocated routing split into FOB, ocean freight, grade adjustment, port handling, demurrage, rail and godown, in ₹/MT |
| **Financial ledger** | Procurement budget in ₹ crores, saving against the costliest feasible routing, and what Virtual Arrival is worth |
| **Freight index forecast** | Realised BDRY flowing into the 14- or 30-day model curve with its 95% cone and the optimal charter window |

Slider moves re-post the whole scenario, so every panel updates together.

---

## API

All routes are under `/api`. `flask-cors` is used when installed; otherwise the
app adds the headers itself.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Service, database and ML model status |
| GET | `/api/steel/options` | Plants, ports, vessel classes, origins, macro baseline, slider ranges |
| POST | `/api/steel/plan` | **The optimiser** — ranked routings, allocation, ledger and forecast |
| POST | `/api/predict/freight` | **ML** 14/30-day BDRY forecast: level, band, drivers, curve |
| GET | `/api/predict/status` | Model health for the dashboard badge |
| POST | `/api/auth/register` · `/api/auth/login` · GET `/api/auth/me` | Session |

### The sourcing optimiser

`ML/app.py` states the allocation as

```
minimise  sum_r  x_r * landed_cost_r
s.t.      sum_r  x_r = demand,   x_r >= 0
```

with no per-route capacity. That program is degenerate — its optimum puts the
whole requirement on the single cheapest feasible routing — so `steel_engine.py`
computes that closed form directly and gets an identical answer without taking on
a solver dependency. Every rejected routing is still priced and ranked, so the
desk sees what was passed over and by how much.

Cost stack, per tonne:

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

Feasibility is a hard gate on vessel draft against berth draft and on DWT against
the port's maximum call size — which is why Capesize clears only Dhamra and
Vizag, and Haldia's river draft accepts nothing above Supramax.

**Virtual Arrival** is the toggle that matters: steaming full ahead into a queue
pays demurrage at the port's day rate spread over the parcel, while slow-steaming
pays extra charter hire instead but saves the bunker difference across the whole
passage. The ledger prices the plan both ways and reports the delta.

### The trained freight models

`POST /api/predict/freight` is served by two `HistGradientBoostingRegressor`s
trained in the sibling **ML** project and shipped in `backend/app/ml_models/`:

| Artefact | Horizon | Out-of-sample price-level R² |
|---|---|---|
| `freight_forecast_14d.pkl` | 14 days | 0.706 |
| `freight_forecast_30d.pkl` | 30 days | 0.612 |
| `feature_columns.pkl` | — | the nine feature names, in training order |

They do **not** predict a price level — they predict the *delta*
`BDRY(t+h) − BDRY(t)`, from nine stationary features rebuilt at inference time by
`services/ml_engine.py` from the BDRY freight index, Brent crude and USD/INR:

```
BDRY_P_Diff_1 / _5 / _14     price change over 1, 5, 14 sessions
BDRY_EMA_7 / _21             EMA minus spot — distance from its own trend
Crude_P_Diff_7               Brent 7-session move
Crude_EMA_14                 Brent EMA minus spot
USDINR_Diff_7                rupee 7-session move
Rolling_Vol_14               14-session std-dev of daily BDRY changes
```

The index delta is then rebased onto the selected lane's USD/tonne spot, which is
what a charterer actually fixes against.

- **Scenario sliders** — a bunker or FX shock is phased into the tail of the
  macro series over three weeks rather than applied as a step, so the difference
  and EMA features see a move of the shape they were trained on. Berth congestion
  is priced on top of the model rather than fed into it.
- **Confidence band** — a random walk's h-day sigma is `vol·√h`; the model
  explains R² of that variance, so the cone is `√(1−R²)` of the naive spread
  rather than an arbitrary constant.
- **Explainability** — each driver bar is an ablation: replace one feature with
  its historical median, re-predict, and read off what the live value was worth.
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

The one thing that cannot be mirrored is the trained model: the pickles do not
run in the browser, so the forecast falls back to the same analytic estimator the
Python service uses when scikit-learn is absent, and the model badge says so.
Response shapes are kept identical between the two paths.

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
      steel_engine.py       routing economics, allocation, ledger
      ml_engine.py          model loading, feature recipe, index forecast
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
