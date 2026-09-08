"""VORTEX Flask application factory."""

from datetime import datetime, timezone

from flask import Flask, jsonify

from . import config
from .db import db_status, init_db
from .routes import BLUEPRINTS
from .services import ml_engine


def _install_cors(app):
    """
    Try flask-cors; fall back to a hand-rolled header pass so the API still
    works from the Vite dev server on a bare `pip install flask` environment.
    """
    try:
        from flask_cors import CORS
        CORS(app, resources={r"/api/*": {"origins": "*"}})
        return
    except ImportError:
        pass

    @app.after_request
    def _cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response

    @app.route("/api/<path:_any>", methods=["OPTIONS"])
    def _preflight(_any):
        return ("", 204)


def create_app():
    app = Flask(__name__)
    app.config["JSON_SORT_KEYS"] = False
    app.config["SECRET_KEY"] = config.SECRET_KEY

    _install_cors(app)
    init_db()

    # Pull the freight models into memory now rather than on the first request,
    # and kick the live macro pull onto a background thread. A load failure is
    # not fatal — ml_engine falls back to the bundled CSV, then to its analytic
    # model. Retained for the start-up banner; /api/health reports live state.
    app.config["ML_STATUS"] = ml_engine.warm_up()

    for bp in BLUEPRINTS:
        app.register_blueprint(bp)

    @app.get("/api/health")
    def health():
        return jsonify({
            "status": "ok",
            "service": "VORTEX API",
            "message": "VORTEX API online",
            "problem_statement": "SIH26006",
            "version": "1.0.0",
            "time": datetime.now(timezone.utc).isoformat(),
            "database": db_status(),
            # Read live rather than served from ML_STATUS: the macro feed swaps
            # in on a background thread after start-up, so the snapshot taken in
            # create_app() goes stale within seconds of boot.
            "ml": ml_engine.model_status(),
        })

    @app.get("/")
    def index():
        return jsonify({
            "service": "VORTEX — Vessel Optimization & Rate Tracking for East-coast eXports/imports",
            "docs": "/api/health",
            "endpoints": sorted(
                str(r.rule) for r in app.url_map.iter_rules() if str(r.rule).startswith("/api")
            ),
        })

    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"error": "Endpoint not found."}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error.", "detail": str(e)}), 500

    return app
