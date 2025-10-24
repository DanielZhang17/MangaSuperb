"""Routes for managing comics and their metadata."""
from __future__ import annotations

import json
import logging
from typing import Any

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from mangasuperb.routes._character_utils import (
    apply_character_assignments,
    build_character_script_payload,
    resolve_character_assignments,
)
from mangasuperb.services.generation import validate_aspect_ratio
from mangasuperb.services.jobs import (
    bootstrap_comic_workflow,
    enqueue_publish_workflow,
)
from models import Comic, Script
from swagger import COMIC_CREATE_DOC, COMIC_DETAIL_DOC, COMIC_LIST_DOC

logger = logging.getLogger(__name__)

bp = Blueprint("comics", __name__, url_prefix="/api/comics")


@bp.post("")
@login_required
@swag_from(COMIC_CREATE_DOC)
def create_comic() -> Any:
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    story = (data.get("story") or data.get("script_content") or "").strip()
    style_description = (data.get("style") or data.get("style_description") or "").strip()
    aspect_ratio_raw = data.get("aspect_ratio")

    if not title:
        return jsonify({"error": "Title is required"}), 400
    if not story:
        return jsonify({"error": "Story content is required"}), 400
    if not style_description:
        return jsonify({"error": "Style description is required"}), 400

    try:
        resolved_aspect_ratio = validate_aspect_ratio(aspect_ratio_raw)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        character_assignments = resolve_character_assignments(data)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    script_payload = {
        "story": story,
        "style_description": style_description,
        "aspect_ratio": resolved_aspect_ratio,
    }
    if character_assignments:
        script_payload["characters"] = build_character_script_payload(character_assignments)

    script = Script(
        user_id=current_user.id,
        title=title,
        content=json.dumps(script_payload),
    )

    comic = Comic(
        user_id=current_user.id,
        script=script,
        title=title,
        status="pending",
        style_description=style_description,
        aspect_ratio=resolved_aspect_ratio,
    )

    try:
        db.session.add_all([script, comic])
        db.session.flush()
        if character_assignments:
            apply_character_assignments(comic, character_assignments)
        bootstrap_comic_workflow(comic)
        db.session.commit()
    except Exception as exc:  # pragma: no cover - database failure
        db.session.rollback()
        logger.exception("Failed to create comic: %s", exc)
        return jsonify({"error": "Failed to create comic"}), 500

    return jsonify({"comic": comic.to_dict(), "script": script.to_dict()}), 201


@bp.get("/<int:comic_id>")
@login_required
@swag_from(COMIC_DETAIL_DOC)
def get_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return jsonify({"error": "Comic not found"}), 404
    return jsonify(comic.to_dict())


@bp.get("")
@login_required
@swag_from(COMIC_LIST_DOC)
def list_comics() -> Any:
    try:
        user_id = request.args.get("user_id", type=int)

        query = Comic.query.filter_by(user_id=current_user.id)
        if user_id and user_id != current_user.id:
            return jsonify({"error": "Forbidden"}), 403

        comics = query.order_by(Comic.created_at.desc()).limit(50).all()

        return jsonify({
            "comics": [comic.to_dict() for comic in comics],
            "count": len(comics),
        })

    except Exception as exc:  # pragma: no cover - database failure
        logger.error("Error listing comics: %s", exc)
        return jsonify({"error": str(exc)}), 500


@bp.post("/<int:comic_id>/publish")
@login_required
def publish_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return jsonify({"error": "Comic not found"}), 404

    render_stage = next(
        (stage for stage in comic.workflow_stages if stage.stage == "render"),
        None,
    )
    if not render_stage or render_stage.status != "completed":
        return jsonify({"error": "Render stage must complete before publishing"}), 409

    if comic.is_public and comic.pdf_url and comic.zip_url and comic.cover_image_url:
        return jsonify({"comic": comic.to_dict(), "message": "Comic already published"})

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    payload = request.get_json(silent=True) or {}
    image_model = payload.get("image_model")
    make_public = payload.get("make_public", True)

    try:
        stage_jobs = enqueue_publish_workflow(
            queue,
            comic,
            image_model=image_model,
            make_public=bool(make_public),
        )
        db.session.refresh(comic)
        return jsonify({"comic": comic.to_dict(), "stage_jobs": stage_jobs}), 202
    except Exception as exc:  # pragma: no cover - queue failure
        logger.exception("Failed to enqueue publish workflow for comic_id=%s", comic_id)
        return jsonify({"error": "Failed to enqueue publish workflow"}), 500


@bp.get("/public")
def list_public_comics() -> Any:
    comics = (
        Comic.query.filter_by(is_public=True)
        .order_by(Comic.published_at.desc(), Comic.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({
        "comics": [comic.to_public_dict() for comic in comics],
        "count": len(comics),
    })


@bp.get("/public/<int:comic_id>")
def get_public_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or not comic.is_public:
        return jsonify({"error": "Comic not found"}), 404
    return jsonify(comic.to_public_dict())
