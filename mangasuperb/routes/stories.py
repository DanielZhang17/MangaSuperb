"""Story management endpoints for outlines and optimisation."""
from __future__ import annotations

import json
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from mangasuperb.routes._character_utils import (
    apply_character_assignments,
    build_character_script_payload,
    resolve_character_assignments,
)
from mangasuperb.services.jobs import (
    bootstrap_comic_workflow,
    enqueue_story_optimization,
    set_comic_stage_status,
)
from models import Comic, ComicOutlineSection, ComicPageLayout, ComicPanelShot

bp = Blueprint("stories", __name__, url_prefix="/api/stories")


def _load_comic_for_user(comic_id: int) -> Comic | None:
    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return None
    return comic


@bp.get("/<int:comic_id>")
@login_required
def get_story(comic_id: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    return jsonify({"comic": comic.to_dict()})


@bp.post("/<int:comic_id>")
@login_required
def upsert_story_outline(comic_id: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    payload = request.get_json(silent=True) or {}
    characters_present = "characters" in payload or "character_ids" in payload
    try:
        character_assignments = resolve_character_assignments(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    sections = payload.get("sections")
    if not isinstance(sections, list) or not sections:
        return jsonify({"error": "Sections must be a non-empty list"}), 400

    normalized: list[dict[str, str]] = []
    for idx, raw in enumerate(sections, start=1):
        if not isinstance(raw, dict):
            continue
        summary = (raw.get("summary") or "").strip()
        title = (raw.get("title") or "").strip()
        if not summary:
            continue
        normalized.append(
            {
                "order_index": idx,
                "title": title or f"Section {idx}",
                "summary": summary,
            }
        )

    if not normalized:
        return jsonify({"error": "Each section requires a summary"}), 400

    ComicPageLayout.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
    ComicPanelShot.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
    ComicOutlineSection.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
    db.session.flush()

    for section in normalized:
        db.session.add(
            ComicOutlineSection(
                comic_id=comic_id,
                order_index=section["order_index"],
                title=section["title"],
                summary=section["summary"],
                status="draft",
            )
        )

    if characters_present:
        apply_character_assignments(comic, character_assignments)
        script_payload: dict[str, Any] = {}
        if comic.script and comic.script.content:
            try:
                script_payload = json.loads(comic.script.content)
            except json.JSONDecodeError:
                script_payload = {}
        script_payload["characters"] = build_character_script_payload(character_assignments)
        comic.script.content = json.dumps(script_payload)

    bootstrap_comic_workflow(comic)
    set_comic_stage_status(comic, "outline", "completed")
    set_comic_stage_status(comic, "shots", "pending")
    set_comic_stage_status(comic, "render", "pending")

    comic.status = "pending"
    comic.workflow_stage = "shots"
    comic.workflow_status = "pending"
    comic.error_message = None

    db.session.commit()
    db.session.refresh(comic)

    return jsonify({"comic": comic.to_dict()}), 200


@bp.post("/<int:comic_id>/optimize")
@login_required
def optimize_story(comic_id: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    jobs = enqueue_story_optimization(queue, comic)
    db.session.refresh(comic)

    return jsonify({"stage_jobs": jobs, "comic": comic.to_dict()}), 202
