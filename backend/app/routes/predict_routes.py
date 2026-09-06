"""Freight index forecasting endpoints."""

from flask import Blueprint, jsonify, request

from ..services import ml_engine

predict_bp = Blueprint("predict", __name__, url_prefix="/api/predict")


@predict_bp.post("/freight")
def predict_freight():
    """
    BDRY freight index forecast.

    Body (every field optional):
        horizon           14 | 30
        crude_shock_pct   -30 .. 50
        fx_shock_pct      -15 .. 15
        bdry_level        index level to forecast from
    """
    payload = request.get_json(silent=True)
    if payload is not None and not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400
    body = payload or {}
    try:
        return jsonify(ml_engine.forecast_index(
            horizon=body.get("horizon", 14),
            crude_shock_pct=body.get("crude_shock_pct", 0),
            fx_shock_pct=body.get("fx_shock_pct", 0),
            bdry_level=body.get("bdry_level"),
        ))
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": "Forecast failed.", "detail": str(exc)}), 500


@predict_bp.get("/status")
def predict_status():
    """Model health for the dashboard badge."""
    return jsonify(ml_engine.model_status())
