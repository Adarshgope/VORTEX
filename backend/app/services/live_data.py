"""
Live market data — the ingestion half of the ML pipeline, at request time.

`ML/data.py` and `ML/src/run_all_data.py` pull three daily series off Yahoo
Finance and write them to CSV for training:

    BDRY      Breakwave Dry Bulk Shipping ETF   -> Freight_Index_BDRY
    BZ=F      Brent crude futures               -> Brent_Crude_USD
    USDINR=X  rupee spot                        -> USD_INR_Exchange_Rate

This module performs the identical pull while the API is running, so forecasts
come off today's market instead of the snapshot frozen into
`app/ml_models/master_features_training.csv`.

Why the swap is safe
--------------------
The live feed and the training CSV are the *same series*. On 2026-07-20 — the
CSV's last row — the live pull returns BDRY 12.19, Brent 89.22, USD/INR 96.28,
matching the CSV to the cent. Nothing about the feature distribution shifts; the
model simply sees current data rather than data that stops seven weeks back.

Everything here is optional
---------------------------
A missing yfinance, no network, a Yahoo outage or a changed response schema all
end the same way: `fetch_macro()` returns None and `ml_engine` stays on the
bundled CSV. Nothing in this module is allowed to raise into a request.

Controlled by two environment variables:

    VORTEX_LIVE_DATA=0    disable the live feed entirely (offline demos)
    VORTEX_LIVE_TTL=3600  seconds before a cached pull is considered stale
"""

import os
import threading
import time
import warnings

# Matches the ttl=3600 on ML/app.py's `@st.cache_data` market fetch.
_DEFAULT_TTL = 3600

# ML/data.py pulls from 2021-01-01. The models only need ~60 sessions of history
# to build their features, but a long window keeps the rolling statistics and
# the 90-day chart history well conditioned.
_START = "2021-01-01"

TICKERS = ["BDRY", "BZ=F", "USDINR=X"]

# The renames applied in ML/data.py and ML/src/run_all_data.py.
_COLUMN_MAP = {
    "BDRY": "bdry",
    "BZ=F": "crude",
    "USDINR=X": "usdinr",
}

_MIN_ROWS = 60  # mirrors ml_engine._MIN_SERIES — below this the recipe is invalid


def enabled():
    """False when the operator has switched the live feed off."""
    return os.environ.get("VORTEX_LIVE_DATA", "1").strip().lower() not in (
        "0", "false", "no", "off")


def ttl_seconds():
    try:
        return max(60, int(os.environ.get("VORTEX_LIVE_TTL", _DEFAULT_TTL)))
    except (TypeError, ValueError):
        return _DEFAULT_TTL


def available():
    """True when yfinance can actually be imported in this environment."""
    try:
        import yfinance  # noqa: F401
        return True
    except Exception:  # noqa: BLE001 — an import-time error is just "unavailable"
        return False


# ---------------------------------------------------------------------------
# The pull
# ---------------------------------------------------------------------------

def _download():
    """
    Raw yfinance call, isolated so the caller only has to handle None.

    `auto_adjust=False` is explicit rather than defaulted: the training CSV was
    built on unadjusted closes, and yfinance has flipped that default before.
    `threads=False` keeps the call deterministic for three tickers.
    """
    import yfinance as yf

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        raw = yf.download(
            TICKERS,
            start=_START,
            interval="1d",
            progress=False,
            auto_adjust=False,
            threads=False,
        )

    if raw is None or len(raw) == 0:
        return None

    # Multi-ticker downloads come back with a (field, ticker) column MultiIndex.
    close = raw["Close"] if "Close" in raw.columns.get_level_values(0) else None
    if close is None or close.empty:
        return None
    return close


def _to_series(close):
    """DataFrame -> the plain-Python dict shape ml_engine consumes."""
    missing = [t for t in TICKERS if t not in close.columns]
    if missing:
        return None

    # Forward-fill non-trading gaps exactly as ML/data.py does, then drop any
    # leading rows where a ticker had not started trading yet.
    frame = close[TICKERS].ffill().dropna()
    if len(frame) < _MIN_ROWS:
        return None

    out = {"dates": [], "bdry": [], "crude": [], "usdinr": []}
    for stamp, row in frame.iterrows():
        values = {}
        for ticker in TICKERS:
            try:
                value = float(row[ticker])
            except (TypeError, ValueError):
                values = None
                break
            # A NaN or inf that survived dropna would poison the feature frame.
            if value != value or value in (float("inf"), float("-inf")) or value <= 0:
                values = None
                break
            values[_COLUMN_MAP[ticker]] = value
        if not values:
            continue
        out["dates"].append(str(stamp)[:10])
        out["bdry"].append(values["bdry"])
        out["crude"].append(values["crude"])
        out["usdinr"].append(values["usdinr"])

    if len(out["dates"]) < _MIN_ROWS:
        return None

    out["source"] = "Yahoo Finance live feed (BDRY, BZ=F, USDINR=X)"
    out["live"] = True
    return out


def fetch_macro():
    """
    Pull the three macro series. Returns the ml_engine series dict, or None if
    the feed is unavailable for any reason whatsoever.
    """
    if not (enabled() and available()):
        return None
    try:
        close = _download()
        if close is None:
            return None
        return _to_series(close)
    except Exception:  # noqa: BLE001 — a live feed must never break the API
        return None


# ---------------------------------------------------------------------------
# TTL cache
# ---------------------------------------------------------------------------

class _Cache:
    """One in-flight pull at a time; every other caller reads what is cached."""

    def __init__(self):
        self._lock = threading.Lock()
        self.series = None
        self.fetched_at = 0.0
        self.last_error = ""
        self.attempts = 0

    def stale(self):
        return (time.time() - self.fetched_at) > ttl_seconds()

    def get(self, force=False):
        """Return (series, refreshed). `series` is None when the feed is down."""
        if not force and self.series is not None and not self.stale():
            return self.series, False

        with self._lock:
            # Another thread may have refreshed while this one waited.
            if not force and self.series is not None and not self.stale():
                return self.series, False

            self.attempts += 1
            series = fetch_macro()
            if series:
                self.series = series
                self.fetched_at = time.time()
                self.last_error = ""
                return series, True

            self.last_error = (
                "live feed disabled" if not enabled()
                else "yfinance not installed" if not available()
                else "no usable rows returned"
            )
            # Keep serving the previous good pull rather than dropping to the
            # CSV the moment one request to Yahoo fails.
            return self.series, False


_CACHE = _Cache()


def get_macro(force=False):
    return _CACHE.get(force=force)


def status():
    """Feed health for /api/health and the dashboard badge."""
    age = time.time() - _CACHE.fetched_at if _CACHE.fetched_at else None
    return {
        "enabled": enabled(),
        "available": available(),
        "connected": _CACHE.series is not None,
        "as_of": _CACHE.series["dates"][-1] if _CACHE.series else None,
        "rows": len(_CACHE.series["dates"]) if _CACHE.series else 0,
        "age_seconds": round(age) if age is not None else None,
        "ttl_seconds": ttl_seconds(),
        "stale": _CACHE.stale() if _CACHE.series else None,
        "attempts": _CACHE.attempts,
        "last_error": _CACHE.last_error,
        "tickers": list(TICKERS),
    }
