"""Panel and layout management endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from mangasuperb.services.jobs import enqueue_page_render, set_comic_stage_status
from models import Comic, ComicPageLayout, ComicPagePanel, ComicPanelShot

bp = Blueprint("panels", __name__, url_prefix="/api/panels")


def _load_comic_for_user(comic_id: int) -> Comic | None:
    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return None
    return comic


def _load_panel_for_user(panel_id: int) -> ComicPanelShot | None:
    panel = db.session.get(ComicPanelShot, panel_id)
    if not panel:
        return None
    if not panel.comic or panel.comic.user_id != current_user.id:
        return None
    return panel


@bp.patch("/<int:panel_id>")
@login_required
def update_panel(panel_id: int) -> Any:
    panel = _load_panel_for_user(panel_id)
    if not panel:
        return jsonify({"error": "Panel not found"}), 404

    payload = request.get_json(silent=True) or {}
    editable_fields = {
        "description",
        "dialogue",
        "camera_notes",
        "style_notes",
        "status",
        "page_number",
        "panel_number",
    }

    for field, value in payload.items():
        if field not in editable_fields:
            continue
        if field in {"page_number", "panel_number"}:
            if value is None:
                setattr(panel, field, None)
            else:
                try:
                    setattr(panel, field, int(value))
                except (TypeError, ValueError):
                    return jsonify({"error": f"{field} must be an integer"}), 400
            continue

        if isinstance(value, str):
            value = value.strip() or None
        setattr(panel, field, value)

    if panel.page_number:
        layout = (
            ComicPageLayout.query.filter_by(
                comic_id=panel.comic_id,
                page_number=panel.page_number,
            )
            .order_by(ComicPageLayout.id)
            .first()
        )
        if layout:
            assignment = next(
                (item for item in layout.panel_assignments if item.panel_shot_id == panel.id),
                None,
            )
            position = panel.panel_number or (assignment.position if assignment else 1)
            if assignment:
                assignment.position = position
            else:
                db.session.add(
                    ComicPagePanel(page_layout_id=layout.id, panel_shot_id=panel.id, position=position)
                )

    set_comic_stage_status(panel.comic, "render", "pending")
    panel.comic.workflow_stage = "render"
    panel.comic.workflow_status = "pending"
    panel.comic.status = "pending"
    panel.comic.error_message = None

    db.session.commit()
    db.session.refresh(panel.comic)

    return jsonify({"panel": panel.to_dict(), "comic": panel.comic.to_dict()})


@bp.post("/<int:comic_id>/layouts")
@login_required
def update_layout(comic_id: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    payload = request.get_json(silent=True) or {}
    page_number = payload.get("page_number")
    if not isinstance(page_number, int) or page_number < 1:
        return jsonify({"error": "page_number must be a positive integer"}), 400

    layout_key = (payload.get("layout_key") or "auto-grid").strip()
    notes = (payload.get("notes") or None)
    panel_order = payload.get("panel_order")

    layout = (
        ComicPageLayout.query.filter_by(comic_id=comic_id, page_number=page_number)
        .order_by(ComicPageLayout.id)
        .first()
    )
    if not layout:
        layout = ComicPageLayout(comic_id=comic_id, page_number=page_number)
        db.session.add(layout)
        db.session.flush()

    layout.layout_key = layout_key or layout.layout_key
    layout.notes = notes
    layout.status = "selected"
    layout.selected_at = datetime.utcnow()

    if isinstance(panel_order, list) and panel_order:
        panels = (
            ComicPanelShot.query.filter(
                ComicPanelShot.id.in_(panel_order),
                ComicPanelShot.comic_id == comic_id,
            )
            .all()
        )
        if len(panels) != len(panel_order):
            return jsonify({"error": "panel_order includes invalid panel ids"}), 400

        panels_by_id = {panel.id: panel for panel in panels}
        ComicPagePanel.query.filter_by(page_layout_id=layout.id).delete(synchronize_session=False)

        for index, panel_id in enumerate(panel_order, start=1):
            panel = panels_by_id.get(panel_id)
            if not panel:
                return jsonify({"error": "panel_order includes invalid panel ids"}), 400
            panel.page_number = page_number
            panel.panel_number = index
            db.session.add(
                ComicPagePanel(page_layout_id=layout.id, panel_shot_id=panel.id, position=index)
            )

    set_comic_stage_status(comic, "render", "pending")
    comic.workflow_stage = "render"
    comic.workflow_status = "pending"
    comic.status = "pending"
    comic.error_message = None

    db.session.commit()
    db.session.refresh(comic)

    return jsonify({"layout": layout.to_dict(), "comic": comic.to_dict()})


@bp.post("/<int:comic_id>/pages/<int:page_number>/render")
@login_required
def render_page(comic_id: int, page_number: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    _ = request.get_json(silent=True) or {}
    image_model = None

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    job = enqueue_page_render(
        queue,
        comic,
        page_number,
        image_model=image_model,
    )
    db.session.refresh(comic)

    return jsonify({"job_id": job.id, "comic": comic.to_dict()}), 202
