"""Routes for managing comics and their metadata."""
from __future__ import annotations

import json
import logging
from typing import Any

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import func

from mangasuperb.db_utils import ensure_aspect_ratio_constraint
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
    set_comic_stage_status,
)
from models import (
    DEFAULT_COLOR_MODES,
    Comic,
    ComicLike,
    ComicPage,
    ComicPageLayout,
    ComicPagePanel,
    ComicPanelShot,
    Script,
)
from swagger import (
    COMIC_CREATE_DOC,
    COMIC_DETAIL_DOC,
    COMIC_UPDATE_DOC,
    COMIC_DELETE_DOC,
    COMIC_IMAGES_DOC,
    COMIC_LIST_DOC,
    COMIC_PUBLISH_DOC,
    COMIC_LIKE_DOC,
    COMIC_UNLIKE_DOC,
    COMIC_PUBLIC_LIST_DOC,
    COMIC_PUBLIC_DETAIL_DOC,
    COMIC_PAGE_DELETE_DOC,
)

logger = logging.getLogger(__name__)

bp = Blueprint("comics", __name__, url_prefix="/api/comics")


@bp.post("")
@login_required
@swag_from(COMIC_CREATE_DOC)
def create_comic() -> Any:
    ensure_aspect_ratio_constraint(current_app)

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    story = (data.get("story") or data.get("script_content") or "").strip()
    style_description = (data.get("style") or data.get("style_description") or "").strip()
    aspect_ratio_raw = data.get("aspect_ratio")
    color_mode_raw = data.get("color_mode")

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

    color_mode = DEFAULT_COLOR_MODES[0]
    if isinstance(color_mode_raw, str) and color_mode_raw.strip():
        candidate = color_mode_raw.strip()
        if candidate not in DEFAULT_COLOR_MODES:
            return jsonify({"error": "Invalid color mode"}), 400
        color_mode = candidate

    try:
        character_assignments = resolve_character_assignments(data)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    script_payload = {
        "story": story,
        "style_description": style_description,
        "aspect_ratio": resolved_aspect_ratio,
        "color_mode": color_mode,
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


@bp.patch("/<int:comic_id>")
@login_required
@swag_from(COMIC_UPDATE_DOC)
def update_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return jsonify({"error": "Comic not found"}), 404

    data = request.get_json(silent=True) or {}

    # Update title if provided
    title = data.get("title")
    if title is not None:
        title = str(title).strip()
        if not title:
            return jsonify({"error": "Title cannot be empty"}), 400
        comic.title = title

    # Update style_description if provided
    style_description = data.get("style_description")
    if style_description is not None:
        style_description = str(style_description).strip()
        if not style_description:
            return jsonify({"error": "Style description cannot be empty"}), 400
        comic.style_description = style_description

    # Update is_public if provided
    is_public = data.get("is_public")
    if is_public is not None:
        comic.is_public = bool(is_public)

    try:
        db.session.commit()
        db.session.refresh(comic)
        comic._user_liked = any(like.user_id == current_user.id for like in comic.likes)
        comic._like_count = len(comic.likes) if comic.likes else 0
        return jsonify({"comic": comic.to_dict()}), 200
    except Exception as exc:  # pragma: no cover - database failure
        db.session.rollback()
        logger.exception("Failed to update comic_id=%s: %s", comic_id, exc)
        return jsonify({"error": "Failed to update comic"}), 500


@bp.delete("/<int:comic_id>")
@login_required
@swag_from(COMIC_DELETE_DOC)
def delete_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return jsonify({"error": "Comic not found"}), 404

    try:
        db.session.delete(comic)
        db.session.commit()
        return jsonify({"message": "Comic deleted"}), 200
    except Exception as exc:  # pragma: no cover - database failure
        db.session.rollback()
        logger.exception("Failed to delete comic_id=%s: %s", comic_id, exc)
        return jsonify({"error": "Failed to delete comic"}), 500


@bp.get("/<int:comic_id>/images")
@login_required
@swag_from(COMIC_IMAGES_DOC)
def get_comic_images(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or (comic.user_id != current_user.id and not comic.is_public):
        return jsonify({"error": "Comic not found"}), 404

    pages_payload = [
        {
            "page_id": page.id,
            "page_number": page.page_number,
            "image_url": page.image_url,
        }
        for page in comic.pages
    ]

    return (
        jsonify(
            {
                "comic_id": comic.id,
                "cover_image_url": comic.cover_image_url,
                "pages": pages_payload,
                "page_count": len(pages_payload),
            }
        ),
        200,
    )


@bp.delete("/<int:comic_id>/pages/<int:page_number>")
@login_required
@swag_from(COMIC_PAGE_DELETE_DOC)
def delete_comic_page(comic_id: int, page_number: int) -> Any:
    if page_number <= 0:
        return jsonify({"error": "Page number must be positive"}), 400

    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return jsonify({"error": "Comic not found"}), 404

    page = (
        ComicPage.query.filter_by(comic_id=comic_id, page_number=page_number)
        .order_by(ComicPage.id)
        .first()
    )
    if not page:
        return jsonify({"error": "Page not found"}), 404

    try:
        # Clear panel assignments for this page
        ComicPanelShot.query.filter_by(comic_id=comic_id, page_number=page_number).update(
            {"page_number": None, "panel_number": None}
        )

        layouts = ComicPageLayout.query.filter_by(comic_id=comic_id, page_number=page_number).all()
        if layouts:
            layout_ids = [layout.id for layout in layouts]
            ComicPagePanel.query.filter(ComicPagePanel.page_layout_id.in_(layout_ids)).delete(
                synchronize_session=False
            )
            ComicPageLayout.query.filter_by(comic_id=comic_id, page_number=page_number).delete(
                synchronize_session=False
            )

        db.session.delete(page)

        set_comic_stage_status(comic, "render", "pending")
        comic.workflow_stage = "render"
        comic.workflow_status = "pending"
        comic.status = "pending"
        comic.error_message = None

        db.session.commit()
        db.session.refresh(comic)
    except Exception as exc:  # pragma: no cover - database failure
        db.session.rollback()
        logger.exception(
            "Failed to delete comic page comic_id=%s page_number=%s: %s",
            comic_id,
            page_number,
            exc,
        )
        return jsonify({"error": "Failed to delete page"}), 500

    return jsonify({"message": "Page deleted", "comic": comic.to_dict()}), 200


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
    payload = request.get_json(silent=True) or {}
    make_public = bool(payload.get("make_public", True))

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    render_completed_at = getattr(render_stage, "completed_at", None) if render_stage else None
    previously_published_at = comic.published_at
    assets_missing = not all(
        [
            comic.cover_image_url,
            comic.pdf_url,
            comic.zip_url,
        ]
    )
    visibility_changing = bool(comic.is_public) != bool(make_public)

    if (not render_stage or render_stage.status != "completed") and previously_published_at and not visibility_changing and not assets_missing:
        current_app.logger.info(
            "Publish skipped for comic_id=%s due to pending renders; returning existing assets",
            comic_id,
        )
        return (
            jsonify(
                {
                    "comic": comic.to_dict(),
                    "stage_jobs": None,
                    "message": "Render pipeline pending; using previously published assets",
                    "pdf_url": comic.pdf_url,
                }
            ),
            200,
        )

    if not render_stage or render_stage.status != "completed":
        return jsonify({"error": "Render stage must complete before publishing"}), 409

    last_render_ts = getattr(render_stage, "completed_at", None)
    if not last_render_ts and comic.completed_at:
        last_render_ts = comic.completed_at

    if (
        previously_published_at
        and last_render_ts
        and last_render_ts <= previously_published_at
        and not assets_missing
        and not visibility_changing
    ):
        current_app.logger.info(
            "Publish skipped for comic_id=%s (no new renders since %s)",
            comic_id,
            previously_published_at.isoformat() if previously_published_at else None,
        )
        return (
            jsonify(
                {
                    "comic": comic.to_dict(),
                    "stage_jobs": None,
                    "message": "No new renders detected since last publish",
                    "pdf_url": comic.pdf_url,
                }
            ),
            200,
        )

    existing_job_id = comic.job_id
    if existing_job_id:
        try:
            existing_job = queue.fetch_job(existing_job_id)
        except Exception as exc:
            existing_job = None
            logger.warning(
                "Failed to fetch existing publish job for comic_id=%s job_id=%s: %s",
                comic_id,
                existing_job_id,
                exc,
            )
        else:
            if existing_job and existing_job.get_status() in {"queued", "started", "deferred"}:
                return (
                    jsonify(
                        {
                            "error": "Publish workflow already in progress",
                            "job_id": existing_job.id,
                        }
                    ),
                    409,
                )

    try:
        stage_jobs = enqueue_publish_workflow(
            queue,
            comic,
            make_public=bool(make_public),
        )
        db.session.refresh(comic)
        comic._like_count = len(comic.likes) if comic.likes else 0
        comic._user_liked = any(like.user_id == current_user.id for like in comic.likes)
        return jsonify({
            "comic": comic.to_dict(),
            "stage_jobs": stage_jobs,
            "pdf_url": comic.pdf_url,
        }), 202
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
