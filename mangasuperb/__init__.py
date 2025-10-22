"""Flask application factory for MangaSuperb."""
from __future__ import annotations

import logging
from typing import Any, Type

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from config import Config
from mangasuperb.extensions import db, init_extensions, login_manager
from mangasuperb.routes import register_blueprints
from storage import R2Storage
from swagger import register_swagger


def create_app(config_object: Type[Config] | str | None = None) -> Flask:
    """Create and configure a Flask application instance."""
    config_object = config_object or Config

    app = Flask(__name__, static_folder="static")
    app.config.from_object(config_object)

    _configure_logging(app)
    init_extensions(app)
    _register_login_handlers()
    register_blueprints(app)
    register_swagger(app)
    _register_error_handlers(app)

    storage_config = config_object if hasattr(config_object, "R2_BUCKET_NAME") else Config
    app.extensions["r2_storage"] = R2Storage(storage_config)

    config_name = getattr(storage_config, "__name__", storage_config.__class__.__name__)
    app.logger.info("Application initialised with config %s", config_name)
    return app


def _configure_logging(app: Flask) -> None:
    """Configure structured logging for the application."""
    level_name = str(app.config.get("LOG_LEVEL", "INFO")).upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    app.logger.setLevel(level)


def _register_login_handlers() -> None:
    """Attach Flask-Login hooks for user loading and auth failures."""
    from models import User  # Local import to avoid circular dependency

    @login_manager.user_loader
    def load_user(user_id: str) -> User | None:  # type: ignore[name-defined]
        try:
            return db.session.get(User, int(user_id))
        except (TypeError, ValueError):
            return None

    @login_manager.unauthorized_handler
    def unauthorized() -> tuple[Any, int]:
        return jsonify({"error": "Authentication required"}), 401


def _register_error_handlers(app: Flask) -> None:
    """Return JSON responses for HTTP and unhandled exceptions."""

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        response = jsonify({"error": exc.description})
        return response, exc.code

    @app.errorhandler(Exception)
    def handle_exception(exc: Exception):
        app.logger.exception("Unhandled exception: %%s", exc)
        return jsonify({"error": "Internal server error"}), 500
