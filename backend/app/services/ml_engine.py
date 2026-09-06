"""
Freight index forecasting — serves the two trained models.

`freight_forecast_14d.pkl` and `freight_forecast_30d.pkl` are
`HistGradientBoostingRegressor`s trained on nine *stationary* features derived
from three daily macro series: the BDRY dry-bulk freight index, Brent crude and
USD/INR. They do not predict a price level; they predict the **delta**
`BDRY(t + h) - BDRY(t)`, so this module rebuilds the exact feature recipe from
`ML/src/src/train_model.py` before scoring:

    BDRY_P_Diff_1/5/14   price differences over 1, 5 and 14 sessions
    BDRY_EMA_7/21        EMA minus spot (how far price sits from its own trend)
    Crude_P_Diff_7       Brent 7-session move
    Crude_EMA_14         Brent EMA minus spot
    USDINR_Diff_7        rupee 7-session move
    Rolling_Vol_14       14-session std-dev of daily BDRY changes

Output stays in BDRY index points, which is what the sourcing optimiser and the
dashboard chart both consume.

Design notes
------------
* Feature engineering is pure standard library, so the only hard requirement for
  a live prediction is joblib + scikit-learn.
* Everything degrades: missing models, a missing CSV, absent scikit-learn or a
  missing request field all fall back to a deterministic analytic forecast of the
  identical response shape, flagged `status == "fallback"`.
* Loading is lazy and cached — the first request warms the models.
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

HORIZONS = (14, 30)

FEATURE_ORDER = [
    "BDRY_P_Diff_1", "BDRY_P_Diff_5", "BDRY_P_Diff_14",
    "BDRY_EMA_7", "BDRY_EMA_21",
    "Crude_P_Diff_7", "Crude_EMA_14",
    "USDINR_Diff_7", "Rolling_Vol_14",
]

FEATURE_LABELS = {
    "BDRY_P_Diff_1": "Freight momentum · 1 day",
    "BDRY_P_Diff_5": "Freight momentum · 5 day",
    "BDRY_P_Diff_14": "Freight momentum · 14 day",
    "BDRY_EMA_7": "Short trend gap · 7d EMA",
    "BDRY_EMA_21": "Medium trend gap · 21d EMA",
    "Crude_P_Diff_7": "Brent crude · 7 day move",
    "Crude_EMA_14": "Bunker fuel trend · 14d EMA",
    "USDINR_Diff_7": "USD/INR · 7 day move",
    "Rolling_Vol_14": "Freight volatility · 14 day",
}

# Reported out-of-sample price-level R² from the training run, per horizon.
MODEL_R2 = {14: 0.706, 30: 0.612}

# A random walk's h-day sigma is vol*sqrt(h). The model explains R² of that
# variance, so its residual sigma is sqrt(1 - R²) of the naive spread — this is
# what widens the confidence cone rather than an arbitrary constant.
_RESIDUAL_RATIO = {h: math.sqrt(max(1.0 - MODEL_R2[h], 0.05)) for h in HORIZONS}

_MIN_SERIES = 60          # sessions needed before the feature recipe is valid
_SCENARIO_RAMP_DAYS = 21  # a shock is phased in over three weeks, not overnight


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


def _apply_scenario(series, crude_shock_pct, fx_shock_pct, bdry_level):
    """
    Build the scenario series the models will actually see.

    A *shock* (crude, FX) is a move, so it is phased into the tail over three
    weeks — that is the shape the difference and EMA features were trained on,
    and a step change would look like nothing the model has ever met.

    The BDRY control is a *level*, not a shock, so the whole series is rescaled.
    Every model feature is scale-proportional, so the relative prediction stays
    sound instead of registering an enormous fabricated one-day move.
    """
    bdry = list(series["bdry"])
    crude = list(series["crude"])
    fx = list(series["usdinr"])

    if bdry_level is not None and bdry and bdry[-1] > 0:
        ratio = bdry_level / bdry[-1]
        if abs(ratio - 1.0) > 1e-9:
            bdry = [v * ratio for v in bdry]

    if crude_shock_pct or fx_shock_pct:
        span = min(_SCENARIO_RAMP_DAYS, len(crude) - 1)
        for step in range(span + 1):
            i = len(crude) - 1 - step
            weight = (span - step) / span if span else 1.0
            crude[i] *= 1.0 + (crude_shock_pct / 100.0) * weight
            fx[i] *= 1.0 + (fx_shock_pct / 100.0) * weight

    return bdry, crude, fx


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------

class _Registry:
    """Lazily loads and caches the pickled models, feature list and macro history."""

    def __init__(self):
        self._lock = threading.Lock()
        self._ready = False
        self.models = {}
        self.feature_columns = list(FEATURE_ORDER)
        self.macro = None
        self.medians = {}
        self.status = "loading"
        self.detail = ""

    # -- loading ----------------------------------------------------------
    def _load(self):
        self.macro = _load_macro()
        rows = _feature_frame(self.macro["bdry"], self.macro["crude"], self.macro["usdinr"])
        valid = [r for r in rows if r]
        self.medians = ({k: _median([r[k] for r in valid]) for k in FEATURE_ORDER}
                        if valid else {k: 0.0 for k in FEATURE_ORDER})

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

        missing = []
        for horizon in HORIZONS:
            path = MODEL_DIR / f"freight_forecast_{horizon}d.pkl"
            if not path.exists():
                missing.append(path.name)
                continue
            try:
                self.models[horizon] = joblib.load(path)
            except Exception as exc:  # noqa: BLE001
                missing.append(f"{path.name} ({exc.__class__.__name__})")

        if self.models:
            self.status = "active"
            loaded = ", ".join(f"{h}d" for h in sorted(self.models))
            self.detail = f"Gradient-boosted freight models loaded ({loaded})."
            if missing:
                self.detail += f" Unavailable: {', '.join(missing)}."
        else:
            self.status = "fallback"
            self.detail = f"No model artefacts in {MODEL_DIR.name}/ — analytic forecast in use."

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

    # -- inference --------------------------------------------------------
    def predict_delta(self, features, horizon):
        """Index-point change over the horizon. Returns (delta, served_by_model)."""
        model = self.models.get(horizon)
        if model is None:
            return _analytic_delta(features, horizon), False
        vector = [[features[c] for c in self.feature_columns]]
        try:
            with warnings.catch_warnings():
                # The vector is ordered by the pickled feature_columns, so the
                # "no feature names" notice is noise rather than a real risk.
                warnings.simplefilter("ignore")
                return float(model.predict(vector)[0]), True
        except Exception:  # noqa: BLE001
            return _analytic_delta(features, horizon), False


_REGISTRY = _Registry()


def _analytic_delta(features, horizon):
    """
    Momentum + mean-reversion stand-in used whenever a real model is not
    available. Same sign conventions as the trained model, so the dashboard
    reads the same either way.
    """
    momentum = features["BDRY_P_Diff_14"] / 14.0 + features["BDRY_P_Diff_5"] / 5.0
    reversion = features["BDRY_EMA_21"] * 0.35
    fuel = features["Crude_P_Diff_7"] * 0.012
    fx = features["USDINR_Diff_7"] * 0.05
    scale = math.sqrt(horizon / 14.0)
    return (momentum * 2.6 + reversion + fuel + fx) * scale


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------

def warm_up():
    """Load models at process start so the first request is not the slow one."""
    _REGISTRY.ensure()
    return model_status()


def model_status():
    _REGISTRY.ensure()
    horizons = sorted(_REGISTRY.models)
    return {
        "status": _REGISTRY.status,
        "active": _REGISTRY.status == "active",
        "detail": _REGISTRY.detail,
        "algorithm": "HistGradientBoostingRegressor (delta target)",
        "label": ("AI Model: Active · " + "/".join(f"{h}d" for h in horizons) + " GBM")
                 if horizons else "AI Model: Fallback · analytic forecast",
        "horizons": horizons or list(HORIZONS),
        "feature_count": len(_REGISTRY.feature_columns),
        "features": list(_REGISTRY.feature_columns),
        "r2": {str(h): MODEL_R2[h] for h in HORIZONS},
        "training_rows": len(_REGISTRY.macro["dates"]) if _REGISTRY.macro else 0,
        "training_source": _REGISTRY.macro["source"] if _REGISTRY.macro else "",
        "trained_through": _REGISTRY.macro["dates"][-1] if _REGISTRY.macro else "",
    }


def macro_baseline():
    """Latest observed macro levels — the values the sliders start from."""
    _REGISTRY.ensure()
    m = _REGISTRY.macro
    return {
        "bdry": round(m["bdry"][-1], 2),
        "brent_usd": round(m["crude"][-1], 2),
        "usd_inr": round(m["usdinr"][-1], 2),
        "as_of": m["dates"][-1],
        "source": m["source"],
    }


def _resolve_horizon(value):
    horizon = _to_float(value, 14)
    return min(HORIZONS, key=lambda h: abs(h - horizon))


def _drivers(features, horizon, base_delta, spot_index):
    """
    Per-feature attribution by ablation: replace one feature with its historical
    median, re-predict, and read off what the live value was worth. Works for the
    tree model and the analytic fallback alike.
    """
    out = []
    for key in FEATURE_ORDER:
        probe = dict(features)
        probe[key] = _REGISTRY.medians.get(key, 0.0)
        alt, _ = _REGISTRY.predict_delta(probe, horizon)
        contribution = base_delta - alt
        out.append({
            "key": key,
            "label": FEATURE_LABELS.get(key, key),
            "value": round(features[key], 4),
            "impact_pts": round(contribution, 4),
            "impact_pct": round(contribution / spot_index * 100.0, 2) if spot_index else 0.0,
            "direction": "up" if contribution > 0 else "down" if contribution < 0 else "flat",
        })

    out.sort(key=lambda d: abs(d["impact_pct"]), reverse=True)
    top = out[:5]
    peak = max((abs(d["impact_pct"]) for d in top), default=0.0) or 1.0
    for d in top:
        d["weight"] = round(abs(d["impact_pct"]) / peak, 3)
    return top


def _curve(horizon, spot, target, mid, rel_sigma):
    """
    Day-by-day index path from today to the horizon prediction.

    A 30-day request bends through the 14-day model's own number at its midpoint,
    so both artefacts genuinely shape the curve rather than one interpolating
    blind. Small seeded wobble keeps the optimal booking day meaningful without
    making the line look random.
    """
    rng = _seeded("bdry-curve", horizon, round(target, 3), round(spot, 3))
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    points = []

    for day in range(1, horizon + 1):
        if horizon > 14 and mid is not None:
            if day <= 14:
                level = spot + (mid - spot) * (day / 14.0) ** 0.85
            else:
                level = mid + (target - mid) * ((day - 14) / (horizon - 14.0)) ** 0.9
        else:
            level = spot + (target - spot) * (day / horizon) ** 0.85

        level *= 1.0 + rng.gauss(0, rel_sigma * 0.10)
        level = max(level, spot * 0.45)

        sigma = spot * rel_sigma * math.sqrt(day / horizon)
        points.append({
            "date": (start + timedelta(days=day)).strftime("%Y-%m-%d"),
            "day": day,
            "forecast": round(level, 2),
            "lower": round(max(level - 1.96 * sigma, spot * 0.35), 2),
            "upper": round(level + 1.96 * sigma, 2),
        })

    # Pin the endpoint to the model's own number — the wobble must not move it.
    points[-1]["forecast"] = round(target, 2)
    return points


def forecast_index(horizon=14, crude_shock_pct=0.0, fx_shock_pct=0.0, bdry_level=None):
    """
    Forecast the BDRY freight index over a 14- or 30-day horizon.

    Every argument is optional; a bare call returns the baseline forecast from
    the latest observed macro data.
    """
    _REGISTRY.ensure()

    horizon = _resolve_horizon(horizon)
    crude_shock = _clamp(_to_float(crude_shock_pct, 0.0) or 0.0, -30.0, 50.0)
    fx_shock = _clamp(_to_float(fx_shock_pct, 0.0) or 0.0, -15.0, 15.0)
    bdry_level = _to_float(bdry_level, None)
    if bdry_level is not None:
        bdry_level = _clamp(bdry_level, 4.0, 60.0)

    macro = _REGISTRY.macro
    bdry, crude, fx = _apply_scenario(macro, crude_shock, fx_shock, bdry_level)
    rows = _feature_frame(bdry, crude, fx)
    features = next((r for r in reversed(rows) if r), None)
    if features is None:  # series too short to build a feature row
        features = dict(_REGISTRY.medians)

    spot = bdry[-1]
    delta, served_by_model = _REGISTRY.predict_delta(features, horizon)
    target = max(spot + delta, spot * 0.4)

    daily_vol = features["Rolling_Vol_14"] or (spot * 0.012)
    rel_sigma = _clamp(
        (daily_vol * math.sqrt(horizon) * _RESIDUAL_RATIO[horizon]) / spot if spot else 0.06,
        0.015, 0.30)
    band = 1.96 * target * rel_sigma
    confidence = round(_clamp(
        1.0 - rel_sigma * 2.6 - (0.04 if not served_by_model else 0.0), 0.42, 0.95), 2)

    change_pct = (target - spot) / spot * 100.0 if spot else 0.0

    mid = None
    if horizon > 14:
        mid_delta, _ = _REGISTRY.predict_delta(features, 14)
        mid = spot + mid_delta

    points = _curve(horizon, spot, target, mid, rel_sigma)
    best = min(points, key=lambda p: p["forecast"])
    peak = max(points, key=lambda p: p["forecast"])
    window_saving = ((peak["forecast"] - best["forecast"]) / peak["forecast"] * 100.0
                     if peak["forecast"] else 0.0)

    history = [{"date": d, "index": round(v, 2)}
               for d, v in zip(macro["dates"][-90:], bdry[-90:])]

    return {
        "horizon_days": horizon,
        "unit": "BDRY pts",
        "as_of": macro["dates"][-1],
        "spot_index": round(spot, 2),
        "forecast_index": round(target, 2),
        "delta": round(delta, 3),
        "change_pct": round(change_pct, 2),
        "confidence_lower": round(max(target - band, spot * 0.35), 2),
        "confidence_upper": round(target + band, 2),
        "confidence": confidence,
        "trend_direction": ("RISING" if change_pct > 2.0
                            else "FALLING" if change_pct < -2.0 else "STABLE"),
        "history": history,
        "points": points,
        "best_entry": {"date": best["date"], "day": best["day"], "index": best["forecast"]},
        "peak": {"date": peak["date"], "day": peak["day"], "index": peak["forecast"]},
        "window_saving_pct": round(window_saving, 2),
        "key_drivers": _drivers(features, horizon, delta, spot),
        "scenario": {
            "horizon": horizon,
            "crude_shock_pct": crude_shock,
            "fx_shock_pct": fx_shock,
            "bdry_level": round(spot, 2),
        },
        "model": {**model_status(), "served_by_model": served_by_model,
                  "horizon_r2": MODEL_R2[horizon]},
    }
