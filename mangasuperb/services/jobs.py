"""Background job implementations shared by the API and worker."""
from __future__ import annotations

import base64
import json
import logging
import zipfile
from collections.abc import Iterable
from contextlib import contextmanager
from datetime import datetime
from io import BytesIO
from typing import Any, Sequence

import google.generativeai as genai
from flask import current_app
from sqlalchemy import func

from PIL import Image, UnidentifiedImageError
from rq import get_current_job

from config import Config
from mangasuperb.extensions import db
from mangasuperb.services.generation import optimize_character_description
from models import (
    Character,
    Comic,
    ComicOutlineSection,
    ComicPage,
    ComicPageLayout,
    ComicPagePanel,
    ComicPanelShot,
    ComicWorkflowStage,
    Script,
)

logger = logging.getLogger(__name__)


@contextmanager
def _application_context():
    """Ensure a Flask application context is available."""
    try:
        _ = current_app.name
        yield current_app
        return
    except RuntimeError:
        from mangasuperb import create_app

        app = create_app()
        with app.app_context():
            yield app


def _get_storage():
    storage = current_app.extensions.get("r2_storage")
    if not storage:
        raise RuntimeError("R2 storage is not configured")
    return storage


def _current_job_id() -> str:
    job = get_current_job()
    return job.id if job else "inline"


def _config_value(key: str, default: str) -> str:
    try:
        return current_app.config.get(key, default)  # type: ignore[attr-defined]
    except RuntimeError:
        return getattr(Config, key, default)


def _gemini_api_key() -> str:
    api_key = _config_value("GEMINI_API_KEY", Config.GEMINI_API_KEY)
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return api_key


WORKFLOW_STAGES = ("outline", "shots", "render", "export")
PANELS_PER_PAGE = 4
LAYOUT_INSTRUCTIONS = {
    "auto-grid": (
        "Arrange the panels evenly across the page in a balanced manga grid, "
        "keeping gutters consistent and reading right-to-left."
    ),
    "grid-2x2": (
        "Arrange the panels in a 2x2 grid, reading order right-to-left along the "
        "top row and then the bottom row."
    ),
    "vertical": (
        "Stack the panels vertically with cinematic pacing and generous space "
        "for dialogue balloons."
    ),
    "cinematic": (
        "Use a cinematic layout with a wide establishing panel at the top "
        "followed by dynamic close-ups underneath."
    ),
}


def build_character_prompt(characters: Iterable[Any]) -> str:
    """Render a textual roster for prompts based on character metadata."""

    entries: list[tuple[int, int, str]] = []
    for idx, item in enumerate(characters, start=1):
        character_obj: Character | None = None
        role: str | None = None
        order_index: int | None = None

        if hasattr(item, "character") and isinstance(item.character, Character):
            character_obj = item.character
            role = getattr(item, "role", None)
            order_index = getattr(item, "order_index", None)
        elif isinstance(item, Character):
            character_obj = item
            role = getattr(item, "role", None)
            order_index = getattr(item, "order_index", None)
        else:
            continue

        if not character_obj:
            continue

        label = character_obj.name or f"Character {character_obj.id}"
        if role:
            label = f"{label} ({role})"

        description = (
            character_obj.optimized_description
            or character_obj.description
            or ""
        ).strip()
        style_prompt = (character_obj.style_prompt or "").strip()

        details: list[str] = []
        if description:
            details.append(description)
        if style_prompt:
            details.append(f"Style cues: {style_prompt}")

        entry_text = f"- {label}"
        if details:
            entry_text += f": {' '.join(details)}"

        entries.append((order_index if order_index is not None else idx, idx, entry_text))

    if not entries:
        return ""

    entries.sort(key=lambda item: (item[0], item[1]))
    roster_lines = [text for _, _, text in entries]
    return "Character roster:\n" + "\n".join(roster_lines)


def build_page_render_prompt(
    comic: Comic,
    script_data: dict[str, Any],
    page_number: int,
    layout_instruction: str,
    panel_lines: list[str],
    context_block: str,
) -> str:
    """Compose the full prompt for image generation, including character context."""

    sections: list[str] = []

    character_prompt = build_character_prompt(comic.character_links)
    if character_prompt:
        sections.append(character_prompt)

    title = script_data.get("title") or comic.title
    style_notes = script_data.get("style_notes") or comic.style_description

    base_prompt = (
        f"Render page {page_number} of the manga \"{title}\" with the following layout:\n\n"
        f"{layout_instruction}\n\n"
        f"Overall Style: {style_notes}\n"
        f"Preferred Aspect Ratio: {comic.aspect_ratio}\n\n"
        f"Panel Details:\n{chr(10).join(panel_lines)}"
    )
    sections.append(base_prompt)

    if context_block:
        sections.append(context_block)

    sections.append(
        "Requirements:\n"
        "- Maintain stylistic continuity with earlier pages\n"
        "- Leave space for lettering and speech balloons\n"
        "- Use high-contrast black and white manga illustration"
    )

    return "\n\n".join(section for section in sections if section)


def _extract_text_from_response(response: Any) -> str:
    text = getattr(response, "text", "") or ""
    if text:
        return text.strip()

    candidates = getattr(response, "candidates", None) or []
    chunks: list[str] = []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            part_text = getattr(part, "text", None)
            if part_text:
                chunks.append(part_text)
    return "\n".join(chunk.strip() for chunk in chunks if chunk).strip()


def _panel_summary_lines(panels: Sequence[ComicPanelShot]) -> list[str]:
    lines: list[str] = []
    for panel in panels:
        page_no = panel.page_number if panel.page_number is not None else "?"
        panel_no = panel.panel_number if panel.panel_number is not None else panel.sequence_index
        description = panel.description or "Description missing"
        dialogue = panel.dialogue or ""
        parts = [f"Page {page_no} Panel {panel_no}: {description}"]
        if dialogue:
            parts.append(f"Dialogue: {dialogue}")
        lines.append(" ".join(parts))
    return lines


def bootstrap_comic_workflow(comic: Comic) -> None:
    """Ensure workflow stage rows exist for the supplied comic."""

    existing = {stage.stage for stage in comic.workflow_stages}
    for stage_name in WORKFLOW_STAGES:
        if stage_name not in existing:
            stage_row = ComicWorkflowStage(
                comic_id=comic.id,
                stage=stage_name,
                status="pending",
            )
            db.session.add(stage_row)
            comic.workflow_stages.append(stage_row)

    if not comic.workflow_stage:
        comic.workflow_stage = WORKFLOW_STAGES[0]
    if not comic.workflow_status:
        comic.workflow_status = "pending"


def _get_stage_row(comic: Comic, stage: str) -> ComicWorkflowStage:
    for stage_row in comic.workflow_stages:
        if stage_row.stage == stage:
            return stage_row

    stage_row = ComicWorkflowStage(comic_id=comic.id, stage=stage, status="pending")
    db.session.add(stage_row)
    comic.workflow_stages.append(stage_row)
    return stage_row


def _assign_stage_job(comic: Comic, stage: str, job_id: str) -> None:
    stage_row = _get_stage_row(comic, stage)
    stage_row.job_id = job_id
    db.session.flush()


def _set_stage_status(comic: Comic, stage: str, status: str, *, error: str | None = None) -> None:
    stage_row = _get_stage_row(comic, stage)
    now = datetime.utcnow()

    if status == "pending":
        stage_row.started_at = None
        stage_row.completed_at = None
        stage_row.error_message = None
    elif status == "in_progress":
        stage_row.started_at = now
        stage_row.completed_at = None
        stage_row.error_message = None
        comic.workflow_stage = stage
        comic.workflow_status = status
        comic.status = "processing"
        comic.started_at = comic.started_at or now
        comic.error_message = None
    elif status == "completed":
        stage_row.completed_at = now
        stage_row.error_message = None
        idx = WORKFLOW_STAGES.index(stage) if stage in WORKFLOW_STAGES else -1
        if idx >= 0 and idx + 1 < len(WORKFLOW_STAGES):
            comic.workflow_stage = WORKFLOW_STAGES[idx + 1]
            comic.workflow_status = "pending"
            comic.status = "processing"
            comic.error_message = None
        else:
            comic.workflow_stage = stage
            comic.workflow_status = status
            comic.status = "completed"
            comic.completed_at = now
            comic.error_message = None
    elif status == "failed":
        stage_row.completed_at = now
        stage_row.error_message = error
        comic.workflow_stage = stage
        comic.workflow_status = status
        comic.status = "failed"
        comic.error_message = error
        comic.completed_at = now
    else:
        comic.workflow_stage = stage
        comic.workflow_status = status

    stage_row.status = status
    db.session.flush()


def _load_script_payload(script: Script | None) -> dict[str, Any]:
    if not script or not script.content:
        return {}

    try:
        return json.loads(script.content)
    except json.JSONDecodeError:
        return {"story": script.content}


def _build_outline_sections(script_data: dict[str, Any]) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    panels = script_data.get("panels")

    if isinstance(panels, list) and panels:
        for idx, panel in enumerate(panels, start=1):
            title = (
                panel.get("title")
                or panel.get("heading")
                or f"Beat {panel.get('panel_number') or idx}"
            )

            summary_parts: list[str] = []
            for key in ("scene", "summary", "description"):
                value = panel.get(key)
                if isinstance(value, str) and value.strip():
                    summary_parts.append(value.strip())
                    break

            dialogue = panel.get("dialogue")
            if isinstance(dialogue, str) and dialogue.strip():
                summary_parts.append(f"Dialogue: {dialogue.strip()}")

            visual = panel.get("visual_notes")
            if isinstance(visual, str) and visual.strip():
                summary_parts.append(f"Visual notes: {visual.strip()}")

            summary = "\n".join(summary_parts) if summary_parts else json.dumps(panel)
            sections.append({"title": title, "summary": summary})
    else:
        story_text = ""
        for key in ("story", "summary", "content"):
            value = script_data.get(key)
            if isinstance(value, str) and value.strip():
                story_text = value.strip()
                break

        if story_text:
            paragraphs = [chunk.strip() for chunk in story_text.split("\n") if chunk.strip()]
            if not paragraphs:
                paragraphs = [story_text]
            for idx, paragraph in enumerate(paragraphs, start=1):
                sections.append({"title": f"Section {idx}", "summary": paragraph})
        else:
            sections.append({"title": "Concept", "summary": "Story outline pending."})

    return sections


def _panel_payload_json(panels: list[ComicPanelShot]) -> str:
    payload: list[dict[str, Any]] = []
    for panel in panels:
        payload.append(
            {
                "panel_number": panel.panel_number,
                "sequence_index": panel.sequence_index,
                "description": panel.description,
                "dialogue": panel.dialogue,
                "camera_notes": panel.camera_notes,
                "style_notes": panel.style_notes,
            }
        )
    return json.dumps(payload, ensure_ascii=False)


def enqueue_comic_workflow(
    queue,
    comic: Comic,
    *,
    image_model: str | None = None,
) -> dict[str, str]:
    """Schedule outline, shot refinement, and first render jobs for a comic."""

    bootstrap_comic_workflow(comic)
    db.session.flush()

    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]

    outline_job = queue.enqueue(
        process_outline_stage,
        comic_id=comic.id,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Outline draft for comic {comic.id}",
    )
    _assign_stage_job(comic, "outline", outline_job.id)

    shots_job = queue.enqueue(
        process_shot_stage,
        comic_id=comic.id,
        depends_on=outline_job,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Shot refinement for comic {comic.id}",
    )
    _assign_stage_job(comic, "shots", shots_job.id)

    render_job = queue.enqueue(
        process_page_render_stage,
        comic_id=comic.id,
        page_number=1,
        image_model=image_model,
        chain_remaining=True,
        depends_on=shots_job,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Render page 1 for comic {comic.id}",
    )
    _assign_stage_job(comic, "render", render_job.id)

    comic.job_id = render_job.id
    db.session.commit()

    return {
        "outline_job_id": outline_job.id,
        "shot_job_id": shots_job.id,
        "render_job_id": render_job.id,
    }


def enqueue_page_render(
    queue,
    comic: Comic,
    page_number: int,
    *,
    image_model: str | None = None,
    chain_remaining: bool = False,
):
    """Schedule a render job for a specific comic page."""

    bootstrap_comic_workflow(comic)
    db.session.flush()

    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]

    job = queue.enqueue(
        process_page_render_stage,
        comic_id=comic.id,
        page_number=page_number,
        image_model=image_model,
        chain_remaining=chain_remaining,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Render page {page_number} for comic {comic.id}",
    )

    _assign_stage_job(comic, "render", job.id)
    comic.job_id = job.id
    comic.workflow_stage = "render"
    comic.workflow_status = "in_progress"
    comic.status = "processing"
    db.session.commit()

    return job


def enqueue_story_optimization(queue, comic: Comic) -> dict[str, str]:
    """Queue outline and shot refinement jobs without triggering renders."""

    bootstrap_comic_workflow(comic)
    db.session.flush()

    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]

    outline_job = queue.enqueue(
        process_outline_stage,
        comic_id=comic.id,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Outline optimisation for comic {comic.id}",
    )
    _assign_stage_job(comic, "outline", outline_job.id)

    shots_job = queue.enqueue(
        process_shot_stage,
        comic_id=comic.id,
        depends_on=outline_job,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Shot optimisation for comic {comic.id}",
    )
    _assign_stage_job(comic, "shots", shots_job.id)

    comic.workflow_stage = "outline"
    comic.workflow_status = "in_progress"
    comic.status = "processing"
    db.session.commit()

    return {"outline_job_id": outline_job.id, "shot_job_id": shots_job.id}


def enqueue_publish_workflow(
    queue,
    comic: Comic,
    *,
    image_model: str | None = None,
    make_public: bool = True,
) -> dict[str, str]:
    """Schedule export, cover generation, and publish finalisation jobs."""

    bootstrap_comic_workflow(comic)
    db.session.flush()

    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]

    export_job = queue.enqueue(
        process_export_stage,
        comic_id=comic.id,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Export bundle for comic {comic.id}",
    )
    _assign_stage_job(comic, "export", export_job.id)

    cover_job = queue.enqueue(
        process_cover_generation,
        comic_id=comic.id,
        image_model=image_model,
        depends_on=export_job,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Generate cover for comic {comic.id}",
    )

    publish_job = queue.enqueue(
        finalize_publish_stage,
        comic_id=comic.id,
        make_public=make_public,
        depends_on=cover_job,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Finalize publish for comic {comic.id}",
    )

    comic.job_id = publish_job.id
    db.session.commit()

    return {
        "export_job_id": export_job.id,
        "cover_job_id": cover_job.id,
        "publish_job_id": publish_job.id,
    }


def process_outline_stage(comic_id: int) -> dict[str, Any]:
    """Derive outline sections from a comic's script."""

    with _application_context():
        job_id = _current_job_id()
        logger.info("=== Outline stage started for comic_id=%s job_id=%s ===", comic_id, job_id)

        comic: Comic | None = db.session.get(Comic, comic_id)
        if not comic:
            raise ValueError(f"Comic {comic_id} not found")

        script: Script | None = db.session.get(Script, comic.script_id)
        if not script:
            raise ValueError(f"Script for comic {comic_id} not found")

        try:
            _set_stage_status(comic, "outline", "in_progress")
            comic.error_message = None
            db.session.commit()

            script_data = _load_script_payload(script)
            sections_data = _build_outline_sections(script_data)

            ComicPageLayout.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
            ComicPanelShot.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
            ComicOutlineSection.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
            db.session.flush()

            created_sections: list[ComicOutlineSection] = []
            for idx, section in enumerate(sections_data, start=1):
                outline = ComicOutlineSection(
                    comic_id=comic_id,
                    order_index=idx,
                    title=section.get("title"),
                    summary=section.get("summary") or "",
                    status="draft",
                )
                db.session.add(outline)
                created_sections.append(outline)

            db.session.flush()
            _set_stage_status(comic, "outline", "completed")
            db.session.commit()

            logger.info("=== Outline stage completed for comic_id=%s job_id=%s ===", comic_id, job_id)
            return {
                "status": "completed",
                "comic_id": comic_id,
                "sections": [section.to_dict() for section in created_sections],
            }
        except Exception as exc:
            logger.exception("Outline stage failed for comic_id=%s job_id=%s", comic_id, job_id)
            db.session.rollback()

            comic = db.session.get(Comic, comic_id)
            if comic:
                _set_stage_status(comic, "outline", "failed", error=str(exc))
                db.session.commit()

            return {"status": "failed", "comic_id": comic_id, "error": str(exc)}


def process_shot_stage(comic_id: int) -> dict[str, Any]:
    """Convert outline sections into panel shots and layout suggestions."""

    with _application_context():
        job_id = _current_job_id()
        logger.info("=== Shot refinement started for comic_id=%s job_id=%s ===", comic_id, job_id)

        comic: Comic | None = db.session.get(Comic, comic_id)
        if not comic:
            raise ValueError(f"Comic {comic_id} not found")

        script: Script | None = db.session.get(Script, comic.script_id)
        if not script:
            raise ValueError(f"Script for comic {comic_id} not found")

        try:
            _set_stage_status(comic, "shots", "in_progress")
            comic.error_message = None
            db.session.commit()

            script_data = _load_script_payload(script)
            outline_sections = (
                ComicOutlineSection.query.filter_by(comic_id=comic_id)
                .order_by(ComicOutlineSection.order_index)
                .all()
            )

            if not outline_sections:
                sections_data = _build_outline_sections(script_data)
                for idx, section in enumerate(sections_data, start=1):
                    outline = ComicOutlineSection(
                        comic_id=comic_id,
                        order_index=idx,
                        title=section.get("title"),
                        summary=section.get("summary") or "",
                        status="draft",
                    )
                    db.session.add(outline)
                    outline_sections.append(outline)
                db.session.flush()

            ComicPageLayout.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
            ComicPanelShot.query.filter_by(comic_id=comic_id).delete(synchronize_session=False)
            db.session.flush()

            panel_payload = script_data.get("panels") if isinstance(script_data, dict) else None
            created_panels: list[ComicPanelShot] = []
            for idx, section in enumerate(outline_sections, start=1):
                panel_info = (
                    panel_payload[idx - 1]
                    if isinstance(panel_payload, list) and idx - 1 < len(panel_payload)
                    else {}
                )
                description = (
                    panel_info.get("scene")
                    or panel_info.get("summary")
                    or section.summary
                )
                dialogue = panel_info.get("dialogue") if isinstance(panel_info, dict) else None
                camera_notes = panel_info.get("camera") or panel_info.get("camera_notes")
                style_notes = (
                    panel_info.get("visual_notes")
                    if isinstance(panel_info, dict)
                    else None
                ) or script_data.get("style_notes") or comic.style_description

                panel = ComicPanelShot(
                    comic_id=comic_id,
                    outline_section_id=section.id,
                    sequence_index=idx,
                    description=(description or section.summary or "").strip(),
                    dialogue=(dialogue.strip() if isinstance(dialogue, str) else dialogue),
                    camera_notes=(
                        camera_notes.strip() if isinstance(camera_notes, str) else camera_notes
                    ),
                    style_notes=style_notes,
                    status="draft",
                )
                db.session.add(panel)
                created_panels.append(panel)

            db.session.flush()

            layouts: list[ComicPageLayout] = []
            layout_by_page: dict[int, ComicPageLayout] = {}
            for panel in created_panels:
                page_number = (panel.sequence_index - 1) // PANELS_PER_PAGE + 1
                panel_number = ((panel.sequence_index - 1) % PANELS_PER_PAGE) + 1
                panel.page_number = page_number
                panel.panel_number = panel_number

                layout = layout_by_page.get(page_number)
                if not layout:
                    layout = ComicPageLayout(
                        comic_id=comic_id,
                        page_number=page_number,
                        layout_key="auto-grid",
                        status="suggested",
                    )
                    db.session.add(layout)
                    db.session.flush()
                    layout_by_page[page_number] = layout
                    layouts.append(layout)

                assignment = ComicPagePanel(
                    page_layout_id=layout.id,
                    panel_shot_id=panel.id,
                    position=panel_number,
                )
                db.session.add(assignment)

            db.session.flush()
            _set_stage_status(comic, "shots", "completed")
            db.session.commit()

            logger.info("=== Shot refinement completed for comic_id=%s job_id=%s ===", comic_id, job_id)
            return {
                "status": "completed",
                "comic_id": comic_id,
                "panel_shots": [panel.to_dict() for panel in created_panels],
                "page_layouts": [layout.to_dict() for layout in layouts],
            }
        except Exception as exc:
            logger.exception("Shot refinement failed for comic_id=%s job_id=%s", comic_id, job_id)
            db.session.rollback()

            comic = db.session.get(Comic, comic_id)
            if comic:
                _set_stage_status(comic, "shots", "failed", error=str(exc))
                db.session.commit()

            return {"status": "failed", "comic_id": comic_id, "error": str(exc)}


def process_page_render_stage(
    comic_id: int,
    page_number: int,
    *,
    image_model: str | None = None,
    chain_remaining: bool = False,
) -> dict[str, Any]:
    """Render a comic page using existing panel shots and layout assignments."""

    with _application_context():
        job_id = _current_job_id()
        logger.info(
            "=== Page render started for comic_id=%s page=%s job_id=%s ===",
            comic_id,
            page_number,
            job_id,
        )

        comic: Comic | None = db.session.get(Comic, comic_id)
        if not comic:
            raise ValueError(f"Comic {comic_id} not found")

        script: Script | None = db.session.get(Script, comic.script_id)
        if not script:
            raise ValueError(f"Script for comic {comic_id} not found")

        layout = (
            ComicPageLayout.query.filter_by(comic_id=comic_id, page_number=page_number)
            .order_by(ComicPageLayout.id)
            .first()
        )
        if not layout:
            raise ValueError(f"Layout for comic {comic_id} page {page_number} not found")

        try:
            _set_stage_status(comic, "render", "in_progress")
            layout.status = "rendering"
            db.session.commit()

            script_data = _load_script_payload(script)
            panels = (
                ComicPanelShot.query.filter_by(comic_id=comic_id, page_number=page_number)
                .order_by(ComicPanelShot.panel_number)
                .all()
            )
            if not panels:
                raise ValueError("No panel shots assigned to this page")

            panel_lines: list[str] = []
            for panel in panels:
                panel_index = panel.panel_number or panel.sequence_index
                description = panel.description or "Scene description missing"
                line_parts = [f"Panel {panel_index}: {description}"]
                if panel.dialogue:
                    line_parts.append(f"Dialogue: {panel.dialogue}")
                if panel.camera_notes:
                    line_parts.append(f"Camera: {panel.camera_notes}")
                if panel.style_notes:
                    line_parts.append(f"Style: {panel.style_notes}")
                panel_lines.append(" ".join(line_parts))

            previous_panels = (
                ComicPanelShot.query.filter(
                    ComicPanelShot.comic_id == comic_id,
                    ComicPanelShot.page_number.isnot(None),
                    ComicPanelShot.page_number < page_number,
                )
                .order_by(ComicPanelShot.sequence_index)
                .all()
            )

            context_lines: list[str] = []
            for prev in previous_panels:
                snippet = prev.dialogue or prev.description
                if snippet:
                    panel_idx = prev.panel_number or prev.sequence_index
                    context_lines.append(
                        f"Page {prev.page_number} Panel {panel_idx}: {snippet}"
                    )
            context_block = (
                "Previous pages context:\n" + "\n".join(context_lines)
                if context_lines
                else ""
            )

            layout_instruction = LAYOUT_INSTRUCTIONS.get(
                layout.layout_key,
                LAYOUT_INSTRUCTIONS["auto-grid"],
            )
            if layout.notes:
                layout_instruction += f" Notes: {layout.notes}"

            api_key = _gemini_api_key()
            genai.configure(api_key=api_key)
            model_name = image_model or _config_value("GEMINI_IMAGE_MODEL", Config.GEMINI_IMAGE_MODEL)
            image_model_client = genai.GenerativeModel(model_name)

            prompt = build_page_render_prompt(
                comic,
                script_data,
                page_number,
                layout_instruction,
                panel_lines,
                context_block,
            )

            result = image_model_client.generate_content(prompt)

            img_data: bytes | None = None
            if result.candidates:
                candidate = result.candidates[0]
                content = getattr(candidate, "content", None)
                if content and content.parts:
                    for part in content.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            image_data = inline.data
                            if isinstance(image_data, str):
                                img_data = base64.b64decode(image_data)
                            else:
                                img_data = image_data
                            break

            if not img_data:
                raise ValueError("No image data returned from Gemini")

            storage = _get_storage()
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"manga_page_{comic_id}_{page_number}_{timestamp}.png"
            r2_url = storage.upload_image(
                image_data=img_data,
                filename=filename,
                content_type="image/png",
            )
            if not r2_url:
                raise ValueError("Failed to upload image to R2")

            panel_payload = _panel_payload_json(panels)
            comic_page = (
                ComicPage.query.filter_by(comic_id=comic_id, page_number=page_number)
                .first()
            )
            if comic_page:
                comic_page.image_url = r2_url
                comic_page.panel_text = panel_payload
                comic_page.script_id = comic.script_id
            else:
                comic_page = ComicPage(
                    comic_id=comic_id,
                    script_id=comic.script_id,
                    page_number=page_number,
                    image_url=r2_url,
                    panel_text=panel_payload,
                )
                db.session.add(comic_page)

            db.session.flush()
            layout.comic_page_id = comic_page.id
            layout.status = "rendered"
            layout.selected_at = layout.selected_at or datetime.utcnow()

            total_pages = (
                db.session.query(func.max(ComicPanelShot.page_number))
                .filter(ComicPanelShot.comic_id == comic_id)
                .scalar()
            ) or 0
            rendered_pages = ComicPage.query.filter_by(comic_id=comic_id).count()

            if total_pages and rendered_pages >= total_pages:
                _set_stage_status(comic, "render", "completed")
            else:
                comic.error_message = None
                if chain_remaining:
                    next_panel = (
                        ComicPanelShot.query.filter(
                            ComicPanelShot.comic_id == comic_id,
                            ComicPanelShot.page_number.isnot(None),
                            ComicPanelShot.page_number > page_number,
                        )
                        .order_by(ComicPanelShot.page_number.asc())
                        .first()
                    )
                    if next_panel and next_panel.page_number:
                        queue = current_app.extensions.get("rq_queue")
                        if queue:
                            timeout = current_app.config["RQ_JOB_TIMEOUT"]
                            result_ttl = current_app.config["RQ_RESULT_TTL"]
                            next_job = queue.enqueue(
                                process_page_render_stage,
                                comic_id=comic_id,
                                page_number=next_panel.page_number,
                                image_model=image_model,
                                chain_remaining=True,
                                job_timeout=timeout,
                                result_ttl=result_ttl,
                                description=f"Render page {next_panel.page_number} for comic {comic_id}",
                            )
                            _assign_stage_job(comic, "render", next_job.id)

            db.session.commit()

            status_label = "completed" if comic.workflow_status == "completed" else "processing"
            logger.info(
                "=== Page render finished for comic_id=%s page=%s (%s) job_id=%s ===",
                comic_id,
                page_number,
                status_label,
                job_id,
            )
            return {
                "status": status_label,
                "comic_id": comic_id,
                "page_number": page_number,
                "image_url": r2_url,
                "page": comic_page.to_dict(),
            }
        except Exception as exc:
            logger.exception(
                "Page render failed for comic_id=%s page=%s job_id=%s",
                comic_id,
                page_number,
                job_id,
            )
            db.session.rollback()

            comic = db.session.get(Comic, comic_id)
            if comic:
                _set_stage_status(comic, "render", "failed", error=str(exc))
                db.session.commit()

            return {
                "status": "failed",
                "comic_id": comic_id,
                "page_number": page_number,
                "error": str(exc),
            }


def _load_page_images(storage, pages: Sequence[ComicPage]) -> list[tuple[int, bytes]]:
    payload: list[tuple[int, bytes]] = []
    for page in pages:
        data = storage.download_file(page.image_url)
        if not data:
            raise ValueError(f"Failed to download image for page {page.page_number}")
        payload.append((page.page_number, data))
    return payload


def _build_pdf_bytes(image_payload: list[tuple[int, bytes]]) -> bytes:
    if not image_payload:
        raise ValueError("No images supplied for PDF export")

    pdf_buffer = BytesIO()
    images: list[Image.Image] = []
    try:
        for _, data in image_payload:
            with Image.open(BytesIO(data)) as img:
                converted = img.convert("RGB")
                images.append(converted)

        first_image, *others = images
        if others:
            first_image.save(pdf_buffer, format="PDF", save_all=True, append_images=others)
        else:
            first_image.save(pdf_buffer, format="PDF")
    except UnidentifiedImageError as exc:
        raise ValueError("One of the page images is not a valid image") from exc
    finally:
        for image in images:
            try:
                image.close()
            except Exception:  # pragma: no cover - cleanup
                pass

    return pdf_buffer.getvalue()


def process_export_stage(comic_id: int) -> dict[str, Any]:
    """Bundle rendered comic pages into ZIP and PDF artifacts."""

    with _application_context():
        job_id = _current_job_id()
        logger.info("=== Export stage started for comic_id=%s job_id=%s ===", comic_id, job_id)

        comic: Comic | None = db.session.get(Comic, comic_id)
        if not comic:
            raise ValueError(f"Comic {comic_id} not found")

        pages = (
            ComicPage.query.filter_by(comic_id=comic_id)
            .order_by(ComicPage.page_number)
            .all()
        )

        if not pages:
            raise ValueError("No rendered pages available for export")

        storage = _get_storage()

        try:
            _set_stage_status(comic, "export", "in_progress")
            db.session.commit()

            image_payload = _load_page_images(storage, pages)

            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                for page_number, data in image_payload:
                    archive_name = f"page-{page_number:03d}.png"
                    bundle.writestr(archive_name, data)

            pdf_bytes = _build_pdf_bytes(image_payload)
            zip_bytes = zip_buffer.getvalue()

            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            base_name = f"comic_{comic_id}_{timestamp}"

            pdf_url = storage.upload_file(
                pdf_bytes,
                f"{base_name}.pdf",
                content_type="application/pdf",
                prefix="manga/exports",
            )
            zip_url = storage.upload_file(
                zip_bytes,
                f"{base_name}.zip",
                content_type="application/zip",
                prefix="manga/exports",
            )

            if not pdf_url or not zip_url:
                raise ValueError("Failed to upload export bundles to storage")

            comic.pdf_url = pdf_url
            comic.zip_url = zip_url
            db.session.flush()
            _set_stage_status(comic, "export", "completed")
            db.session.commit()

            logger.info("=== Export stage completed for comic_id=%s job_id=%s ===", comic_id, job_id)
            return {
                "status": "completed",
                "comic_id": comic_id,
                "pdf_url": pdf_url,
                "zip_url": zip_url,
            }
        except Exception as exc:
            logger.exception("Export stage failed for comic_id=%s job_id=%s", comic_id, job_id)
            db.session.rollback()

            comic = db.session.get(Comic, comic_id)
            if comic:
                _set_stage_status(comic, "export", "failed", error=str(exc))
                db.session.commit()

            return {"status": "failed", "comic_id": comic_id, "error": str(exc)}


def process_cover_generation(
    comic_id: int,
    *,
    image_model: str | None = None,
) -> dict[str, Any]:
    """Generate a public-facing cover image for a comic."""

    with _application_context():
        job_id = _current_job_id()
        logger.info("=== Cover generation started for comic_id=%s job_id=%s ===", comic_id, job_id)

        comic: Comic | None = db.session.get(Comic, comic_id)
        if not comic:
            raise ValueError(f"Comic {comic_id} not found")

        panels = (
            ComicPanelShot.query.filter_by(comic_id=comic_id)
            .order_by(ComicPanelShot.sequence_index)
            .all()
        )

        if not panels:
            raise ValueError("Cannot generate cover without panel context")

        try:
            api_key = _gemini_api_key()
            genai.configure(api_key=api_key)

            text_model_name = _config_value("GEMINI_SCRIPT_MODEL", Config.GEMINI_SCRIPT_MODEL)
            text_model = genai.GenerativeModel(text_model_name)

            summary_prompt = (
                "You are a manga editor distilling a finished comic into a single evocative cover brief.\n"
                f"Title: {comic.title}\n"
                f"Target art style: {comic.style_description}\n"
                "Describe the central conflict, mood, and key characters in under 80 words.\n"
                "Emphasise imagery that would inspire a striking manga cover illustration.\n\n"
                "Story outline:\n"
                + "\n".join(_panel_summary_lines(panels))
            )

            summary_response = text_model.generate_content(summary_prompt)
            summary_text = _extract_text_from_response(summary_response)
            if not summary_text:
                raise ValueError("Gemini summary was empty")

            image_model_name = image_model or _config_value(
                "GEMINI_IMAGE_MODEL", Config.GEMINI_IMAGE_MODEL
            )
            image_model_client = genai.GenerativeModel(image_model_name)

            cover_prompt = (
                f"Design a finished manga cover for '{comic.title}'.\n"
                f"Narrative summary: {summary_text}\n"
                f"Visual direction: {comic.style_description}.\n"
                "Focus on the lead characters in a dramatic composition with space for title typography at the top."
            )

            result = image_model_client.generate_content(cover_prompt)

            img_data: bytes | None = None
            if result.candidates:
                candidate = result.candidates[0]
                content = getattr(candidate, "content", None)
                if content and content.parts:
                    for part in content.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            image_data = inline.data
                            if isinstance(image_data, str):
                                img_data = base64.b64decode(image_data)
                            else:
                                img_data = image_data
                            break

            if not img_data:
                raise ValueError("No cover image data returned from Gemini")

            filename = f"comic_{comic_id}_cover_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"
            storage = _get_storage()
            cover_url = storage.upload_image(
                image_data=img_data,
                filename=filename,
                content_type="image/png",
            )

            if not cover_url:
                raise ValueError("Failed to upload cover image to storage")

            comic.cover_image_url = cover_url
            db.session.commit()

            logger.info("=== Cover generation completed for comic_id=%s job_id=%s ===", comic_id, job_id)
            return {
                "status": "completed",
                "comic_id": comic_id,
                "cover_image_url": cover_url,
                "summary": summary_text,
            }
        except Exception as exc:
            logger.exception("Cover generation failed for comic_id=%s job_id=%s", comic_id, job_id)
            db.session.rollback()
            return {"status": "failed", "comic_id": comic_id, "error": str(exc)}


def finalize_publish_stage(
    comic_id: int,
    *,
    make_public: bool = True,
) -> dict[str, Any]:
    """Mark a comic as published and ready for public listing."""

    with _application_context():
        job_id = _current_job_id()
        logger.info(
            "=== Publish finalisation started for comic_id=%s job_id=%s ===",
            comic_id,
            job_id,
        )

        comic: Comic | None = db.session.get(Comic, comic_id)
        if not comic:
            raise ValueError(f"Comic {comic_id} not found")

        try:
            if make_public:
                missing_assets: list[str] = []
                if not comic.pdf_url:
                    missing_assets.append("pdf")
                if not comic.zip_url:
                    missing_assets.append("zip")
                if not comic.cover_image_url:
                    missing_assets.append("cover")
                if missing_assets:
                    raise ValueError(
                        "Cannot publish comic without assets: " + ", ".join(sorted(missing_assets))
                    )

                comic.is_public = True
                comic.published_at = comic.published_at or datetime.utcnow()
            else:
                comic.is_public = False
                comic.published_at = None

            db.session.commit()

            logger.info("=== Publish finalisation completed for comic_id=%s job_id=%s ===", comic_id, job_id)
            return {
                "status": "completed",
                "comic_id": comic_id,
                "is_public": comic.is_public,
                "published_at": (
                    comic.published_at.isoformat() if comic.published_at else None
                ),
            }
        except Exception as exc:
            logger.exception("Publish finalisation failed for comic_id=%s job_id=%s", comic_id, job_id)
            db.session.rollback()
            return {"status": "failed", "comic_id": comic_id, "error": str(exc)}


def set_comic_stage_status(
    comic: Comic,
    stage: str,
    status: str,
    *,
    error: str | None = None,
) -> None:
    """Expose stage status updates for synchronous flows."""

    _set_stage_status(comic, stage, status, error=error)


def process_character_optimization(
    character_id: int,
    source_description: str | None = None,
) -> dict[str, Any]:
    """Optimise a character description using the configured script model."""

    with _application_context():
        job_id = _current_job_id()
        logger.info(
            "=== Character optimisation started for character_id=%s job_id=%s ===",
            character_id,
            job_id,
        )

        character = db.session.get(Character, character_id)
        if not character:
            logger.error("Character %s not found", character_id)
            raise ValueError(f"Character {character_id} not found")

        description_text = (source_description or character.description or "").strip()
        if not description_text:
            raise ValueError("Character description is empty")

        try:
            optimized = optimize_character_description(description_text)
            character.optimized_description = optimized
            if source_description:
                character.description = source_description
            db.session.commit()

            logger.info(
                "=== Character optimisation completed for character_id=%s job_id=%s ===",
                character_id,
                job_id,
            )
            return {
                "status": "completed",
                "character_id": character_id,
                "optimized_description": optimized,
            }
        except Exception as exc:
            logger.exception(
                "Character optimisation failed for character_id=%s job_id=%s: %s",
                character_id,
                job_id,
                exc,
            )
            db.session.rollback()
            return {
                "status": "failed",
                "character_id": character_id,
                "error": str(exc),
            }


def process_character_image_generation(
    character_id: int,
    description: str | None = None,
    reference_images: Iterable[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Generate a character concept illustration using Gemini."""
    with _application_context():
        job_id = _current_job_id()
        logger.info(
            "=== Starting character image job character_id=%s job_id=%s ===",
            character_id,
            job_id,
        )

        character = db.session.get(Character, character_id)
        if not character:
            logger.error("Character %s not found", character_id)
            raise ValueError(f"Character {character_id} not found")

        prompt_description = (description or character.optimized_description or character.description or "").strip()
        if not prompt_description:
            raise ValueError("Character description is empty")
        image_refs = list(reference_images or [])

        try:
            character.image_status = "processing"
            character.image_error = None
            db.session.commit()

            api_key = _gemini_api_key()
            genai.configure(api_key=api_key)
            model_name = _config_value("GEMINI_IMAGE_MODEL", Config.GEMINI_IMAGE_MODEL)
            image_model = genai.GenerativeModel(model_name)

            prompt = (
                "Create a polished character concept illustration based on the description below. "
                "Incorporate notable traits and align with the provided reference imagery. "
                "Return a single high-resolution manga/anime style portrait.\n\n"
                f"Character description:\n{prompt_description}"
            )

            parts: list[dict[str, Any]] = []
            for idx, ref in enumerate(image_refs):
                data = ref.get("data")
                mime_type = ref.get("mime_type", "image/png")
                if not data:
                    logger.warning("Reference image %s missing data", idx)
                    continue
                try:
                    image_bytes = base64.b64decode(data)
                except Exception:
                    logger.warning("Failed to decode reference image %s", idx)
                    continue
                parts.append({"inline_data": {"mime_type": mime_type, "data": image_bytes}})

            logger.info(
                "Submitting character image prompt job_id=%s character_id=%s reference_count=%s",
                job_id,
                character_id,
                len(parts),
            )

            response = image_model.generate_content(parts + [{"text": prompt}])

            img_data: bytes | None = None
            if response.candidates:
                candidate = response.candidates[0]
                content = getattr(candidate, "content", None)
                if content and content.parts:
                    for part in content.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            image_data = inline.data
                            if isinstance(image_data, str):
                                img_data = base64.b64decode(image_data)
                            else:
                                img_data = image_data
                            break

            if not img_data:
                raise ValueError("Gemini image generation did not return image data")

            filename = f"character_{character_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"
            storage = _get_storage()
            r2_url = storage.upload_image(
                image_data=img_data,
                filename=filename,
                content_type="image/png",
            )

            if not r2_url:
                raise ValueError("Failed to upload character image to R2")

            character.image_url = r2_url
            character.image_status = "completed"
            character.image_error = None
            db.session.commit()

            logger.info(
                "Character image generated successfully for %s job_id=%s",
                character_id,
                job_id,
            )
            return {"status": "completed", "character_id": character_id, "image_url": r2_url}

        except Exception as exc:
            logger.exception(
                "Character image generation failed for %s job_id=%s",
                character_id,
                job_id,
            )
            character.image_status = "failed"
            character.image_error = str(exc)
            db.session.commit()
            raise
