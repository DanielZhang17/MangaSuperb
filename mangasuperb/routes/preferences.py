"""User preference management endpoints."""
from __future__ import annotations

import logging
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from models import (
    DEFAULT_COLOR_MODES,
    DEFAULT_LAYOUT_OPTIONS,
    User,
)

logger = logging.getLogger(__name__)

bp = Blueprint("preferences", __name__, url_prefix="/api/preferences")


def _preference_response(preferences: dict[str, Any]) -> Any:
    return jsonify(
        {
            "preferences": preferences,
            "layout_options": list(DEFAULT_LAYOUT_OPTIONS),
            "color_modes": list(DEFAULT_COLOR_MODES),
        }
    )


@bp.get("")
@login_required
def get_preferences() -> Any:
    preferences = current_user.get_preferences()
    return _preference_response(preferences)


@bp.put("")
@login_required
def update_preferences() -> Any:
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Payload must be a JSON object"}), 400

    try:
        updated = current_user.apply_preferences_update(payload)
        db.session.commit()
    except Exception as exc:  # pragma: no cover - defensive logging
        db.session.rollback()
        logger.exception("Failed to update preferences for user_id=%s: %s", current_user.id, exc)
        return jsonify({"error": "Failed to update preferences"}), 500

    current_app.logger.info("Preferences updated for user_id=%s", current_user.id)
    return _preference_response(updated)
