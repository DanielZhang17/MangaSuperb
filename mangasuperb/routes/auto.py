"""Auto-mode preparation endpoints."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.services.ai_provider import get_text_provider
from mangasuperb.services.auto_prep import (
    extract_cast_candidates,
    prepare_characters_from_candidates,
)

bp = Blueprint("auto", __name__, url_prefix="/api/auto")

ALLOWED_AI_PROVIDER_VALUES = {"gemini", "third_party", "openai"}


def _normalise_ai_provider(value: Any, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")

    provider = value.strip().lower()
    if not provider:
        return None
    if provider not in ALLOWED_AI_PROVIDER_VALUES:
        raise ValueError(f"{field} must be 'gemini', 'third_party', or 'openai'")
    return "third_party" if provider == "openai" else provider


@bp.post("/characters/prepare")
@login_required
def prepare_characters() -> Any:
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    elif not isinstance(payload, Mapping):
        return jsonify({"error": "JSON body must be an object"}), 400

    story_raw = payload.get("story")
    if story_raw is None:
        story = ""
    elif not isinstance(story_raw, str):
        return jsonify({"error": "Story must be a string"}), 400
    else:
        story = story_raw.strip()
    if not story:
        return jsonify({"error": "Story is required"}), 400

    style_preference_raw = payload.get("style_preference")
    if style_preference_raw is None:
        style_preference = None
    elif not isinstance(style_preference_raw, str):
        return jsonify({"error": "style_preference must be a string"}), 400
    else:
        style_preference = style_preference_raw.strip() or None

    try:
        text_provider_id = _normalise_ai_provider(
            payload.get("text_provider"),
            "text_provider",
        )
        image_provider_id = _normalise_ai_provider(
            payload.get("image_provider"),
            "image_provider",
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        candidates = extract_cast_candidates(
            story,
            text_provider=get_text_provider(text_provider_id),
            style_preference=style_preference,
        )
        result = prepare_characters_from_candidates(
            user_id=current_user.id,
            candidates=candidates,
            image_provider=image_provider_id,
        )
    except Exception:
        current_app.logger.exception("Auto character preparation failed")
        return jsonify({"error": "Failed to prepare characters"}), 502

    return jsonify(result), 200
