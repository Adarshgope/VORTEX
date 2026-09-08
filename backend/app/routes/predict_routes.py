"""
Freight index forecasting endpoints.

    POST /api/predict/freight   14-day BDRY forecast for a scenario
    GET  /api/predict/freight   same, driven by query string (handy for curl)
    GET  /api/predict/status    model + live-feed health for the dashboard badge
    GET  /api/predict/macro     latest observed macro levels
    POST /api/predict/refresh   force a live market pull, then re-baseline

Scenario fields are ML/app.py's sidebar. Every one is optional; a bare `{}`
returns the baseline forecast. A *missing* field takes its default silently, a
*present but unparseable* field is a client error and gets a 400 naming it,
and a value outside its band is clamped with a note in `warnings` rather than
rejected — an operator dragging a slider past the end should still get an
answer.
"""

from flask import Blueprint, jsonify, request

from ..domain import VESSEL_BY_ID, VESSELS
from ..services import ml_engine

predict_bp = Blueprint("predict", __name__, url_prefix="/api/predict")

# field -> (low, high). Mirrors the clamps inside ml_engine.forecast_index.
_RANGES = {
    "crude_shock_pct": ml_engine.CRUDE_SHOCK_RANGE,
    "port_delay_days": ml_engine.PORT_DELAY_RANGE,
    "godown_rate_inr": ml_engine.GODOWN_RANGE,
}


def _json_body():
    """(body, error) for a POST — absent is fine, unparseable is a 400."""
    if not request.get_data():
        return {}, None
    payload = request.get_json(silent=True)
    if payload is None:
        return None, "Request body is not valid JSON."
    if not isinstance(payload, dict):
        return None, "Request body must be a JSON object."
    return payload, None


def _numeric(payload, field, warnings):
    """
    Pull one optional numeric field. Returns (value, error): value None when
    absent (the engine applies its default); error set when present but junk.
    """
    if field not in payload:
        return None, None
    raw = payload[field]
    if raw is None or raw == "":
        return None, None
    if isinstance(raw, bool):
        return None, f"'{field}' must be a number, got a boolean."
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None, f"'{field}' must be a number, got {type(raw).__name__} ({raw!r})."
    if value != value or value in (float("inf"), float("-inf")):
        return None, f"'{field}' must be a finite number."
    low, high = _RANGES[field]
    if value < low or value > high:
        warnings.append(f"'{field}' {value:g} is outside {low:g}..{high:g} and was clamped.")
    return value, None


def _vessel_factor(payload):
    """(scale_freight_factor, error). Missing -> Capesize, ML/app.py's default."""
    raw = payload.get("vessel")
    if raw is None or raw == "":
        return VESSELS[0]["scale_freight_factor"], None
    vessel = VESSEL_BY_ID.get(str(raw).strip().lower())
    if vessel is None:
        return None, (f"'vessel' must be one of "
                      f"{', '.join(v['id'] for v in VESSELS)}; got {raw!r}.")
    return vessel["scale_freight_factor"], None


def _forecast(payload):
    warnings, kwargs = [], {}
    for field in _RANGES:
        value, error = _numeric(payload, field, warnings)
        if error:
            return jsonify({"error": "Invalid forecast input.", "detail": error}), 400
        if value is not None:
            kwargs[field] = value
    factor, error = _vessel_factor(payload)
    if error:
        return jsonify({"error": "Invalid forecast input.", "detail": error}), 400

    try:
        result = ml_engine.forecast_index(
            crude_shock_pct=kwargs.get("crude_shock_pct", 0.0),
            port_delay_days=kwargs.get("port_delay_days", 0.0),
            godown_rate_inr=kwargs.get("godown_rate_inr"),
            vessel_factor=factor,
        )
    except Exception as exc:  # noqa: BLE001 — a broken model must not 500 blindly
        return jsonify({"error": "Forecast failed.",
                        "detail": f"{exc.__class__.__name__}: {exc}"}), 500
    if warnings:
        result["warnings"] = warnings
    return jsonify(result)


@predict_bp.post("/freight")
def predict_freight():
    """
    14-day BDRY freight index forecast.

    Body (every field optional):
        crude_shock_pct   -30 .. 50      Brent crude shock
        port_delay_days   0 .. 8         simulated port congestion spike
        godown_rate_inr   20 .. 120      plant stockyard rate
        vessel            capesize | panamax | supramax
    """
    payload, error = _json_body()
    if error:
        return jsonify({"error": "Invalid request.", "detail": error}), 400
    return _forecast(payload)


@predict_bp.get("/freight")
def predict_freight_get():
    """Same forecast from a query string: ?crude_shock_pct=10&port_delay_days=2"""
    return _forecast(request.args.to_dict())


@predict_bp.get("/status")
def predict_status():
    """Model health for the dashboard badge, including live-feed state."""
    return jsonify(ml_engine.model_status())


@predict_bp.get("/macro")
def predict_macro():
    """Latest observed BDRY / Brent / USD-INR, and where they came from."""
    return jsonify({**ml_engine.macro_baseline(), "feed": ml_engine.live_status()})


@predict_bp.post("/refresh")
def predict_refresh():
    """Force a live market pull. A feed that is down returns 200, refreshed: false."""
    try:
        return jsonify(ml_engine.refresh_live(force=True))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": "Live refresh failed.",
                        "detail": f"{exc.__class__.__name__}: {exc}"}), 502
