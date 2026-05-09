"""Routes for creating and retrieving character resources."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from mangasuperb.extensions import db
from mangasuperb.services.generation import (
    normalize_reference_images,
    optimize_character_description,
)
from models import Character
from swagger import (
    CHARACTER_CREATE_DOC,
    CHARACTER_DETAIL_DOC,
    CHARACTER_LIST_DOC,
    CHARACTER_RENAME_DOC,
    CHARACTER_DELETE_DOC,
)

logger = logging.getLogger(__name__)

bp = Blueprint("characters", __name__, url_prefix="/api/characters")

ALLOWED_SEX_VALUES = {"male", "female", "non-binary", "unspecified", "other"}
ALLOWED_SEX_VALUES_MESSAGE = ", ".join(sorted(ALLOWED_SEX_VALUES))
ALLOWED_AI_PROVIDER_VALUES = {"gemini", "third_party", "openai"}


def _normalise_ai_provider(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("AI provider must be a string")
    provider = value.strip().lower()
    if not provider:
        return None
    if provider not in ALLOWED_AI_PROVIDER_VALUES:
        raise ValueError("AI provider must be 'gemini' or 'third_party'")
    return "third_party" if provider == "openai" else provider


def _enqueue_character_image(
    *,
    character: Character,
    prompt_for_image: str,
    reference_images: list[dict[str, str]],
    image_provider: str | None,
) -> str:
    from mangasuperb.services.jobs import process_character_image_generation

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        logger.error("RQ queue not configured for character image generation")
        raise RuntimeError("Background queue is not configured")

    job = queue.enqueue(
        process_character_image_generation,
        character_id=character.id,
        description=prompt_for_image,
        reference_images=reference_images,
        image_provider=image_provider,
        job_timeout=current_app.config["RQ_JOB_TIMEOUT"],
        result_ttl=current_app.config["RQ_RESULT_TTL"],
    )
    character.image_status = "pending"
    character.image_job_id = job.id
    character.image_error = None
    character.image_url = None
    return job.id


@bp.post("")
@login_required
@swag_from(CHARACTER_CREATE_DOC)
def create_character() -> Any:
    data = request.get_json(silent=True) or {}
    raw_name = (data.get("name") or "").strip()
    name = raw_name or "unspecified"
    description = (data.get("description") or "").strip()
    optimize_flag = bool(data.get("optimize", False))
    style_prompt = (data.get("style_prompt") or "").strip() or None
    reference_images = data.get("reference_images") or []
    sex_value = (data.get("sex") or "unspecified").strip().lower()
    is_public = bool(data.get("is_public", False))
    try:
        image_provider = _normalise_ai_provider(data.get("image_provider"))
        text_provider = _normalise_ai_provider(data.get("text_provider"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if not description:
        return jsonify({"error": "Description is required"}), 400
    if sex_value not in ALLOWED_SEX_VALUES:
        return (
            jsonify({"error": f"Sex must be one of {ALLOWED_SEX_VALUES_MESSAGE}"}),
            400,
        )

    logger.info(
        "Character creation requested user_id=%s optimize=%s reference_images=%s name_supplied=%s",
        current_user.id,
        optimize_flag,
        len(reference_images),
        bool(raw_name),
    )

    optimized_description = None
    prompt_for_image = description

    if optimize_flag:
        try:
            optimized_description = optimize_character_description(
                description,
                text_provider=text_provider,
            )
            prompt_for_image = optimized_description
            logger.info(
                "Character optimisation completed user_id=%s description_length=%s",
                current_user.id,
                len(optimized_description),
            )
        except ValueError as exc:
            logger.error("Character optimization failed: %s", exc)
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # pragma: no cover - external dependency
            logger.exception("Character optimization error")
            return jsonify({"error": "Failed to optimize character description"}), 502

    resolved_style_prompt = style_prompt or optimized_description or description

    normalized_refs: List[Dict[str, str]] = []
    if reference_images:
        try:
            normalized_refs = normalize_reference_images(reference_images)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    character = Character(
        user_id=current_user.id,
        name=name,
        description=description,
        sex=sex_value,
        is_public=is_public,
        style_prompt=resolved_style_prompt,
        optimized_description=optimized_description,
        image_status="idle",
    )

    job_id = None
    try:
        db.session.add(character)
        db.session.flush()

        job_id = _enqueue_character_image(
            character=character,
            prompt_for_image=prompt_for_image,
            reference_images=normalized_refs,
            image_provider=image_provider,
        )
        logger.info(
            "Character image job enqueued user_id=%s character_id=%s job_id=%s references=%s",
            current_user.id,
            character.id,
            job_id,
            len(normalized_refs),
        )

        db.session.commit()

    except Exception as exc:  # pragma: no cover - database/queue errors
        db.session.rollback()
        logger.exception("Failed to create character")
        return jsonify({"error": "Failed to create character"}), 500

    response = {"character": character.to_dict()}
    if job_id:
        response["job_id"] = job_id

    return jsonify(response), 201


@bp.patch("/<int:character_id>")
@login_required
def update_character(character_id: int) -> Any:
    data = request.get_json(silent=True) or {}
    character = db.session.get(Character, character_id)
    if not character or character.user_id != current_user.id:
        return jsonify({"error": "Character not found"}), 404

    raw_name = (data.get("name") or "").strip()
    name = raw_name or "unspecified"
    description = (data.get("description") or "").strip()
    style_prompt = (data.get("style_prompt") or "").strip() or None
    sex_value = (data.get("sex") or character.sex or "unspecified").strip().lower()
    optimize_flag = bool(data.get("optimize", False))
    reference_images = data.get("reference_images") or []

    if not description:
        return jsonify({"error": "Description is required"}), 400
    if sex_value not in ALLOWED_SEX_VALUES:
        return (
            jsonify({"error": f"Sex must be one of {ALLOWED_SEX_VALUES_MESSAGE}"}),
            400,
        )

    try:
        image_provider = _normalise_ai_provider(data.get("image_provider"))
        text_provider = _normalise_ai_provider(data.get("text_provider"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    optimized_description = None
    prompt_for_image = description
    if optimize_flag:
        try:
            optimized_description = optimize_character_description(
                description,
                text_provider=text_provider,
            )
            prompt_for_image = optimized_description
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # pragma: no cover - external dependency
            logger.exception("Character optimization error")
            return jsonify({"error": "Failed to optimize character description"}), 502

    normalized_refs: list[dict[str, str]] = []
    if reference_images:
        try:
            normalized_refs = normalize_reference_images(reference_images)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    try:
        character.name = name
        character.description = description
        character.sex = sex_value
        character.style_prompt = style_prompt or optimized_description or description
        character.optimized_description = optimized_description
        job_id = _enqueue_character_image(
            character=character,
            prompt_for_image=prompt_for_image,
            reference_images=normalized_refs,
            image_provider=image_provider,
        )
        db.session.commit()
    except Exception as exc:  # pragma: no cover - database/queue errors
        db.session.rollback()
        logger.exception("Failed to update character")
        return jsonify({"error": "Failed to update character"}), 500

    return jsonify({"character": character.to_dict(), "job_id": job_id}), 200


@bp.get("/<int:character_id>")
@login_required
@swag_from(CHARACTER_DETAIL_DOC)
def get_character(character_id: int) -> Any:
    character = db.session.get(Character, character_id)
    if not character or character.user_id != current_user.id:
        return jsonify({"error": "Character not found"}), 404
    return jsonify({"character": character.to_dict()}), 200


@bp.get("")
@login_required
@swag_from(CHARACTER_LIST_DOC)
def list_characters() -> Any:
    characters = (
        Character.query.filter(
            or_(Character.user_id == current_user.id, Character.is_public.is_(True))
        )
        .order_by(Character.name.asc(), Character.id.asc())
        .all()
    )
    payload: list[Dict[str, Any]] = []
    seen: set[int] = set()
    for character in characters:
        if character.id in seen:
            continue
        seen.add(character.id)
        payload.append(character.to_dict())
    return jsonify({"characters": payload}), 200


@bp.patch("/<int:character_id>/name")
@login_required
@swag_from(CHARACTER_RENAME_DOC)
def rename_character(character_id: int) -> Any:
    data = request.get_json(silent=True) or {}
    new_name = (data.get("name") or "").strip()

    if not new_name:
        return jsonify({"error": "Name is required"}), 400
    if len(new_name) > 100:
        return jsonify({"error": "Name must be 100 characters or fewer"}), 400

    character = db.session.get(Character, character_id)
    if not character or character.user_id != current_user.id:
        return jsonify({"error": "Character not found"}), 404

    previous_name = character.name
    character.name = new_name

    try:
        db.session.commit()
    except Exception:  # pragma: no cover - database errors
        db.session.rollback()
        logger.exception(
            "Failed to rename character user_id=%s character_id=%s",  # pragma: no cover
            current_user.id,
            character_id,
        )
        return jsonify({"error": "Failed to update character name"}), 500

    logger.info(
        "Character renamed user_id=%s character_id=%s previous_name=%s new_name=%s",
        current_user.id,
        character_id,
        previous_name,
        new_name,
    )

    return jsonify({"character": character.to_dict()}), 200


@bp.delete("/<int:character_id>")
@login_required
@swag_from(CHARACTER_DELETE_DOC)
def delete_character(character_id: int) -> Any:
    character = db.session.get(Character, character_id)
    if not character or character.user_id != current_user.id:
        return jsonify({"error": "Character not found"}), 404

    try:
        db.session.delete(character)
        db.session.commit()
    except Exception as exc:  # pragma: no cover - database failure
        db.session.rollback()
        logger.exception(
            "Failed to delete character user_id=%s character_id=%s: %s",
            current_user.id,
            character_id,
            exc,
        )
        return jsonify({"error": "Failed to delete character"}), 500

    logger.info("Character deleted user_id=%s character_id=%s", current_user.id, character_id)
    return jsonify({"message": "Character deleted"}), 200
