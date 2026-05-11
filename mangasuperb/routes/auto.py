"""Auto-mode preparation endpoints."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from mangasuperb.services.ai_provider import get_text_provider
from mangasuperb.services.auto_prep import (
    extract_cast_candidates,
    prepare_characters_from_candidates,
)
from mangasuperb.services.auto_runs import (
    AutoRunConflictError,
    abort_auto_run,
    create_auto_run,
    enqueue_auto_run,
    get_active_auto_run,
    get_auto_run_for_user,
    get_latest_auto_run,
    resolve_auto_run,
    retry_auto_run,
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


def _json_object() -> tuple[dict[str, Any] | None, Any | None]:
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    if not isinstance(payload, Mapping):
        return None, (jsonify({"error": "JSON body must be an object"}), 400)
    return dict(payload), None


def _required_text(payload: Mapping[str, Any], field: str) -> str | tuple[Any, int]:
    value = payload.get(field)
    if not isinstance(value, str):
        return jsonify({"error": f"{field} is required"}), 400
    cleaned = value.strip()
    if not cleaned:
        return jsonify({"error": f"{field} is required"}), 400
    return cleaned


def _auto_run_payload(auto_run) -> dict[str, Any]:
    payload = {"auto_run": auto_run.to_dict()}
    if auto_run.comic:
        payload["comic"] = auto_run.comic.to_dict()
    return payload


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


@bp.post("/runs")
@login_required
def create_auto_run_endpoint() -> Any:
    payload, error = _json_object()
    if error:
        return error
    assert payload is not None

    title = _required_text(payload, "title")
    if not isinstance(title, str):
        return title
    story = _required_text(payload, "story")
    if not isinstance(story, str):
        return story

    preferences = payload.get("preferences")
    if preferences is None:
        preferences = {}
    elif not isinstance(preferences, Mapping):
        return jsonify({"error": "preferences must be an object"}), 400
    else:
        preferences = dict(preferences)

    try:
        if "text_provider" in preferences:
            preferences["text_provider"] = _normalise_ai_provider(
                preferences.get("text_provider"),
                "text_provider",
            )
        if "image_provider" in preferences:
            preferences["image_provider"] = _normalise_ai_provider(
                preferences.get("image_provider"),
                "image_provider",
            )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    comic_id_raw = payload.get("comic_id")
    comic_id = None
    if comic_id_raw is not None:
        try:
            comic_id = int(comic_id_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "comic_id must be an integer"}), 400

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    try:
        auto_run, comic = create_auto_run(
            user_id=current_user.id,
            comic_id=comic_id,
            title=title,
            story=story,
            preferences=preferences,
        )
        enqueue_auto_run(queue, auto_run)
        db.session.refresh(auto_run)
        db.session.refresh(comic)
    except AutoRunConflictError as exc:
        conflict_payload = exc.auto_run.to_dict()
        db.session.rollback()
        return jsonify({"error": str(exc), "auto_run": conflict_payload}), 409
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        current_app.logger.exception("Auto run creation failed")
        db.session.rollback()
        return jsonify({"error": "Failed to create Auto run"}), 500

    return jsonify({"auto_run": auto_run.to_dict(), "comic": comic.to_dict()}), 202


@bp.get("/runs/active")
@login_required
def get_active_auto_run_endpoint() -> Any:
    comic_id_raw = request.args.get("comic_id")
    comic_id = None
    if comic_id_raw:
        try:
            comic_id = int(comic_id_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "comic_id must be an integer"}), 400

    auto_run = get_active_auto_run(current_user.id, comic_id)
    if not auto_run:
        return jsonify({"auto_run": None}), 200
    return jsonify(_auto_run_payload(auto_run)), 200


@bp.get("/runs/latest")
@login_required
def get_latest_auto_run_endpoint() -> Any:
    comic_id_raw = request.args.get("comic_id")
    if not comic_id_raw:
        return jsonify({"error": "comic_id is required"}), 400

    try:
        comic_id = int(comic_id_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "comic_id must be an integer"}), 400

    auto_run = get_latest_auto_run(current_user.id, comic_id)
    if not auto_run:
        return jsonify({"auto_run": None}), 200
    return jsonify(_auto_run_payload(auto_run)), 200


@bp.get("/runs/<int:auto_run_id>")
@login_required
def get_auto_run_endpoint(auto_run_id: int) -> Any:
    auto_run = get_auto_run_for_user(current_user.id, auto_run_id)
    if not auto_run:
        return jsonify({"error": "Auto run not found"}), 404
    return jsonify(_auto_run_payload(auto_run)), 200


@bp.post("/runs/<int:auto_run_id>/abort")
@login_required
def abort_auto_run_endpoint(auto_run_id: int) -> Any:
    auto_run = get_auto_run_for_user(current_user.id, auto_run_id)
    if not auto_run:
        return jsonify({"error": "Auto run not found"}), 404
    abort_auto_run(auto_run)
    return jsonify({"auto_run": auto_run.to_dict()}), 200


@bp.post("/runs/<int:auto_run_id>/retry")
@login_required
def retry_auto_run_endpoint(auto_run_id: int) -> Any:
    auto_run = get_auto_run_for_user(current_user.id, auto_run_id)
    if not auto_run:
        return jsonify({"error": "Auto run not found"}), 404

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    try:
        retry_auto_run(queue, auto_run)
        db.session.refresh(auto_run)
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        current_app.logger.exception("Auto run retry failed")
        db.session.rollback()
        return jsonify({"error": "Failed to retry Auto run"}), 500

    return jsonify(_auto_run_payload(auto_run)), 202


@bp.post("/runs/<int:auto_run_id>/resolve")
@login_required
def resolve_auto_run_endpoint(auto_run_id: int) -> Any:
    payload, error = _json_object()
    if error:
        return error
    assert payload is not None

    auto_run = get_auto_run_for_user(current_user.id, auto_run_id)
    if not auto_run:
        return jsonify({"error": "Auto run not found"}), 404

    selected_character_ids = payload.get("selected_character_ids")
    if selected_character_ids is None:
        selected_character_ids = payload.get("character_ids")
    if isinstance(selected_character_ids, str) or not isinstance(selected_character_ids, list):
        return jsonify({"error": "selected_character_ids must be a list"}), 400

    character_roles = payload.get("character_roles") or {}
    if not isinstance(character_roles, Mapping):
        return jsonify({"error": "character_roles must be an object"}), 400

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    try:
        resolve_auto_run(
            queue,
            auto_run,
            selected_character_ids=selected_character_ids,
            character_roles=dict(character_roles),
        )
        db.session.refresh(auto_run)
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        current_app.logger.exception("Auto run resolve failed")
        db.session.rollback()
        return jsonify({"error": "Failed to resolve Auto run"}), 500

    return jsonify(_auto_run_payload(auto_run)), 202
