"""System level routes such as the health check and index page."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from flask import Blueprint, current_app, jsonify, send_from_directory
from sqlalchemy import text

from mangasuperb.extensions import db

logger = logging.getLogger(__name__)

bp = Blueprint("system", __name__)


@bp.route("/")
def index() -> Any:
    """Serve the single-page application entry point."""
    return send_from_directory(current_app.static_folder, "index.html")


@bp.route("/health")
def health() -> Any:
    """Return the status of downstream dependencies."""
    return jsonify(
        {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {
                "database": _check_database(),
                "redis": _check_redis(),
                "r2": _check_r2(),
            },
        }
    )


def _check_database() -> str:
    try:
        db.session.execute(text("SELECT 1"))
        return "connected"
    except Exception as exc:  # pragma: no cover - infrastructure
        logger.error("Database check failed: %s", exc)
        return "disconnected"


def _check_redis() -> str:
    redis_conn = current_app.extensions.get("redis_conn")
    try:
        if redis_conn:
            redis_conn.ping()
            return "connected"
        return "unconfigured"
    except Exception as exc:  # pragma: no cover - infrastructure
        logger.error("Redis check failed: %s", exc)
        return "disconnected"


def _check_r2() -> str:
    storage = current_app.extensions.get("r2_storage")
    try:
        if storage and storage.check_bucket_exists():
            return "connected"
        return "bucket_not_found"
    except Exception as exc:  # pragma: no cover - infrastructure
        logger.error("R2 check failed: %s", exc)
        return "disconnected"
