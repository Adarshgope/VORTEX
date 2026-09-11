"""
Freight index forecasting — the 14-day model behind the dashboard.

`freight_forecast_14d.pkl` is a `HistGradientBoostingRegressor` trained by
`ML/src/src/train_model.py` on nine *stationary* features derived from three
daily macro series: the BDRY dry-bulk freight index, Brent crude and USD/INR. It
does not predict a price level; it predicts the **delta** `BDRY(t+14) - BDRY(t)`,
so this module rebuilds the exact feature recipe before scoring:

    BDRY_P_Diff_1/5/14   price differences over 1, 5 and 14 sessions
    BDRY_EMA_7/21        EMA minus spot (how far price sits from its own trend)
    Crude_P_Diff_7       Brent 7-session move
    Crude_EMA_14         Brent EMA minus spot
    USDINR_Diff_7        rupee 7-session move
    Rolling_Vol_14       14-session std-dev of daily BDRY changes

The day-by-day curve, the optimal booking day and the tactical signals are the
ones `ML/app.py` computes, reproduced term for term — see `forecast_index`.
The trained model adds the one thing that app lacks — a baseline market slope
read off the real series; ML/app.py's four scenario slopes sit on top of it.

Where the macro series comes from
---------------------------------
Three tiers, best first:

1. `live_data.get_macro()` — the same Yahoo Finance pull `ML/data.py` performs,
   so the forecast is anchored to today's market. Verified to reproduce the
   training CSV exactly on its final row.
2. `app/ml_models/master_features_training.csv` — the bundled snapshot.
3. A deterministic synthetic walk, so the API still answers on a bare checkout.

The live pull happens on a daemon thread and swaps in when it lands; no request
ever waits on the network.

Design notes
------------
* Feature engineering is pure standard library, so the only hard requirement for
  a live prediction is joblib + scikit-learn.
* Everything degrades: a missing pickle, a missing CSV, absent scikit-learn or a
  missing request field all fall back to a deterministic analytic estimate of
  the identical response shape, flagged `status == "fallback"`.
* `ML/models/freight_forecast_30d.pkl` is deliberately not loaded. `ML/app.py`
  is a 14-day product (`days_ahead = np.arange(1, 15)`); the 30-day pickle is a
  training-script by-product the team never built a feature on.
"""

import csv
import hashlib
import math
import random
import threading
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Layout & constants
# ---------------------------------------------------------------------------

MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models"

HORIZON = 14

FEATURE_ORDER = [
    "BDRY_P_Diff_1", "BDRY_P_Diff_5", "BDRY_P_Diff_14",
    "BDRY_EMA_7", "BDRY_EMA_21",
    "Crude_P_Diff_7", "Crude_EMA_14",
    "USDINR_Diff_7", "Rolling_Vol_14",
]

# Out-of-sample price-level R² from the training run — the figure ML/app.py
# quotes in its tactical banner.
MODEL_R2 = 0.706

_MIN_SERIES = 60          # sessions needed before the feature recipe is valid

# --- ML/app.py's forward-curve coefficients, verbatim ------------------------
# forward_drift = crude_slope + port_risk_slope + vessel_spread + holding_pressure
# The trained model adds a fifth term: the baseline market slope it reads off
# the real series. ML/app.py has no such term — its curve at zero shock is pure
# cycle — and the four sliders below are scenario overlays on top of it.
_CRUDE_SLOPE_PER_PCT = 0.042 / 100.0         # (crude_shock / 100) * 0.042
_PORT_RISK_SLOPE_PER_DAY = 0.024 / 8.0      # (port_wait_adder / 8) * 0.024
_VESSEL_SPREAD_COEF = 0.018                  # (v_factor - 1) * 0.018
_HOLDING_PRESSURE_COEF = 0.012 / 100.0       # ((godown - 35) / 100) * 0.012
_HOLDING_BASELINE_INR = 35.0
_CYCLE_AMPLITUDE = 0.12                      # 0.12 * sin(d * 0.45)
_CYCLE_FREQ = 0.45
_NEUTRAL_BAND = 1.02                         # "Neutral Window" while p <= base * 1.02
_BOOK_NOW_DAYS = 3                           # "BOOK IMMEDIATELY" while best_day <= 3
_ESCALATION_PCT = 2.0                        # banner flips red above +2%

# Slider bands, matching ML/app.py's sidebar.
PORT_DELAY_RANGE = (0.0, 8.0)
GODOWN_RANGE = (20.0, 120.0)
CRUDE_SHOCK_RANGE = (-30.0, 50.0)

# --- Empirical Brent Value-at-Risk ------------------------------------------
# ML/app.py derives the *default* position of its crude-shock slider rather than
# hard-coding one, reading a 14-day 95% VaR straight off the traded series:
#
#     daily_volatility = crude.pct_change().std()      # over a 3-month pull
#     stat_var_14d_pct = 1.645 * daily_volatility * sqrt(14) * 100
#
# 1.645 is the one-tailed 95% normal quantile and sqrt(14) is the square-root-of-
# time scaling to the 14-day horizon. Reproduced here on the same series the
# forecast is scored against, so the slider opens on the market's own tail risk
# instead of on zero.
_VAR_Z = 1.645                # one-tailed 95% normal quantile
_VAR_WINDOW = 63              # ~3 months of sessions — ML/app.py's period="3mo"
_VAR_FALLBACK_PCT = 14.8      # ML/app.py's benchmark when the feed is offline


# ---------------------------------------------------------------------------
# Small numeric helpers (stdlib only)
# ---------------------------------------------------------------------------

def _seeded(*parts):
    digest = hashlib.sha256("::".join(str(p) for p in parts).encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


def _ewm_mean(values, span):
    """pandas' `Series.ewm(span=..).mean()` with adjust=True, in plain Python."""
    decay = 1.0 - 2.0 / (span + 1.0)
    out, num, den = [], 0.0, 0.0
    for v in values:
        num = v + decay * num
        den = 1.0 + decay * den
        out.append(num / den)
    return out


def _rolling_std(values, window):
    """Trailing sample std-dev; None until the window is full (as pandas does)."""
    out = [None] * len(values)
    for i in range(window - 1, len(values)):
        chunk = values[i - window + 1: i + 1]
        if any(c is None for c in chunk):
            continue
        mean = sum(chunk) / window
        out[i] = math.sqrt(sum((c - mean) ** 2 for c in chunk) / (window - 1))
    return out


def _median(values):
    ordered = sorted(values)
    n = len(ordered)
    if not n:
        return 0.0
    mid = n // 2
    return ordered[mid] if n % 2 else (ordered[mid - 1] + ordered[mid]) / 2.0


def _clamp(value, lo, hi):
    return max(lo, min(hi, value))


def _to_float(value, default=None):
    """Tolerant cast — a blank, None or junk input falls back rather than 500s."""
    if value is None or value == "":
        return default
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return default if math.isnan(out) or math.isinf(out) else out


# ---------------------------------------------------------------------------
# Macro history
# ---------------------------------------------------------------------------

def _synthetic_macro(days=900):
    """
    Deterministic stand-in used when no training CSV ships with the build.
    Same shape as the real feed, so the feature recipe stays exercised.
    """
    rng = _seeded("macro-fallback")
    start = datetime.now(timezone.utc).date() - timedelta(days=days)
    dates, bdry, crude, fx = [], [], [], []
    b, c, f = 12.4, 84.0, 88.0
    for i in range(days):
        b = max(6.0, b + rng.gauss(0, 0.22) + 0.02 * (12.4 - b))
        c = max(45.0, c + rng.gauss(0, 0.7) + 0.02 * (84.0 - c))
        f = f + rng.gauss(0.004, 0.05)
        dates.append((start + timedelta(days=i)).strftime("%Y-%m-%d"))
        bdry.append(round(b, 4))
        crude.append(round(c, 4))
        fx.append(round(f, 4))
    return {"dates": dates, "bdry": bdry, "crude": crude, "usdinr": fx,
            "source": "synthetic baseline (training CSV not bundled)"}


def _read_macro_csv(path):
    """Pull the three macro columns out of a training/raw CSV, skipping gaps."""
    dates, bdry, crude, fx = [], [], [], []
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            b = _to_float(row.get("Freight_Index_BDRY"))
            c = _to_float(row.get("Brent_Crude_USD"))
            f = _to_float(row.get("USD_INR_Exchange_Rate"))
            date = (row.get("Date") or "").strip()
            if not date or b is None or c is None or f is None:
                continue
            dates.append(date)
            bdry.append(b)
            crude.append(c)
            fx.append(f)
    if len(dates) < _MIN_SERIES:
        return None
    return {"dates": dates, "bdry": bdry, "crude": crude, "usdinr": fx,
            "source": path.name}


def _load_macro():
    for name in ("master_features_training.csv", "maritime_freight_macro_data.csv"):
        path = MODEL_DIR / name
        if not path.exists():
            continue
        try:
            series = _read_macro_csv(path)
        except (OSError, csv.Error):
            continue
        if series:
            return series
    return _synthetic_macro()


# ---------------------------------------------------------------------------
# Feature engineering — mirrors ML/src/src/train_model.py exactly
# ---------------------------------------------------------------------------

def _feature_frame(bdry, crude, usdinr):
    """Every feature row the series supports, oldest first (None where invalid)."""
    n = len(bdry)
    ema7 = _ewm_mean(bdry, 7)
    ema21 = _ewm_mean(bdry, 21)
    ema14c = _ewm_mean(crude, 14)
    diffs = [None] + [bdry[i] - bdry[i - 1] for i in range(1, n)]
    vol14 = _rolling_std(diffs, 14)

    rows = []
    for i in range(n):
        if i < 15 or vol14[i] is None:
            rows.append(None)
            continue
        rows.append({
            "BDRY_P_Diff_1": bdry[i] - bdry[i - 1],
            "BDRY_P_Diff_5": bdry[i] - bdry[i - 5],
            "BDRY_P_Diff_14": bdry[i] - bdry[i - 14],
            "BDRY_EMA_7": ema7[i] - bdry[i],
            "BDRY_EMA_21": ema21[i] - bdry[i],
            "Crude_P_Diff_7": crude[i] - crude[i - 7],
            "Crude_EMA_14": ema14c[i] - crude[i],
            "USDINR_Diff_7": usdinr[i] - usdinr[i - 7],
            "Rolling_Vol_14": vol14[i],
        })
    return rows


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------

class _Registry:
    """Lazily loads and caches the pickled model, feature list and macro history."""

    def __init__(self):
        self._lock = threading.Lock()
        self._ready = False
        self.model = None
        self.feature_columns = list(FEATURE_ORDER)
        self.macro = None
        self.medians = {}
        self.status = "loading"
        self.detail = ""
        self._live_thread = None

    # -- loading ----------------------------------------------------------
    @staticmethod
    def _medians_for(macro):
        rows = _feature_frame(macro["bdry"], macro["crude"], macro["usdinr"])
        valid = [r for r in rows if r]
        return ({k: _median([r[k] for r in valid]) for k in FEATURE_ORDER}
                if valid else {k: 0.0 for k in FEATURE_ORDER})

    def _load(self):
        self.macro = _load_macro()
        self.medians = self._medians_for(self.macro)

        try:
            import joblib
        except ImportError:
            self.status = "fallback"
            self.detail = "joblib/scikit-learn not installed — analytic forecast in use."
            return

        cols_path = MODEL_DIR / "feature_columns.pkl"
        if cols_path.exists():
            try:
                loaded = joblib.load(cols_path)
                if loaded:
                    self.feature_columns = list(loaded)
            except Exception:  # noqa: BLE001 — a bad pickle must not kill the API
                pass

        path = MODEL_DIR / f"freight_forecast_{HORIZON}d.pkl"
        if not path.exists():
            self.status = "fallback"
            self.detail = f"{path.name} not found in {MODEL_DIR.name}/ — analytic forecast in use."
            return
        try:
            self.model = joblib.load(path)
        except Exception as exc:  # noqa: BLE001
            self.status = "fallback"
            self.detail = (f"{path.name} failed to load ({exc.__class__.__name__}) — "
                           f"analytic forecast in use.")
            return

        self.status = "active"
        self.detail = f"Gradient-boosted {HORIZON}-day freight model loaded ({path.name})."

    def ensure(self):
        if self._ready:
            return
        with self._lock:
            if self._ready:
                return
            try:
                self._load()
            except Exception as exc:  # noqa: BLE001 — never block the API on load
                self.macro = self.macro or _synthetic_macro()
                self.medians = self.medians or {k: 0.0 for k in FEATURE_ORDER}
                self.status = "fallback"
                self.detail = (f"Model load failed ({exc.__class__.__name__}) — "
                               f"analytic forecast in use.")
            self._ready = True

    # -- macro series -----------------------------------------------------
    def snapshot(self):
        """(macro, medians) as one consistent pair — the live swap is atomic."""
        self.ensure()
        with self._lock:
            return self.macro, self.medians

    def adopt(self, macro):
        """Install a new macro series and the medians derived from it."""
        medians = self._medians_for(macro)
        with self._lock:
            self.macro = macro
            self.medians = medians

    def refresh_live(self, force=False):
        """
        Pull the live feed and adopt it if it differs from what is loaded.
        Returns True when the series actually changed. Never raises.
        """
        self.ensure()
        try:
            from . import live_data
            series, _ = live_data.get_macro(force=force)
        except Exception:  # noqa: BLE001 — the feed is strictly best-effort
            return False
        if not series or not series.get("dates"):
            return False

        # Compare the last *observation*, not just the last date: BDRY ticks
        # through the session, so a same-day refetch at a new price is real.
        def tail(m):
            if not m or not m.get("dates"):
                return None
            return (m.get("source"), m["dates"][-1],
                    m["bdry"][-1], m["crude"][-1], m["usdinr"][-1])

        if tail(self.macro) == tail(series):
            return False
        self.adopt(series)
        return True

    def refresh_live_async(self):
        """Kick a live pull on a daemon thread. At most one runs at a time."""
        with self._lock:
            if self._live_thread is not None and self._live_thread.is_alive():
                return
            thread = threading.Thread(
                target=self._quiet_refresh, name="vortex-live-macro", daemon=True)
            self._live_thread = thread
        thread.start()

    def _quiet_refresh(self):
        try:
            self.refresh_live()
        except Exception:  # noqa: BLE001 — a background thread must die quietly
            pass

    # -- inference --------------------------------------------------------
    def predict_delta(self, features):
        """14-day index-point change. Returns (delta, served_by_model)."""
        if self.model is None:
            return _analytic_delta(features), False
        vector = [[features[c] for c in self.feature_columns]]
        try:
            with warnings.catch_warnings():
                # The vector is ordered by the pickled feature_columns, so the
                # "no feature names" notice is noise rather than a real risk.
                warnings.simplefilter("ignore")
                return float(self.model.predict(vector)[0]), True
        except Exception:  # noqa: BLE001
            return _analytic_delta(features), False


_REGISTRY = _Registry()


def _analytic_delta(features):
    """
    Momentum + mean-reversion stand-in used whenever the pickle is not
    available. Same sign conventions as the trained model.
    """
    momentum = features["BDRY_P_Diff_14"] / 14.0 + features["BDRY_P_Diff_5"] / 5.0
    reversion = features["BDRY_EMA_21"] * 0.35
    fuel = features["Crude_P_Diff_7"] * 0.012
    fx = features["USDINR_Diff_7"] * 0.05
    return momentum * 2.6 + reversion + fuel + fx


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------

def warm_up():
    """
    Load the model at process start so the first request is not the slow one.
    The live macro pull is fired off on a daemon thread, so a slow or absent
    network delays start-up by nothing at all.
    """
    _REGISTRY.ensure()
    _REGISTRY.refresh_live_async()
    return model_status()


def refresh_live(force=True):
    """Block on a live macro pull and report what happened (POST /refresh)."""
    changed = _REGISTRY.refresh_live(force=force)
    return {"refreshed": changed, "macro": macro_baseline(), "feed": live_status()}


def live_status():
    """Live-feed health, or a flat 'unavailable' if the module cannot import."""
    try:
        from . import live_data
        return live_data.status()
    except Exception:  # noqa: BLE001
        return {"enabled": False, "available": False, "connected": False,
                "last_error": "live_data module unavailable"}


def _touch_live():
    """Nudge a background refresh when the cached pull is cold or stale."""
    feed = live_status()
    if not (feed.get("enabled") and feed.get("available")):
        return
    if not feed.get("connected") or feed.get("stale"):
        _REGISTRY.refresh_live_async()


def model_status():
    _REGISTRY.ensure()
    macro, _ = _REGISTRY.snapshot()
    return {
        "status": _REGISTRY.status,
        "active": _REGISTRY.status == "active",
        "detail": _REGISTRY.detail,
        "algorithm": "HistGradientBoostingRegressor (delta target)",
        "label": (f"AI Model: Active · {HORIZON}d GBM" if _REGISTRY.model is not None
                  else "AI Model: Fallback · analytic forecast"),
        "horizon_days": HORIZON,
        "feature_count": len(_REGISTRY.feature_columns),
        "features": list(_REGISTRY.feature_columns),
        "r2": MODEL_R2,
        "data_source": macro["source"] if macro else "",
        "data_as_of": macro["dates"][-1] if macro else "",
        "data_rows": len(macro["dates"]) if macro else 0,
        "data_is_live": bool(macro and macro.get("live")),
        "live_feed": live_status(),
    }


def crude_var_pct():
    """
    14-day 95% Value-at-Risk on Brent, in percent, off the live series.

    ML/app.py's `stat_var_14d_pct`. Returns its offline benchmark (14.8%) when
    the series is too short or too flat to give a meaningful volatility, and is
    clamped into the crude-shock slider's own band so it is always a position
    that slider can actually open on.
    """
    _REGISTRY.ensure()
    macro, _ = _REGISTRY.snapshot()
    crude = macro["crude"][-(_VAR_WINDOW + 1):] if macro else []
    returns = [crude[i] / crude[i - 1] - 1.0
               for i in range(1, len(crude)) if crude[i - 1]]
    if len(returns) < 20:
        return _VAR_FALLBACK_PCT

    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    daily_vol = math.sqrt(variance)
    var_pct = _VAR_Z * daily_vol * math.sqrt(HORIZON) * 100.0
    if not (var_pct > 0) or math.isinf(var_pct):
        return _VAR_FALLBACK_PCT
    return round(_clamp(var_pct, 0.0, CRUDE_SHOCK_RANGE[1]), 1)


def macro_baseline():
    """Latest observed macro levels — what the metric tiles show."""
    _touch_live()
    m, _ = _REGISTRY.snapshot()
    return {
        "bdry": round(m["bdry"][-1], 2),
        "brent_usd": round(m["crude"][-1], 2),
        "usd_inr": round(m["usdinr"][-1], 2),
        "as_of": m["dates"][-1],
        "source": m["source"],
        "is_live": bool(m.get("live")),
        # ML/app.py's empirically derived crude-shock default.
        "crude_var_14d_pct": crude_var_pct(),
    }


def _signal(day, price, spot, best_day):
    """ML/app.py's day-by-day procurement signal."""
    if day == best_day:
        return "OPTIMAL", "Optimal buy window — execute fixture"
    if price <= spot * _NEUTRAL_BAND:
        return "NEUTRAL", "Neutral window — hold and monitor"
    return "ESCALATION", "Escalation zone — avoid booking"


def forecast_index(crude_shock_pct=0.0, port_delay_days=0.0, vessel_factor=1.0,
                   godown_rate_inr=None):
    """
    14-day BDRY forecast, ML/app.py's decision engine with the trained model
    supplying the market slope.

    ML/app.py builds its curve as

        forward_drift = crude_slope + port_risk_slope + vessel_spread + holding_pressure
        price[d]      = spot * (1 + forward_drift * d + 0.12 * sin(0.45 * d))

    All four slopes and the cyclical term are ML/app.py's, verbatim. The trained
    model contributes what that app lacks — a baseline market slope, its 14-day
    delta on the *actual* series spread evenly across the horizon. Crude is one
    of the model's inputs, so it is scored on real crude and the shock slider is
    the same hypothetical overlay it is in ML/app.py; nothing is counted twice.
    The best day, the peak, the window saving, the signals and the banner
    thresholds are all computed exactly as that app does.

    Every argument is optional; a bare call returns the baseline forecast.
    """
    _touch_live()

    crude_shock = _clamp(_to_float(crude_shock_pct, 0.0) or 0.0, *CRUDE_SHOCK_RANGE)
    port_delay = _clamp(_to_float(port_delay_days, 0.0) or 0.0, *PORT_DELAY_RANGE)
    v_factor = _to_float(vessel_factor, 1.0) or 1.0
    godown = _to_float(godown_rate_inr, _HOLDING_BASELINE_INR)
    godown = _clamp(godown if godown is not None else _HOLDING_BASELINE_INR, *GODOWN_RANGE)

    # One consistent (series, medians) pair for the whole request.
    macro, medians = _REGISTRY.snapshot()
    bdry, crude, fx = macro["bdry"], macro["crude"], macro["usdinr"]
    rows = _feature_frame(bdry, crude, fx)
    features = next((r for r in reversed(rows) if r), None)
    if features is None:  # series too short to build a feature row
        features = dict(medians)

    spot = bdry[-1]
    delta, served_by_model = _REGISTRY.predict_delta(features)
    model_target = spot + delta

    # -- ML/app.py's forward curve, with the model as the market slope --------
    model_slope = (delta / spot) / HORIZON if spot else 0.0
    crude_slope = crude_shock * _CRUDE_SLOPE_PER_PCT
    port_risk_slope = port_delay * _PORT_RISK_SLOPE_PER_DAY
    vessel_spread = (v_factor - 1.0) * _VESSEL_SPREAD_COEF
    holding_pressure = (godown - _HOLDING_BASELINE_INR) * _HOLDING_PRESSURE_COEF
    drift = model_slope + crude_slope + port_risk_slope + vessel_spread + holding_pressure

    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    prices = [spot * (1.0 + drift * d + _CYCLE_AMPLITUDE * math.sin(d * _CYCLE_FREQ))
              for d in range(1, HORIZON + 1)]
    prices = [max(p, spot * 0.4) for p in prices]

    target = prices[-1]
    change_pct = (target - spot) / spot * 100.0 if spot else 0.0
    best_idx = min(range(HORIZON), key=lambda i: prices[i])
    peak_idx = max(range(HORIZON), key=lambda i: prices[i])
    best_day, best_price = best_idx + 1, prices[best_idx]
    peak_price = prices[peak_idx]
    window_saving = (peak_price - best_price) / peak_price * 100.0 if peak_price else 0.0

    points = []
    for i, price in enumerate(prices):
        day = i + 1
        date = start + timedelta(days=day)
        code, label = _signal(day, price, spot, best_day)
        points.append({
            "date": date.strftime("%Y-%m-%d"),
            "weekday": date.strftime("%A"),
            "day": day,
            "forecast": round(price, 2),
            "change_pct": round((price - spot) / spot * 100.0, 2) if spot else 0.0,
            "signal": code,
            "signal_label": label,
        })

    best_date = start + timedelta(days=best_day)
    timing = ({
        "level": "critical",
        "action": f"BOOK IMMEDIATELY — DAY {best_day}",
        "detail": (f"Forward freight pressure is accelerating. Best booking day is within "
                   f"{best_day} day(s) ({best_date.strftime('%A, %d %b')}). Booking before "
                   f"rate escalation saves up to {window_saving:.2f}% against the 14-day peak."),
    } if best_day <= _BOOK_NOW_DAYS else {
        "level": "clear",
        "action": f"STAGGER & FIX ON DAY {best_day}",
        "detail": (f"Forward indicators show freight reaching a tactical low of "
                   f"{best_price:.2f} on day {best_day} ({best_date.strftime('%A, %d %b')}). "
                   f"Buffer inventory at plant and fix the charter fixture on day {best_day}."),
    })

    history = [{"date": d, "index": round(v, 2)}
               for d, v in zip(macro["dates"][-90:], bdry[-90:])]

    return {
        "horizon_days": HORIZON,
        "unit": "BDRY pts",
        "as_of": macro["dates"][-1],
        "data_source": macro["source"],
        "data_is_live": bool(macro.get("live")),
        "spot_index": round(spot, 2),
        "forecast_index": round(target, 2),
        "change_pct": round(change_pct, 2),
        "trend_direction": ("RISING" if change_pct > _ESCALATION_PCT
                            else "FALLING" if change_pct < -_ESCALATION_PCT else "STABLE"),
        "escalating": change_pct > _ESCALATION_PCT,
        # The trained model's own number, before the scenario slopes and the
        # cyclical term shape the day-by-day path.
        "model_delta": round(delta, 3),
        "model_target": round(model_target, 2),
        "drift": {
            "model": round(model_slope, 5),
            "crude_shock": round(crude_slope, 5),
            "port_risk": round(port_risk_slope, 5),
            "vessel_spread": round(vessel_spread, 5),
            "holding_pressure": round(holding_pressure, 5),
            "total_per_day": round(drift, 5),
        },
        "history": history,
        "points": points,
        "best_entry": {"date": points[best_idx]["date"], "weekday": points[best_idx]["weekday"],
                       "day": best_day, "index": round(best_price, 2),
                       "change_pct": round((best_price - spot) / spot * 100.0, 2) if spot else 0.0},
        "peak": {"date": points[peak_idx]["date"], "day": peak_idx + 1,
                 "index": round(peak_price, 2)},
        "window_saving_pct": round(window_saving, 2),
        "timing": timing,
        "scenario": {
            "crude_shock_pct": crude_shock,
            "port_delay_days": port_delay,
            "vessel_factor": round(v_factor, 3),
            "godown_rate_inr": godown,
        },
        "model": {**model_status(), "served_by_model": served_by_model},
    }
