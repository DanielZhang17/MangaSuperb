"""Routes for creating and retrieving character resources."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from mangasuperb.services.generation import (
    normalize_reference_images,
    optimize_character_description,
)
from models import Character
from swagger import CHARACTER_CREATE_DOC, CHARACTER_DETAIL_DOC

logger = logging.getLogger(__name__)

bp = Blueprint("characters", __name__, url_prefix="/api/characters")


@bp.post("")
@login_required
@swag_from(CHARACTER_CREATE_DOC)
def create_character() -> Any:
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    optimize_flag = bool(data.get("optimize", False))
    style_prompt = (data.get("style_prompt") or "").strip() or None
    reference_images = data.get("reference_images") or []
    api_key = (data.get("api_key") or "").strip()

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if not description:
        return jsonify({"error": "Description is required"}), 400

    requires_api = optimize_flag or bool(reference_images)
    if requires_api and not api_key:
        return jsonify({"error": "API key is required for optimization or image generation"}), 400

    optimized_description = None
    prompt_for_image = description

    if optimize_flag:
        try:
            optimized_description = optimize_character_description(description, api_key)
            prompt_for_image = optimized_description
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
        style_prompt=resolved_style_prompt,
        optimized_description=optimized_description,
        image_status="idle",
    )

    job_id = None
    try:
        db.session.add(character)
        db.session.flush()

        if normalized_refs:
            from mangasuperb.services.jobs import process_character_image_generation

            queue = current_app.extensions["rq_queue"]
            job = queue.enqueue(
                process_character_image_generation,
                character_id=character.id,
                api_key=api_key,
                description=prompt_for_image,
                reference_images=normalized_refs,
                job_timeout=current_app.config["RQ_JOB_TIMEOUT"],
                result_ttl=current_app.config["RQ_RESULT_TTL"],
            )

            character.image_status = "pending"
            character.image_job_id = job.id
            character.image_error = None
            job_id = job.id

        db.session.commit()

    except Exception as exc:  # pragma: no cover - database/queue errors
        db.session.rollback()
        logger.exception("Failed to create character")
        return jsonify({"error": "Failed to create character"}), 500

    response = {"character": character.to_dict()}
    if job_id:
        response["job_id"] = job_id

    return jsonify(response), 201


@bp.get("/<int:character_id>")
@login_required
@swag_from(CHARACTER_DETAIL_DOC)
def get_character(character_id: int) -> Any:
    character = db.session.get(Character, character_id)
    if not character or character.user_id != current_user.id:
        return jsonify({"error": "Character not found"}), 404
    return jsonify({"character": character.to_dict()}), 200
