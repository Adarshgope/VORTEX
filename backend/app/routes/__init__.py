"""Blueprint registry."""

from .auth_routes import auth_bp
from .predict_routes import predict_bp
from .steel_routes import steel_bp

BLUEPRINTS = (auth_bp, steel_bp, predict_bp)
