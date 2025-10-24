"""Routes for managing comics and their metadata."""
from __future__ import annotations

import json
import logging
from typing import Any

from flasgger import swag_from
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from mangasuperb.services.generation import validate_aspect_ratio
from mangasuperb.services.jobs import bootstrap_comic_workflow
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

    script_payload = {
        "story": story,
        "style_description": style_description,
        "aspect_ratio": resolved_aspect_ratio,
    }

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
