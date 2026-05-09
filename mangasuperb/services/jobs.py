"""Background job implementations shared by the API and worker."""
from __future__ import annotations

import base64
import json
import logging
import mimetypes
import re
import zipfile
from collections import defaultdict
from collections.abc import Iterable, Sequence
from contextlib import contextmanager, suppress
from datetime import datetime
from io import BytesIO
from typing import Any

from flask import current_app
from PIL import Image, UnidentifiedImageError
from rq import get_current_job
from sqlalchemy import func

from config import Config
from mangasuperb.extensions import db
from mangasuperb.services.ai_provider import get_image_provider, get_text_provider
from mangasuperb.services.generation import (
    DEFAULT_ASPECT_RATIO,
    optimize_character_description,
    validate_aspect_ratio,
)
from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.page_render import (
    build_page_generation_context,
    render_page_prompt,
)
from mangasuperb.services.generation_skills.prompt_optimizer import optimize_text_if_enabled
from mangasuperb.services.generation_skills.shot_split import resolve_shot_drafts
from models import (
    DEFAULT_COLOR_MODES,
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
        app = current_app._get_current_object()
    except RuntimeError:
        from mangasuperb import create_app

        app = create_app()
        with app.app_context():
            yield app
    else:
        yield app


def _get_storage():
    storage = current_app.extensions.get("r2_storage")
    if not storage:
        raise RuntimeError("R2 storage is not configured")
    return storage


def _current_job_id() -> str:
    job = get_current_job()
    return job.id if job else "inline"


def _extract_dialogue(summary: str | None) -> str | None:
    if not summary:
        return None

    for line in summary.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.lower().startswith("dialogue:"):
            candidate = stripped.split(":", 1)[1].strip()
            if candidate:
                return candidate

    quote_pairs = [("“", "”"), ('"', '"'), ("'", "'")]
    for opener, closer in quote_pairs:
        start = summary.find(opener)
        while start != -1:
            end = summary.find(closer, start + len(opener))
            if end == -1:
                break
            candidate = summary[start + len(opener) : end].strip()
            if candidate:
                return candidate
            start = summary.find(opener, end + len(closer))

    return None


def _outline_description(summary: str | None) -> str:
    if not summary:
        return ""

    description_lines: list[str] = []
    skipped_prefixes = ("dialogue:", "visual notes:", "visual:", "camera:", "camera notes:")
    for line in summary.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.lower().startswith(skipped_prefixes):
            continue
        description_lines.append(stripped)

    return "\n".join(description_lines) or summary.strip()


def _config_value(key: str, default: str) -> str:
    try:
        return current_app.config.get(key, default)  # type: ignore[attr-defined]
    except RuntimeError:
        return getattr(Config, key, default)




def _collect_character_image_references(
    comic: Comic,
    *,
    max_images: int = 8,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Load inline image parts for characters and return descriptive labels."""
    if not comic.character_links:
        return [], []

    try:
        storage = _get_storage()
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("Skipping character image references; storage unavailable: %s", exc)
        return [], []

    sorted_links = sorted(
        (link for link in comic.character_links if link.character and link.character.image_url),
        key=lambda link: (
            link.order_index if link.order_index is not None else 0,
            link.id or 0,
        ),
    )

    ref_lines: list[str] = []
    ref_parts: list[dict[str, Any]] = []

    for link in sorted_links:
        character = link.character
        if not character or not character.image_url:
            continue

        try:
            image_bytes = storage.download_file(character.image_url)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("Failed to download character image %s: %s", character.id, exc)
            continue

        if not image_bytes:
            logger.warning(
                "Character %s has no downloadable image; skipping reference",
                character.id,
            )
            continue

        mime_type, _ = mimetypes.guess_type(character.image_url)
        mime_type = mime_type or "image/png"

        ref_index = len(ref_parts) + 1
        label = character.name or f"Character {character.id}"
        role = (link.role or "").strip()
        desc = (character.optimized_description or character.description or "").strip()

        detail_bits = [f"Ref {ref_index}: {label}"]
        if role:
            detail_bits[-1] += f" ({role})"
        detail_bits.append(
            "Next inline image corresponds to this character; keep appearance consistent."
        )
        if desc:
            detail_bits.append(f"Traits: {desc}")

        ref_lines.append(" ".join(detail_bits))
        ref_parts.append({"inline_data": {"mime_type": mime_type, "data": image_bytes}})

        if len(ref_parts) >= max_images:
            break

    return ref_lines, ref_parts


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
    color_mode: str | None = None,
    font_family: str | None = None,
    font_size: str | None = None,
    bubble_shape: str | None = None,
    bubble_tail: bool | None = None,
    aspect_ratio: str | None = None,
    reference_notes: Sequence[str] | None = None,
    previous_context_lines: Sequence[str] | None = None,
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
        f"Panel Details:\n{chr(10).join(panel_lines)}"
    )
    sections.append(base_prompt)

    if previous_context_lines:
        sections.append("Previous pages context:\n" + "\n".join(previous_context_lines))

    # Build requirements list with customization options
    requirements = [
        "- Maintain visual style aligned with the comic's direction",
        "- Focus only on the panels described for this page",
        "- Leave space for lettering and speech balloons",
        "- Use high quality manga illustration",
    ]

    if aspect_ratio:
        requirements.append(f"- Target aspect ratio: {aspect_ratio}")

    if color_mode:
        normalized_color = color_mode.replace("_", "-").strip().lower()
        if normalized_color == "color":
            requirements.append(
                "- Render in vibrant full color with rich lighting, gradients, "
                "and dynamic highlights"
            )
        elif normalized_color == "black-white":
            requirements.append(
                "- Keep the art in high-contrast black-and-white ink with clean screentone shading"
            )

    # Add bubble shape instruction
    if bubble_shape:
        shape_desc = "rectangular" if bubble_shape == "rect" else "rounded corner"
        requirements.append(f"- Use {shape_desc} speech bubbles for dialogue")

    # Add bubble tail instruction
    if bubble_tail is not None:
        tail_desc = "with" if bubble_tail else "without"
        requirements.append(f"- Draw speech bubble tails {tail_desc} pointers to speakers")

    # Add font instructions
    if font_family:
        requirements.append(f"- Use {font_family} font family for text")
    if font_size:
        requirements.append(f"- Use {font_size} font size for text")

    sections.append("Requirements:\n" + "\n".join(requirements))

    if reference_notes:
        sections.append(
            "Character image references (order matches the inline images provided):\n"
            + "\n".join(reference_notes)
        )

    return "\n\n".join(section for section in sections if section)


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

            if len(paragraphs) == 1:
                sentences = [
                    match.strip()
                    for match in re.findall(r"[^。！？!?；;]+[。！？!?；;]?", story_text)
                    if match.strip()
                ]
                if len(sentences) > 1:
                    paragraphs = sentences
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


def _resolve_panel_fields(
    idx: int,
    section: ComicOutlineSection,
    panel_payload: Any,
    script_data: dict[str, Any],
    comic: Comic,
) -> tuple[str, str | None, str | None, str | None]:
    entry: dict[str, Any] = {}
    if isinstance(panel_payload, list) and 0 <= idx - 1 < len(panel_payload):
        candidate = panel_payload[idx - 1]
        if isinstance(candidate, dict):
            entry = candidate

    description = (
        _outline_description(section.summary)
        or entry.get("scene")
        or entry.get("summary")
        or ""
    )

    dialogue_raw = entry.get("dialogue")
    dialogue_text = _extract_dialogue(section.summary)
    if not dialogue_text:
        dialogue_text = dialogue_raw.strip() if isinstance(dialogue_raw, str) else None

    camera_notes = entry.get("camera") or entry.get("camera_notes")
    if isinstance(camera_notes, str):
        camera_notes = camera_notes.strip() or None

    style_notes = entry.get("visual_notes") if entry else None
    if isinstance(style_notes, str):
        style_notes = style_notes.strip() or None
    if not style_notes:
        style_notes = script_data.get("style_notes") or comic.style_description

    return (
        description.strip(),
        dialogue_text,
        camera_notes,
        style_notes,
    )


def _build_shot_split_context(
    comic: Comic,
    script_data: dict[str, Any],
    outline_sections: Sequence[ComicOutlineSection],
) -> GenerationContext:
    panels = tuple(
        PanelContext(
            panel_number=None,
            sequence_index=idx,
            description=section.summary or "",
            dialogue=None,
            camera_notes=None,
            style_notes=None,
            source_title=section.title,
        )
        for idx, section in enumerate(outline_sections, start=1)
    )
    story_value = script_data.get("story")
    story = story_value if isinstance(story_value, str) else ""
    return GenerationContext(
        task_type="shot_split",
        comic_id=comic.id,
        comic_title=comic.title or "Untitled",
        page_number=None,
        story=story,
        style_notes=script_data.get("style_notes") or comic.style_description or "",
        script_data=script_data,
        panels=panels,
        layout=None,
        characters=(),
        visual_preferences={},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


def _build_page_render_context(
    comic: Comic,
    script_data: dict[str, Any],
    page_number: int,
    layout_instruction: str,
    layout_key: str,
    layout_notes: str | None,
    panels: Sequence[ComicPanelShot],
    normalized_color: str,
    normalized_aspect_ratio: str,
    ref_lines: Sequence[str],
    previous_context_lines: Sequence[str],
) -> GenerationContext:
    panel_contexts = tuple(
        PanelContext(
            panel_number=panel.panel_number,
            sequence_index=panel.sequence_index,
            description=panel.description or "Scene description missing",
            dialogue=panel.dialogue,
            camera_notes=panel.camera_notes,
            style_notes=panel.style_notes,
            source_title=None,
        )
        for panel in panels
    )
    characters = tuple(
        CharacterContext(
            name=link.character.name,
            role=link.role,
            description=link.character.description,
            optimized_description=link.character.optimized_description,
            style_prompt=link.character.style_prompt,
            reference_note=None,
        )
        for link in comic.character_links
        if link.character
    )
    return GenerationContext(
        task_type="page_render",
        comic_id=comic.id,
        comic_title=script_data.get("title") or comic.title or "Untitled",
        page_number=page_number,
        story=str(script_data.get("story") or ""),
        style_notes=script_data.get("style_notes") or comic.style_description or "",
        script_data=script_data,
        panels=panel_contexts,
        layout=LayoutContext(
            layout_key=layout_key,
            instruction=layout_instruction,
            notes=layout_notes,
            aspect_ratio=normalized_aspect_ratio,
        ),
        characters=characters,
        visual_preferences={"color_mode": normalized_color},
        reference_notes=tuple(ref_lines),
        previous_context_lines=tuple(previous_context_lines),
        text_options={},
    )


def enqueue_comic_workflow(
    queue,
    comic: Comic,
    *,
    image_model: str | None = None,
    image_provider: str | None = None,
    text_provider: str | None = None,
) -> dict[str, str]:
    """Schedule outline, shot refinement, and first render jobs for a comic."""

    bootstrap_comic_workflow(comic)
    db.session.flush()

    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]

    outline_job = queue.enqueue(
        process_outline_stage,
        comic_id=comic.id,
        text_provider=text_provider,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Outline draft for comic {comic.id}",
    )
    _assign_stage_job(comic, "outline", outline_job.id)

    shots_job = queue.enqueue(
        process_shot_stage,
        comic_id=comic.id,
        text_provider=text_provider,
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
        image_provider=image_provider,
        text_provider=text_provider,
        chain_remaining=True,
        aspect_ratio=comic.aspect_ratio,
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
    image_provider: str | None = None,
    text_provider: str | None = None,
    chain_remaining: bool = False,
    font_family: str | None = None,
    font_size: str | None = None,
    bubble_shape: str | None = None,
    bubble_tail: bool | None = None,
    color_mode: str | None = None,
    aspect_ratio: str | None = None,
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
        image_provider=image_provider,
        text_provider=text_provider,
        chain_remaining=chain_remaining,
        font_family=font_family,
        font_size=font_size,
        bubble_shape=bubble_shape,
        bubble_tail=bubble_tail,
        color_mode=color_mode,
        aspect_ratio=aspect_ratio or comic.aspect_ratio,
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


def enqueue_story_optimization(
    queue,
    comic: Comic,
    *,
    text_provider: str | None = None,
) -> dict[str, str]:
    """Queue outline and shot refinement jobs without triggering renders."""

    bootstrap_comic_workflow(comic)
    db.session.flush()

    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]

    outline_job = queue.enqueue(
        process_outline_stage,
        comic_id=comic.id,
        text_provider=text_provider,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Outline optimisation for comic {comic.id}",
    )
    _assign_stage_job(comic, "outline", outline_job.id)

    shots_job = queue.enqueue(
        process_shot_stage,
        comic_id=comic.id,
        text_provider=text_provider,
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

    # Reset export stage status so the UI reflects a fresh run.
    _set_stage_status(comic, "export", "pending")
    comic.workflow_stage = "export"
    comic.workflow_status = "pending"
    comic.status = "processing"
    comic.completed_at = None
    comic.error_message = None

    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]

    cover_job = queue.enqueue(
        process_cover_generation,
        comic_id=comic.id,
        image_model=image_model,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Generate cover for comic {comic.id}",
    )

    export_job = queue.enqueue(
        process_export_stage,
        comic_id=comic.id,
        depends_on=cover_job,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Export bundle for comic {comic.id}",
    )
    _assign_stage_job(comic, "export", export_job.id)

    publish_job = queue.enqueue(
        finalize_publish_stage,
        comic_id=comic.id,
        make_public=make_public,
        depends_on=export_job,
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


def process_outline_stage(
    comic_id: int,
    *,
    text_provider: str | None = None,
) -> dict[str, Any]:
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

            logger.info(
                "=== Outline stage completed for comic_id=%s job_id=%s ===",
                comic_id,
                job_id,
            )
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


def process_shot_stage(
    comic_id: int,
    *,
    text_provider: str | None = None,
) -> dict[str, Any]:
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

            outline_sections = (
                ComicOutlineSection.query.filter_by(comic_id=comic_id)
                .order_by(ComicOutlineSection.order_index)
                .all()
            )

            script_data = _load_script_payload(script)
            sections_data = _build_outline_sections(script_data)
            if not outline_sections:
                if not sections_data:
                    raise ValueError(
                        "Story outline is empty; add more content before generating panels."
                    )

                for idx, section_payload in enumerate(sections_data, start=1):
                    outline = ComicOutlineSection(
                        comic_id=comic_id,
                        order_index=idx,
                        title=section_payload.get("title"),
                        summary=section_payload.get("summary") or "",
                        status="draft",
                    )
                    db.session.add(outline)
                    outline_sections.append(outline)
            else:
                for idx, outline in enumerate(outline_sections, start=1):
                    outline.order_index = idx
                    if not outline.title:
                        fallback = sections_data[idx - 1] if idx <= len(sections_data) else {}
                        outline.title = fallback.get("title") or f"Section {idx}"
                    if outline.summary is None:
                        fallback = sections_data[idx - 1] if idx <= len(sections_data) else {}
                        outline.summary = fallback.get("summary") or ""

            for idx, outline in enumerate(outline_sections, start=1):
                outline.order_index = idx
                if not outline.status:
                    outline.status = "draft"

            db.session.flush()
            outline_sections = (
                ComicOutlineSection.query.filter_by(comic_id=comic_id)
                .order_by(ComicOutlineSection.order_index)
                .all()
            )

            existing_panels = (
                ComicPanelShot.query.filter_by(comic_id=comic_id)
                .order_by(ComicPanelShot.sequence_index)
                .all()
            )

            orphaned_ids = [panel.id for panel in existing_panels if panel.page_number is None]
            if orphaned_ids:
                ComicPagePanel.query.filter(
                    ComicPagePanel.panel_shot_id.in_(orphaned_ids)
                ).delete(synchronize_session=False)
                ComicPanelShot.query.filter(ComicPanelShot.id.in_(orphaned_ids)).delete(
                    synchronize_session=False
                )
                db.session.flush()
                existing_panels = (
                    ComicPanelShot.query.filter_by(comic_id=comic_id)
                    .order_by(ComicPanelShot.sequence_index)
                    .all()
                )

            total_sections = len(outline_sections)
            excess_ids = [
                panel.id for panel in existing_panels if panel.sequence_index > total_sections
            ]
            if excess_ids:
                ComicPagePanel.query.filter(
                    ComicPagePanel.panel_shot_id.in_(excess_ids)
                ).delete(synchronize_session=False)
                ComicPanelShot.query.filter(ComicPanelShot.id.in_(excess_ids)).delete(
                    synchronize_session=False
                )
                db.session.flush()
                existing_panels = (
                    ComicPanelShot.query.filter_by(comic_id=comic_id)
                    .order_by(ComicPanelShot.sequence_index)
                    .all()
                )

            panel_map = {panel.sequence_index: panel for panel in existing_panels}
            layout_by_page: dict[int, ComicPageLayout] = {
                layout.page_number: layout
                for layout in ComicPageLayout.query.filter_by(comic_id=comic_id)
                .order_by(ComicPageLayout.page_number)
                .all()
            }

            created_panels: list[ComicPanelShot] = []
            updated_panels: list[ComicPanelShot] = []
            layouts_created: list[ComicPageLayout] = []
            layouts_updated: list[ComicPageLayout] = []
            page_panel_map: defaultdict[int, list[ComicPanelShot]] = defaultdict(list)

            shot_context = _build_shot_split_context(comic, script_data, outline_sections)
            shot_drafts, shot_metadata = resolve_shot_drafts(
                shot_context,
                panels_per_page=PANELS_PER_PAGE,
                text_provider=text_provider,
            )
            logger.info(
                "Generation skills task_type=shot_split skills=%s "
                "prompt_optimizer_enabled=%s text_model_call_count=%s "
                "panel_count=%s skipped_skills=%s",
                ",".join(shot_metadata.get("applied_skills", [])),
                shot_metadata.get("prompt_optimizer_enabled", False),
                shot_metadata.get("text_model_call_count", 0),
                shot_metadata.get("panel_count", 0),
                ",".join(shot_metadata.get("skipped_skills", [])),
            )

            for draft in shot_drafts:
                idx = draft.sequence_index
                section = outline_sections[idx - 1]
                description = draft.description
                dialogue_text = draft.dialogue
                camera_notes = draft.camera_notes
                style_notes = draft.style_notes
                page_number = draft.page_number
                panel_number = draft.panel_number

                panel = panel_map.get(idx)
                if panel:
                    panel.description = description or section.summary or ""
                    panel.dialogue = dialogue_text
                    panel.camera_notes = camera_notes
                    panel.style_notes = style_notes
                    panel.page_number = page_number
                    panel.panel_number = panel_number
                    panel.outline_section_id = section.id
                    if panel.status != "draft":
                        panel.status = "draft"
                    updated_panels.append(panel)
                else:
                    panel = ComicPanelShot(
                        comic_id=comic_id,
                        outline_section_id=section.id,
                        sequence_index=idx,
                        description=description or section.summary or "",
                        dialogue=dialogue_text,
                        camera_notes=camera_notes,
                        style_notes=style_notes,
                        status="draft",
                    )
                    panel.page_number = page_number
                    panel.panel_number = panel_number
                    db.session.add(panel)
                    created_panels.append(panel)
                    panel_map[idx] = panel

                page_panel_map[page_number].append(panel)

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
                    layouts_created.append(layout)
                else:
                    if layout not in layouts_updated:
                        layouts_updated.append(layout)

            db.session.flush()

            touched_pages = set(page_panel_map.keys())
            for page_number, layout in list(layout_by_page.items()):
                if page_number not in touched_pages:
                    ComicPagePanel.query.filter_by(page_layout_id=layout.id).delete(
                        synchronize_session=False
                    )
                    db.session.delete(layout)
                    layout_by_page.pop(page_number)

            for page_number, panels_for_page in page_panel_map.items():
                layout = layout_by_page[page_number]
                ComicPagePanel.query.filter_by(page_layout_id=layout.id).delete(
                    synchronize_session=False
                )
                panels_for_page.sort(key=lambda item: item.panel_number or item.sequence_index)
                for panel in panels_for_page:
                    assignment = ComicPagePanel(
                        page_layout_id=layout.id,
                        panel_shot_id=panel.id,
                        position=panel.panel_number,
                    )
                    db.session.add(assignment)

            db.session.flush()
            _set_stage_status(comic, "shots", "completed")
            db.session.commit()

            all_panels = (
                ComicPanelShot.query.filter_by(comic_id=comic_id)
                .order_by(ComicPanelShot.sequence_index)
                .all()
            )

            logger.info(
                "=== Shot refinement completed for comic_id=%s job_id=%s ===",
                comic_id,
                job_id,
            )
            return {
                "status": "completed",
                "comic_id": comic_id,
                "panel_shots": [panel.to_dict() for panel in created_panels],
                "updated_panel_shots": [panel.to_dict() for panel in updated_panels],
                "all_panel_shots": [panel.to_dict() for panel in all_panels],
                "page_layouts": [layout.to_dict() for layout in layouts_created],
                "updated_page_layouts": [layout.to_dict() for layout in layouts_updated],
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
    image_provider: str | None = None,
    text_provider: str | None = None,
    chain_remaining: bool = False,
    font_family: str | None = None,
    font_size: str | None = None,
    bubble_shape: str | None = None,
    bubble_tail: bool | None = None,
    color_mode: str | None = None,
    aspect_ratio: str | None = None,
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

            script_color = script_data.get("color_mode")
            effective_color = color_mode if color_mode is not None else script_color
            normalized_color = DEFAULT_COLOR_MODES[0]
            if isinstance(effective_color, str) and effective_color.strip():
                candidate = effective_color.replace("_", "-").strip().lower()
                if candidate in DEFAULT_COLOR_MODES:
                    normalized_color = candidate

            script_ratio = script_data.get("aspect_ratio")
            try:
                normalized_aspect_ratio = validate_aspect_ratio(
                    aspect_ratio or script_ratio or comic.aspect_ratio or DEFAULT_ASPECT_RATIO
                )
            except ValueError:
                normalized_aspect_ratio = DEFAULT_ASPECT_RATIO

            layout_instruction = LAYOUT_INSTRUCTIONS.get(
                layout.layout_key,
                LAYOUT_INSTRUCTIONS["auto-grid"],
            )

            previous_panels = (
                ComicPanelShot.query.filter(
                    ComicPanelShot.comic_id == comic_id,
                    ComicPanelShot.page_number.isnot(None),
                    ComicPanelShot.page_number < page_number,
                )
                .order_by(ComicPanelShot.page_number, ComicPanelShot.panel_number)
                .all()
            )
            previous_context_lines = _panel_summary_lines(previous_panels)

            ref_lines, ref_parts = _collect_character_image_references(comic)
            page_context = build_page_generation_context(
                comic=comic,
                script_data=script_data,
                page_number=page_number,
                layout_key=layout.layout_key,
                layout_instruction=layout_instruction,
                layout_notes=layout.notes,
                panels=panels,
                color_mode=normalized_color,
                aspect_ratio=normalized_aspect_ratio,
                reference_notes=ref_lines,
                previous_context_lines=previous_context_lines,
                text_options={
                    "font_family": font_family,
                    "font_size": font_size,
                    "bubble_shape": bubble_shape,
                    "bubble_tail": bubble_tail,
                },
            )
            prompt, prompt_metadata = render_page_prompt(page_context)
            optimization = optimize_text_if_enabled(
                scope="page_render",
                source_text=prompt,
                metadata=prompt_metadata,
                required_phrases=tuple(
                    f"Panel {panel.panel_number or panel.sequence_index}" for panel in panels
                ),
                provider_factory=(
                    (lambda: get_text_provider(text_provider))
                    if text_provider
                    else None
                ),
            )
            prompt = optimization.text
            logger.info(
                "Generation skills task_type=page_render skills=%s "
                "prompt_optimizer_enabled=%s text_model_call_count=%s "
                "visual_mode=%s dialogue_mode=%s skipped_skills=%s",
                ",".join(prompt_metadata.get("applied_skills", [])),
                optimization.enabled,
                1 if optimization.called else 0,
                prompt_metadata.get("visual_mode"),
                prompt_metadata.get("dialogue_mode"),
                ",".join(prompt_metadata.get("skipped_skills", [])),
            )

            img_data = get_image_provider(image_provider).generate_image(
                prompt, ref_parts, normalized_aspect_ratio
            )

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
                                image_provider=image_provider,
                                text_provider=text_provider,
                                chain_remaining=True,
                                color_mode=normalized_color,
                                aspect_ratio=normalized_aspect_ratio,
                                job_timeout=timeout,
                                result_ttl=result_ttl,
                                description=(
                                    f"Render page {next_panel.page_number} "
                                    f"for comic {comic_id}"
                                ),
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
            with suppress(Exception):
                image.close()

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

            image_payload: list[tuple[int, bytes]] = []
            if comic.cover_image_url:
                cover_bytes = storage.download_file(comic.cover_image_url)
                if cover_bytes:
                    logger.info(
                        "Including cover image in export for comic_id=%s job_id=%s",
                        comic_id,
                        job_id,
                    )
                    image_payload.append((0, cover_bytes))
                else:
                    logger.warning(
                        "Cover image unavailable for comic_id=%s url=%s",
                        comic_id,
                        comic.cover_image_url,
                    )

            page_payload = _load_page_images(storage, pages)
            image_payload.extend(page_payload)
            image_payload.sort(key=lambda item: item[0])

            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                for page_number, data in image_payload:
                    if page_number == 0:
                        archive_name = "cover.png"
                    else:
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

            logger.info(
                "=== Export stage completed for comic_id=%s job_id=%s ===",
                comic_id,
                job_id,
            )
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
            summary_prompt = (
                "You are a manga editor distilling a finished comic into a single "
                "evocative cover brief.\n"
                f"Title: {comic.title}\n"
                f"Target art style: {comic.style_description}\n"
                "Describe the central conflict, mood, and key characters in under 80 words.\n"
                "Emphasise imagery that would inspire a striking manga cover illustration.\n\n"
                "Story outline:\n"
                + "\n".join(_panel_summary_lines(panels))
            )

            summary_text = get_text_provider().generate_text(summary_prompt)
            if not summary_text:
                raise ValueError("Summary was empty")

            try:
                cover_aspect_ratio = validate_aspect_ratio(
                    comic.aspect_ratio or DEFAULT_ASPECT_RATIO
                )
            except ValueError:
                cover_aspect_ratio = DEFAULT_ASPECT_RATIO

            cover_prompt = (
                f"Design a finished manga cover for '{comic.title}'.\n"
                f"Narrative summary: {summary_text}\n"
                f"Visual direction: {comic.style_description}.\n"
                "Focus on the lead characters in a dramatic composition with space "
                "for title typography at the top."
            )

            img_data = get_image_provider().generate_image(cover_prompt, None, cover_aspect_ratio)
            if not img_data:
                raise ValueError("No cover image data returned")

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

            logger.info(
                "=== Cover generation completed for comic_id=%s job_id=%s ===",
                comic_id,
                job_id,
            )
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

            logger.info(
                "=== Publish finalisation completed for comic_id=%s job_id=%s ===",
                comic_id,
                job_id,
            )
            return {
                "status": "completed",
                "comic_id": comic_id,
                "is_public": comic.is_public,
                "published_at": (
                    comic.published_at.isoformat() if comic.published_at else None
                ),
            }
        except Exception as exc:
            logger.exception(
                "Publish finalisation failed for comic_id=%s job_id=%s",
                comic_id,
                job_id,
            )
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
    image_provider: str | None = None,
) -> dict[str, Any]:
    """Generate a character concept illustration using the selected image provider."""
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

        prompt_description = (
            description or character.optimized_description or character.description or ""
        ).strip()
        if not prompt_description:
            raise ValueError("Character description is empty")
        image_refs = list(reference_images or [])

        try:
            character.image_status = "processing"
            character.image_error = None
            db.session.commit()

            prompt = (
                "Create a polished character concept illustration based on the description below. "
                "Incorporate notable traits and align with the provided reference imagery. "
                "Return a single high-resolution manga/anime style portrait.\n\n"
                f"Character description:\n{prompt_description}"
            )

            ref_image_parts: list[dict] = []
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
                ref_image_parts.append(
                    {"inline_data": {"mime_type": mime_type, "data": image_bytes}}
                )

            logger.info(
                "Submitting character image prompt job_id=%s character_id=%s reference_count=%s",
                job_id,
                character_id,
                len(ref_image_parts),
            )

            img_data = get_image_provider(image_provider).generate_image(
                prompt, ref_image_parts, DEFAULT_ASPECT_RATIO
            )
            if not img_data:
                raise ValueError("Image generation did not return image data")

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
