"""System level routes such as the health check and index page."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from flask import Blueprint, current_app, jsonify, send_from_directory
from sqlalchemy import text

from rq import Worker

from mangasuperb.extensions import db
from mangasuperb.services.ai_provider import available_ai_providers

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
                "rq_workers": _check_workers(),
            },
        }
    )


@bp.route("/api/ai/providers")
def ai_providers() -> Any:
    """Return configured AI providers for frontend selection."""

    return jsonify(available_ai_providers())


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


def _check_workers() -> dict[str, Any]:
    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return {"status": "unconfigured", "active": 0, "workers": []}
    try:
        workers = Worker.all(queue.connection)
        attached: list[str] = []
        for worker in workers:
            queue_names = {q.name for q in getattr(worker, "queues", [])}
            if queue.name in queue_names:
                attached.append(worker.name or worker.key)
        status = "active" if attached else "idle"
        return {"status": status, "active": len(attached), "workers": attached}
    except Exception as exc:  # pragma: no cover - infrastructure
        logger.error("RQ worker check failed: %s", exc)
        return {"status": "error", "active": 0, "workers": []}


def _check_r2() -> str:
    storage = current_app.extensions.get("r2_storage")
    try:
        if storage and storage.check_bucket_exists():
            return "connected"
        return "bucket_not_found"
    except Exception as exc:  # pragma: no cover - infrastructure
        logger.error("R2 check failed: %s", exc)
        return "disconnected"
