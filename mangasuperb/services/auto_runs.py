"""Service helpers for one-click Auto Mode runs."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from flask import current_app
from sqlalchemy import or_

from mangasuperb.extensions import db
from mangasuperb.routes._character_utils import CharacterAssignment, apply_character_assignments
from mangasuperb.services.ai_provider import get_text_provider
from mangasuperb.services.auto_prep import (
    extract_cast_candidates,
    prepare_characters_from_candidates,
)
from mangasuperb.services.generation import (
    DEFAULT_ASPECT_RATIO,
    DEFAULT_COMIC_STYLE,
    validate_aspect_ratio,
)
from mangasuperb.services.jobs import (
    _application_context,
    bootstrap_comic_workflow,
    enqueue_render_run,
    process_outline_stage,
    process_shot_stage,
)
from models import Character, Comic, ComicAutoRun, ComicRenderRun, Script

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = {"completed", "failed", "aborted"}


class AutoRunConflictError(Exception):
    """Raised when a comic already has an active Auto run."""

    def __init__(self, auto_run: ComicAutoRun) -> None:
        super().__init__("An active Auto run already exists for this comic")
        self.auto_run = auto_run


def get_active_auto_run(user_id: int, comic_id: int | None = None) -> ComicAutoRun | None:
    query = ComicAutoRun.query.filter(
        ComicAutoRun.user_id == user_id,
        ComicAutoRun.status.in_(ComicAutoRun.ACTIVE_STATUSES),
    )
    if comic_id is not None:
        query = query.filter(ComicAutoRun.comic_id == comic_id)
    return query.order_by(ComicAutoRun.created_at.desc(), ComicAutoRun.id.desc()).first()


def get_latest_auto_run(user_id: int, comic_id: int) -> ComicAutoRun | None:
    return (
        ComicAutoRun.query.filter_by(user_id=user_id, comic_id=comic_id)
        .order_by(ComicAutoRun.created_at.desc(), ComicAutoRun.id.desc())
        .first()
    )


def get_auto_run_for_user(user_id: int, auto_run_id: int) -> ComicAutoRun | None:
    return ComicAutoRun.query.filter_by(id=auto_run_id, user_id=user_id).first()


def _clean_text(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field} is required")
    return cleaned


def _normalise_preferences(preferences: dict[str, Any] | None) -> dict[str, Any]:
    if preferences is None:
        return {}
    if not isinstance(preferences, dict):
        raise ValueError("preferences must be an object")
    return dict(preferences)


def _script_payload(
    *,
    title: str,
    story: str,
    style_description: str,
    aspect_ratio: str,
    preferences: dict[str, Any],
) -> dict[str, Any]:
    payload = {
        "title": title,
        "story": story,
        "style_description": style_description,
        "style_notes": style_description,
        "aspect_ratio": aspect_ratio,
    }
    color_mode = preferences.get("color_mode")
    if isinstance(color_mode, str) and color_mode.strip():
        payload["color_mode"] = color_mode.strip()
    return payload


def create_auto_run(
    *,
    user_id: int,
    title: str,
    story: str,
    comic_id: int | None = None,
    preferences: dict[str, Any] | None = None,
) -> tuple[ComicAutoRun, Comic]:
    """Create an Auto run and prepare the comic/script snapshot."""

    title = _clean_text(title, "title")
    story = _clean_text(story, "story")
    preferences = _normalise_preferences(preferences)

    comic: Comic | None = None
    if comic_id is not None:
        comic = db.session.get(Comic, int(comic_id))
        if not comic or comic.user_id != user_id:
            raise ValueError("Comic not found")
        existing = get_active_auto_run(user_id, comic.id)
        if existing:
            raise AutoRunConflictError(existing)

    style_description = (
        str(preferences.get("style_description") or preferences.get("style") or "").strip()
        or (comic.style_description if comic else "")
        or DEFAULT_COMIC_STYLE
    )
    aspect_source = preferences.get("aspect_ratio") or (comic.aspect_ratio if comic else None)
    aspect_ratio = validate_aspect_ratio(aspect_source or DEFAULT_ASPECT_RATIO)
    preferences.setdefault("style_description", style_description)
    preferences.pop("style", None)
    preferences.setdefault("aspect_ratio", aspect_ratio)

    if comic is None:
        script = Script(
            user_id=user_id,
            title=title,
            content=json.dumps(
                _script_payload(
                    title=title,
                    story=story,
                    style_description=style_description,
                    aspect_ratio=aspect_ratio,
                    preferences=preferences,
                ),
                ensure_ascii=False,
            ),
        )
        comic = Comic(
            user_id=user_id,
            script=script,
            title=title,
            status="pending",
            style_description=style_description,
            aspect_ratio=aspect_ratio,
        )
        db.session.add_all([script, comic])
    else:
        script = comic.script
        if script is None:
            raise ValueError("Comic script not found")
        script.title = title
        script.content = json.dumps(
            _script_payload(
                title=title,
                story=story,
                style_description=style_description,
                aspect_ratio=aspect_ratio,
                preferences=preferences,
            ),
            ensure_ascii=False,
        )
        comic.title = title
        comic.status = "pending"
        comic.style_description = style_description
        comic.aspect_ratio = aspect_ratio
        comic.error_message = None
        comic.completed_at = None

    db.session.flush()
    bootstrap_comic_workflow(comic)
    run = ComicAutoRun.create(
        comic_id=comic.id,
        user_id=user_id,
        story_snapshot=story,
        title_snapshot=title,
        preferences_snapshot=preferences,
    )
    db.session.add(run)
    db.session.flush()
    return run, comic


def enqueue_auto_run(queue, run: ComicAutoRun):
    timeout = current_app.config["RQ_JOB_TIMEOUT"]
    result_ttl = current_app.config["RQ_RESULT_TTL"]
    job = queue.enqueue(
        process_auto_run,
        auto_run_id=run.id,
        job_timeout=timeout,
        result_ttl=result_ttl,
        description=f"Auto run {run.id} for comic {run.comic_id}",
    )
    run.job_id = job.id
    db.session.commit()
    return job


def abort_auto_run(run: ComicAutoRun) -> ComicAutoRun:
    run.abort_requested = True
    if run.render_run and run.render_run.status in {"queued", "running"}:
        run.render_run.abort_requested = True
        run.render_run.status = "aborted"
        run.render_run.completed_at = run.render_run.completed_at or datetime.utcnow()
    if run.status in ComicAutoRun.ACTIVE_STATUSES:
        run.status = "aborted"
        run.completed_at = datetime.utcnow()
    db.session.commit()
    return run


def _assignments_from_character_ids(
    *,
    user_id: int,
    selected_character_ids: list[Any] | None,
    character_roles: dict[str, Any] | None = None,
) -> tuple[list[CharacterAssignment], list[int]]:
    if not selected_character_ids:
        raise ValueError("selected_character_ids is required")

    normalized_ids: list[int] = []
    seen: set[int] = set()
    for raw_id in selected_character_ids:
        try:
            character_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("selected_character_ids must contain integers") from exc
        if character_id in seen:
            continue
        seen.add(character_id)
        normalized_ids.append(character_id)

    characters = (
        Character.query.filter(
            Character.id.in_(normalized_ids),
            or_(Character.user_id == user_id, Character.is_public.is_(True)),
        ).all()
    )
    characters_by_id = {character.id: character for character in characters}
    missing = [
        character_id
        for character_id in normalized_ids
        if character_id not in characters_by_id
    ]
    if missing:
        raise ValueError("One or more selected characters were not found")

    roles = character_roles or {}
    assignments: list[CharacterAssignment] = []
    for index, character_id in enumerate(normalized_ids, start=1):
        raw_role = roles.get(str(character_id), roles.get(character_id))
        role = raw_role.strip() if isinstance(raw_role, str) else None
        assignments.append(
            CharacterAssignment(
                character=characters_by_id[character_id],
                order_index=index,
                role=role or None,
            )
        )

    return assignments, normalized_ids


def retry_auto_run(queue, run: ComicAutoRun) -> ComicAutoRun:
    if run.status in {"queued", "running"}:
        raise ValueError("Auto run is already active")

    run.status = "queued"
    run.current_stage = "story"
    run.abort_requested = False
    run.error_message = None
    run.completed_at = None
    run.started_at = None
    run.job_id = None
    run.render_run_id = None
    run.character_review = None
    run.selected_character_ids = []
    db.session.flush()
    enqueue_auto_run(queue, run)
    return run


def resolve_auto_run(
    queue,
    run: ComicAutoRun,
    *,
    selected_character_ids: list[Any] | None,
    character_roles: dict[str, Any] | None = None,
) -> ComicAutoRun:
    if run.status != "needs_review":
        raise ValueError("Auto run does not need review")
    if not run.comic:
        raise ValueError("Comic not found")

    assignments, selected_ids = _assignments_from_character_ids(
        user_id=run.user_id,
        selected_character_ids=selected_character_ids,
        character_roles=character_roles,
    )
    apply_character_assignments(run.comic, assignments)
    run.selected_character_ids = selected_ids
    run.status = "queued"
    run.current_stage = "panels"
    run.abort_requested = False
    run.error_message = None
    run.completed_at = None
    run.started_at = None
    run.job_id = None
    db.session.flush()
    enqueue_auto_run(queue, run)
    return run


def _ensure_not_aborted(run: ComicAutoRun) -> bool:
    db.session.refresh(run)
    if not run.abort_requested:
        return False
    run.status = "aborted"
    run.completed_at = datetime.utcnow()
    db.session.commit()
    return True


def _prepared_character_assignments(
    review: dict[str, Any],
) -> tuple[list[CharacterAssignment], list[int]]:
    assignments: list[CharacterAssignment] = []
    selected_ids: list[int] = []
    entries = [*review.get("reused", []), *review.get("created", [])]
    for index, entry in enumerate(entries, start=1):
        character_payload = entry.get("character") if isinstance(entry, dict) else None
        character_id = character_payload.get("id") if isinstance(character_payload, dict) else None
        if character_id is None:
            continue
        character = db.session.get(Character, int(character_id))
        if not character:
            continue
        selected_ids.append(character.id)
        assignments.append(
            CharacterAssignment(
                character=character,
                order_index=index,
                role=entry.get("role") if isinstance(entry.get("role"), str) else None,
            )
        )
    return assignments, selected_ids


def _mark_failed(auto_run_id: int, error: str) -> dict[str, Any]:
    run = db.session.get(ComicAutoRun, auto_run_id)
    if run:
        run.status = "failed"
        run.error_message = error
        run.completed_at = datetime.utcnow()
        db.session.commit()
    return {"status": "failed", "auto_run_id": auto_run_id, "error": error}


def process_auto_run(auto_run_id: int) -> dict[str, Any]:
    """Run Auto Mode through characters, panels, and all-pages render enqueue."""

    with _application_context():
        run = db.session.get(ComicAutoRun, auto_run_id)
        if not run:
            raise ValueError(f"Auto run {auto_run_id} not found")
        if run.abort_requested:
            abort_auto_run(run)
            return {"status": "aborted", "auto_run_id": auto_run_id}

        try:
            run.status = "running"
            run.started_at = run.started_at or datetime.utcnow()
            run.error_message = None
            db.session.commit()

            comic = db.session.get(Comic, run.comic_id)
            if not comic:
                raise ValueError(f"Comic {run.comic_id} not found")

            preferences = run.preferences_snapshot
            text_provider = preferences.get("text_provider")
            image_provider = preferences.get("image_provider")
            style_preference = preferences.get("style_description") or comic.style_description

            skip_character_stage = (
                run.current_stage in {"panels", "render"}
                and bool(run.selected_character_ids)
            )
            if not skip_character_stage:
                run.current_stage = "characters"
                db.session.commit()
                candidates = extract_cast_candidates(
                    run.story_snapshot,
                    text_provider=get_text_provider(text_provider),
                    style_preference=style_preference,
                )
                review = prepare_characters_from_candidates(
                    user_id=run.user_id,
                    candidates=candidates,
                    image_provider=image_provider,
                )
                run.character_review = review
                if review.get("conflicts") or review.get("failed"):
                    run.status = "needs_review"
                    db.session.commit()
                    return {"status": "needs_review", "auto_run_id": run.id, "review": review}

                assignments, selected_ids = _prepared_character_assignments(review)
                run.selected_character_ids = selected_ids
                if assignments:
                    apply_character_assignments(comic, assignments)
                if _ensure_not_aborted(run):
                    return {"status": "aborted", "auto_run_id": run.id}

            run.current_stage = "panels"
            db.session.commit()
            outline_result = process_outline_stage(comic.id, text_provider=text_provider)
            if outline_result.get("status") == "failed":
                raise ValueError(outline_result.get("error") or "Outline stage failed")
            if _ensure_not_aborted(run):
                return {"status": "aborted", "auto_run_id": run.id}

            shot_result = process_shot_stage(comic.id, text_provider=text_provider)
            if shot_result.get("status") == "failed":
                raise ValueError(shot_result.get("error") or "Panel stage failed")
            if _ensure_not_aborted(run):
                return {"status": "aborted", "auto_run_id": run.id}

            queue = current_app.extensions.get("rq_queue")
            if not queue:
                raise RuntimeError("Background queue is not configured")

            run.current_stage = "render"
            db.session.commit()
            render_run = enqueue_render_run(
                queue,
                comic,
                mode="all_pages",
                user_id=run.user_id,
                image_provider=image_provider,
                text_provider=text_provider,
                color_mode=preferences.get("color_mode"),
                aspect_ratio=preferences.get("aspect_ratio") or comic.aspect_ratio,
                font_family=preferences.get("font_family"),
                font_size=preferences.get("font_size"),
                bubble_shape=preferences.get("bubble_shape"),
                bubble_tail=preferences.get("bubble_tail"),
            )
            run.render_run_id = render_run.id
            run.status = "running"
            db.session.commit()
            return {
                "status": "running",
                "auto_run_id": run.id,
                "render_run_id": render_run.id,
            }
        except Exception as exc:
            logger.exception("Auto run failed auto_run_id=%s", auto_run_id)
            db.session.rollback()
            return _mark_failed(auto_run_id, str(exc))


def sync_auto_run_from_render_run(render_run: ComicRenderRun) -> list[ComicAutoRun]:
    if render_run.status not in TERMINAL_STATUSES:
        return []

    runs = (
        ComicAutoRun.query.filter(
            ComicAutoRun.render_run_id == render_run.id,
            ComicAutoRun.status.in_(ComicAutoRun.ACTIVE_STATUSES),
        )
        .order_by(ComicAutoRun.id.asc())
        .all()
    )
    now = datetime.utcnow()
    for run in runs:
        run.status = render_run.status
        run.current_stage = "render"
        run.completed_at = run.completed_at or now
        if render_run.status == "failed":
            run.error_message = render_run.error_message
        if render_run.status == "aborted":
            run.abort_requested = True
    db.session.commit()
    return runs
