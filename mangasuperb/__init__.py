"""Flask application factory for MangaSuperb."""
from __future__ import annotations

import logging
import os
from typing import Any, Type

from flask import Flask, current_app, jsonify, request
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from config import Config
from mangasuperb.extensions import db, init_extensions, login_manager
from mangasuperb.db_utils import ensure_aspect_ratio_constraint
from mangasuperb.routes import register_blueprints
from storage import R2Storage
from swagger import register_swagger


def create_app(config_object: Type[Config] | str | None = None) -> Flask:
    """Create and configure a Flask application instance."""
    config_object = config_object or Config

    app = Flask(__name__, static_folder="static", static_url_path="/")
    app.config.from_object(config_object)

    if app.config.get("PROXY_FIX_ENABLED", False):
        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=app.config.get("PROXY_FIX_FOR", 1),
            x_proto=app.config.get("PROXY_FIX_PROTO", 1),
            x_host=app.config.get("PROXY_FIX_HOST", 1),
            x_port=app.config.get("PROXY_FIX_PORT", 1),
            x_prefix=app.config.get("PROXY_FIX_PREFIX", 0),
        )

    _configure_logging(app)
    init_extensions(app)
    ensure_aspect_ratio_constraint(app)
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
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    logging.basicConfig(
        level=level,
        format=log_format,
    )
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    app.logger.setLevel(level)

    log_file = app.config.get("LOG_FILE")
    if log_file:
        _add_file_handler(root_logger, os.fspath(log_file), level, log_format)


def _add_file_handler(
    logger: logging.Logger,
    log_file: str,
    level: int,
    log_format: str,
) -> None:
    """Attach a file handler once for an absolute log path."""
    log_path = os.path.abspath(log_file)
    for handler in logger.handlers:
        if (
            isinstance(handler, logging.FileHandler)
            and getattr(handler, "baseFilename", None) == log_path
        ):
            handler.setLevel(level)
            return

    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(level)
    file_handler.setFormatter(logging.Formatter(log_format))
    logger.addHandler(file_handler)


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
        if (
            exc.code == 404
            and request.method == "GET"
            and request.accept_mimetypes.accept_html
        ):
            path = request.path or ""
            # Allow API and asset 404s to fall through to the client
            if not (
                path.startswith("/api")
                or path.startswith("/swagger")
                or "." in path.rsplit("/", 1)[-1]
            ):
                try:
                    return current_app.send_static_file("index.html"), 200
                except (FileNotFoundError, RuntimeError):
                    app.logger.warning("SPA fallback failed to locate index.html", exc_info=True)

        response = jsonify({"error": exc.description})
        return response, exc.code

    @app.errorhandler(Exception)
    def handle_exception(exc: Exception):
        app.logger.exception("Unhandled exception: %s", exc)
        return jsonify({"error": "Internal server error"}), 500
