"""Bulk cargo sourcing optimiser endpoints."""

from flask import Blueprint, jsonify, request

from ..services import steel_engine

steel_bp = Blueprint("steel", __name__, url_prefix="/api/steel")


def _json_body():
    """
    (body, error) for a POST.

    An absent body is fine — every field is optional, so `{}` is the documented
    baseline request. A body that was *sent* but does not parse, or parses to
    something other than an object, is a client error rather than a silent
    fallback to defaults.
    """
    if not request.get_data():
        return {}, None
    payload = request.get_json(silent=True)
    if payload is None:
        return None, "Request body is not valid JSON."
    if not isinstance(payload, dict):
        return None, "Request body must be a JSON object."
    return payload, None


@steel_bp.get("/options")
def options():
    """Plants, ports, vessel classes, suppliers, macro baseline and slider ranges."""
    try:
        return jsonify(steel_engine.options())
    except Exception as exc:  # noqa: BLE001 — the panel must always get a payload
        return jsonify({"error": "Unable to build sourcing options.",
                        "detail": str(exc)}), 503


@steel_bp.post("/plan")
def plan():
    """
    Optimal sourcing plan for one steel plant.

    Body (every field optional) — ML/app.py's sidebar:
        plant            rourkela | bokaro | vizag
        vessel           capesize | panamax | supramax
        volume_t         10000 .. 500000
        spot_ratio_pct   0 .. 100     spot auction share; LTC takes the rest
        crude_shock_pct  -30 .. 50    defaults to the live 14-day 95% Brent VaR
        port_delay_days  0 .. 8       simulated port congestion spike
        godown_rate_inr  20 .. 120    plant stockyard rate (defaults per plant)
        slow_steaming    true | false
        track_in_transit true | false mid-voyage telemetry for the chosen routing
        voyage_day       1 .. 20      days already elapsed on that passage
    """
    payload, error = _json_body()
    if error:
        return jsonify({"error": "Invalid request.", "detail": error}), 400
    try:
        return jsonify(steel_engine.plan(payload))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": "Sourcing plan failed.", "detail": str(exc)}), 500
