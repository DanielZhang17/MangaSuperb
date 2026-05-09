"""Panel and layout management endpoints."""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from mangasuperb.services.generation import validate_aspect_ratio
from mangasuperb.services.jobs import (
    enqueue_page_render,
    enqueue_render_run,
    set_comic_stage_status,
)
from models import (
    DEFAULT_COLOR_MODES,
    Comic,
    ComicPageLayout,
    ComicPagePanel,
    ComicPanelShot,
    ComicRenderRun,
)
from swagger import PANEL_LAYOUT_DOC, PANEL_RENDER_DOC, PANEL_UPDATE_DOC

bp = Blueprint("panels", __name__, url_prefix="/api/panels")

ALLOWED_AI_PROVIDER_VALUES = {"gemini", "third_party", "openai"}


def _normalise_ai_provider(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("image_provider must be a string")
    provider = value.strip().lower()
    if not provider:
        return None
    if provider not in ALLOWED_AI_PROVIDER_VALUES:
        raise ValueError("image_provider must be 'gemini' or 'third_party'")
    return "third_party" if provider == "openai" else provider


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
@swag_from(PANEL_UPDATE_DOC)
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
                    ComicPagePanel(
                        page_layout_id=layout.id,
                        panel_shot_id=panel.id,
                        position=position,
                    )
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
@swag_from(PANEL_LAYOUT_DOC)
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


@bp.post("/<int:comic_id>/render-runs")
@login_required
def start_render_run(comic_id: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    elif not isinstance(payload, Mapping):
        return jsonify({"error": "JSON body must be an object"}), 400

    mode_raw = payload.get("mode", "first_page")
    if mode_raw is None:
        mode = "first_page"
    elif not isinstance(mode_raw, str):
        return jsonify({"error": "mode is invalid"}), 400
    else:
        mode = mode_raw.strip()
    if mode not in {"first_page", "all_pages", "remaining_pages"}:
        return jsonify({"error": "mode is invalid"}), 400

    try:
        image_provider = _normalise_ai_provider(payload.get("image_provider"))
        text_provider = _normalise_ai_provider(payload.get("text_provider"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    color_mode = None
    color_mode_raw = payload.get("color_mode")
    if isinstance(color_mode_raw, str) and color_mode_raw.strip():
        candidate = color_mode_raw.strip()
        if candidate not in DEFAULT_COLOR_MODES:
            return jsonify({"error": "color_mode is invalid"}), 400
        color_mode = candidate

    aspect_ratio = None
    aspect_ratio_raw = payload.get("aspect_ratio")
    if aspect_ratio_raw is not None:
        try:
            aspect_ratio = validate_aspect_ratio(aspect_ratio_raw)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    try:
        render_run = enqueue_render_run(
            queue,
            comic,
            mode=mode,
            user_id=current_user.id,
            image_provider=image_provider,
            text_provider=text_provider,
            color_mode=color_mode,
            aspect_ratio=aspect_ratio,
            font_family=payload.get("font_family"),
            font_size=payload.get("font_size"),
            bubble_shape=payload.get("bubble_shape"),
            bubble_tail=payload.get("bubble_tail"),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    db.session.refresh(comic)
    return jsonify({"render_run": render_run.to_dict(), "comic": comic.to_dict()}), 202


@bp.post("/render-runs/<int:render_run_id>/abort")
@login_required
def abort_render_run(render_run_id: int) -> Any:
    render_run = db.session.get(ComicRenderRun, render_run_id)
    if not render_run or render_run.user_id != current_user.id:
        return jsonify({"error": "Render run not found"}), 404

    render_run.abort_requested = True
    if render_run.status in {"queued", "running"}:
        render_run.status = "aborted"
        render_run.completed_at = datetime.utcnow()
        if render_run.comic:
            set_comic_stage_status(render_run.comic, "render", "aborted")
    db.session.commit()
    return jsonify({"render_run": render_run.to_dict()}), 200


@bp.post("/<int:comic_id>/pages/<int:page_number>/render")
@login_required
@swag_from(PANEL_RENDER_DOC)
def render_page(comic_id: int, page_number: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    payload = request.get_json(silent=True) or {}
    image_model = None
    font_family = payload.get("font_family")
    font_size = payload.get("font_size")
    bubble_shape = payload.get("bubble_shape")
    bubble_tail = payload.get("bubble_tail")
    color_mode_raw = payload.get("color_mode")
    aspect_ratio_raw = payload.get("aspect_ratio")
    try:
        image_provider = _normalise_ai_provider(payload.get("image_provider"))
        text_provider = _normalise_ai_provider(payload.get("text_provider"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    color_mode = None
    if isinstance(color_mode_raw, str) and color_mode_raw.strip():
        candidate = color_mode_raw.strip()
        if candidate not in DEFAULT_COLOR_MODES:
            return jsonify({"error": "color_mode is invalid"}), 400
        color_mode = candidate

    aspect_ratio = None
    if aspect_ratio_raw is not None:
        try:
            aspect_ratio = validate_aspect_ratio(aspect_ratio_raw)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    job = enqueue_page_render(
        queue,
        comic,
        page_number,
        image_model=image_model,
        image_provider=image_provider,
        text_provider=text_provider,
        font_family=font_family,
        font_size=font_size,
        bubble_shape=bubble_shape,
        bubble_tail=bubble_tail,
        color_mode=color_mode,
        aspect_ratio=aspect_ratio,
    )
    db.session.refresh(comic)

    return jsonify({"job_id": job.id, "comic": comic.to_dict()}), 202
