"""Routes for managing comics and their metadata."""
from __future__ import annotations

import json
import logging
from typing import Any

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import func

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
from models import Comic, ComicLike, Script
from swagger import (
    COMIC_CREATE_DOC,
    COMIC_DETAIL_DOC,
    COMIC_LIST_DOC,
    COMIC_PUBLISH_DOC,
    COMIC_LIKE_DOC,
    COMIC_UNLIKE_DOC,
    COMIC_PUBLIC_LIST_DOC,
    COMIC_PUBLIC_DETAIL_DOC,
)

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
    comic._user_liked = any(like.user_id == current_user.id for like in comic.likes)
    comic._like_count = len(comic.likes) if comic.likes else 0
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

        liked_ids = {like.comic_id for like in current_user.comic_likes}
        for comic in comics:
            comic._user_liked = comic.id in liked_ids
            comic._like_count = len(comic.likes) if comic.likes else 0

        return jsonify({
            "comics": [comic.to_dict() for comic in comics],
            "count": len(comics),
        })

    except Exception as exc:  # pragma: no cover - database failure
        logger.error("Error listing comics: %s", exc)
        return jsonify({"error": str(exc)}), 500


@bp.post("/<int:comic_id>/publish")
@login_required
@swag_from(COMIC_PUBLISH_DOC)
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
    make_public = payload.get("make_public", True)

    try:
        stage_jobs = enqueue_publish_workflow(
            queue,
            comic,
            make_public=bool(make_public),
        )
        db.session.refresh(comic)
        comic._like_count = len(comic.likes) if comic.likes else 0
        comic._user_liked = any(like.user_id == current_user.id for like in comic.likes)
        return jsonify({"comic": comic.to_dict(), "stage_jobs": stage_jobs}), 202
    except Exception as exc:  # pragma: no cover - queue failure
        logger.exception("Failed to enqueue publish workflow for comic_id=%s", comic_id)
        return jsonify({"error": "Failed to enqueue publish workflow"}), 500


@bp.get("/public")
@swag_from(COMIC_PUBLIC_LIST_DOC)
def list_public_comics() -> Any:
    likes_subquery = (
        db.session.query(ComicLike.comic_id, func.count(ComicLike.id).label("like_count"))
        .group_by(ComicLike.comic_id)
        .subquery()
    )

    results = (
        Comic.query.filter(Comic.is_public.is_(True))
        .outerjoin(likes_subquery, Comic.id == likes_subquery.c.comic_id)
        .add_columns(likes_subquery.c.like_count)
        .order_by(func.coalesce(likes_subquery.c.like_count, 0).desc(), Comic.published_at.desc(), Comic.id.desc())
        .limit(50)
        .all()
    )

    payload: list[dict[str, Any]] = []
    for comic, like_count in results:
        comic._like_count = int(like_count or 0)
        payload.append(comic.to_public_dict())

    return jsonify({"comics": payload, "count": len(payload)})


@bp.get("/public/<int:comic_id>")
@swag_from(COMIC_PUBLIC_DETAIL_DOC)
def get_public_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or not comic.is_public:
        return jsonify({"error": "Comic not found"}), 404
    return jsonify(comic.to_public_dict())


@bp.post("/<int:comic_id>/like")
@login_required
@swag_from(COMIC_LIKE_DOC)
def like_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    existing = ComicLike.query.filter_by(comic_id=comic_id, user_id=current_user.id).first()
    if not existing:
        try:
            db.session.add(ComicLike(comic_id=comic_id, user_id=current_user.id))
            db.session.commit()
        except Exception:  # pragma: no cover - integrity guard
            db.session.rollback()

    like_count = (
        db.session.query(func.count(ComicLike.id)).filter_by(comic_id=comic_id).scalar() or 0
    )

    comic = db.session.get(Comic, comic_id)
    comic._user_liked = True
    comic._like_count = int(like_count)
    return jsonify({"comic": comic.to_dict(), "like_count": like_count}), 200


@bp.delete("/<int:comic_id>/like")
@login_required
@swag_from(COMIC_UNLIKE_DOC)
def unlike_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    existing = ComicLike.query.filter_by(comic_id=comic_id, user_id=current_user.id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()

    like_count = (
        db.session.query(func.count(ComicLike.id)).filter_by(comic_id=comic_id).scalar() or 0
    )

    comic = db.session.get(Comic, comic_id)
    comic._user_liked = False
    comic._like_count = int(like_count)
    return jsonify({"comic": comic.to_dict(), "like_count": like_count}), 200
