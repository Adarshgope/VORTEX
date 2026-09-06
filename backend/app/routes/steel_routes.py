"""Bulk cargo sourcing optimiser endpoints."""

from flask import Blueprint, jsonify, request

from ..services import steel_engine

steel_bp = Blueprint("steel", __name__, url_prefix="/api/steel")


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

    Body (every field optional):
        plant            rourkela | bokaro | vizag
        vessel           capesize | panamax | supramax
        volume_t         10000 .. 500000
        crude_shock_pct  -30 .. 50
        vlsfo_usd_per_t  bunker price override; defaults to Brent parity
        usd_inr          working exchange rate
        bdry             freight index level
        slow_steaming    true | false
        horizon          14 | 30
    """
    payload = request.get_json(silent=True)
    if payload is not None and not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400
    try:
        return jsonify(steel_engine.plan(payload or {}))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": "Sourcing plan failed.", "detail": str(exc)}), 500
