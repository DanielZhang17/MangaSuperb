"""Asynchronous job management endpoints."""
from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from rq import Worker
from rq.job import Job
from sqlalchemy import or_

from mangasuperb.extensions import db
from mangasuperb.routes._character_utils import (
    apply_character_assignments,
    build_character_script_payload,
    resolve_character_assignments,
)
from mangasuperb.services.generation import (
    DEFAULT_COMIC_STYLE,
    generate_script_from_prompt,
    validate_aspect_ratio,
)
from mangasuperb.services.jobs import (
    build_character_prompt,
    enqueue_comic_workflow,
    enqueue_page_render,
    enqueue_story_optimization,
    process_character_optimization,
)
from models import Character, Comic, ComicWorkflowStage, Script
from swagger import JOB_CREATE_DOC, JOB_STATUS_DOC

logger = logging.getLogger(__name__)

bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")

JOB_TYPE_COMIC_GENERATION = "comic_generation"
JOB_TYPE_STORY_OPTIMIZATION = "story_optimization"
JOB_TYPE_CHARACTER_OPTIMIZATION = "character_optimization"
JOB_TYPE_PAGE_RENDER = "page_render"


def _require_queue():
    queue = current_app.extensions.get("rq_queue")
    if not queue:
        raise RuntimeError("Background queue is not configured")
    _log_queue_snapshot(queue, "queue_required")
    return queue


def _log_queue_snapshot(queue, context: str) -> None:
    """Log current queue depth, registries, and workers for observability."""
    try:
        queued = len(queue)
        scheduled = queue.scheduled_job_registry.count
        deferred = queue.deferred_job_registry.count
        failed = queue.failed_job_registry.count
        workers = _queue_worker_snapshot(queue)["workers"]
        logger.info(
            "RQ snapshot (%s) queue=%s queued=%s scheduled=%s deferred=%s failed=%s workers=%s",
            context,
            queue.name,
            queued,
            scheduled,
            deferred,
            failed,
            workers,
        )
    except Exception:  # pragma: no cover - logging safety
        logger.exception("Unable to capture RQ snapshot for context=%s", context)


def _queue_worker_snapshot(queue=None) -> dict[str, object]:
    """Return information about workers attached to the configured queue."""
    queue = queue or current_app.extensions.get("rq_queue")
    if not queue:
        return {"status": "unconfigured", "active": 0, "workers": []}
    try:
        workers = Worker.all(queue.connection)
        attached: list[str] = []
        for worker in workers:
            queue_names = {q.name for q in getattr(worker, "queues", [])}
            if queue.name in queue_names:
                attached.append(worker.name or worker.key)
        status = "active" if attached else "idle"
        return {
            "status": status,
            "active": len(attached),
            "workers": attached,
            "queued": len(queue),
            "deferred": queue.deferred_job_registry.count,
            "scheduled": queue.scheduled_job_registry.count,
            "failed": queue.failed_job_registry.count,
        }
    except Exception as exc:  # pragma: no cover - defensive safety
        logger.error("Failed to collect worker snapshot: %s", exc)
        return {"status": "error", "active": 0, "workers": []}


def _handle_comic_generation(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return {"error": "Prompt is required"}, 400

    requested_style = (data.get("style") or data.get("style_description") or "").strip()
    aspect_ratio = data.get("aspect_ratio")

    try:
        character_assignments = resolve_character_assignments(data)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    prompt_payload = prompt
    roster_prompt = build_character_prompt(character_assignments)
    if roster_prompt:
        prompt_payload = f"{prompt}\n\n{roster_prompt}"

    logger.info(
        "Comic generation request by user_id=%s characters=%s",
        current_user.id,
        len(character_assignments),
    )

    try:
        manga_script = generate_script_from_prompt(prompt_payload)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    script_title = manga_script.get("title") or "Untitled"
    style_notes = requested_style or manga_script.get("style_notes") or DEFAULT_COMIC_STYLE

    try:
        resolved_aspect_ratio = validate_aspect_ratio(aspect_ratio)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    if character_assignments:
        manga_script["characters"] = build_character_script_payload(character_assignments)

    try:
        script = Script(
            user_id=current_user.id,
            title=script_title,
            content=json.dumps(manga_script),
        )
        comic = Comic(
            user_id=current_user.id,
            script=script,
            title=script_title,
            status="pending",
            style_description=style_notes,
            aspect_ratio=resolved_aspect_ratio,
        )
        db.session.add_all([script, comic])
        db.session.flush()
        if character_assignments:
            apply_character_assignments(comic, character_assignments)

        queue = _require_queue()
        pipeline_jobs = enqueue_comic_workflow(queue, comic)
        job_id = pipeline_jobs["render_job_id"]
        db.session.refresh(comic)
        db.session.refresh(script)
        _log_queue_snapshot(queue, "comic_generation_enqueued")

        logger.info("Comic generation enqueued job_id=%s for comic_id=%s", job_id, comic.id)
        return (
            {
                "job_id": job_id,
                "comic_id": comic.id,
                "script_id": script.id,
                "status": "pending",
                "script": manga_script,
                "stage_jobs": pipeline_jobs,
            },
            201,
        )
    except RuntimeError as exc:
        logger.error("Comic generation queue unavailable: %s", exc)
        db.session.rollback()
        return {"error": "Background queue is not configured"}, 503
    except Exception:  # pragma: no cover - unexpected database/queue error
        db.session.rollback()
        logger.exception("Failed to create comic generation job")
        return {"error": "Failed to create comic generation job"}, 500


def _handle_story_optimization(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    comic_id = data.get("comic_id")
    if comic_id is None:
        return {"error": "comic_id is required"}, 400

    try:
        comic_id = int(comic_id)
    except (TypeError, ValueError):
        return {"error": "comic_id must be an integer"}, 400

    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return {"error": "Comic not found"}, 404

    try:
        queue = _require_queue()
        stage_jobs = enqueue_story_optimization(queue, comic)
        db.session.refresh(comic)
        _log_queue_snapshot(queue, "story_optimization_enqueued")
        return {"stage_jobs": stage_jobs, "comic": comic.to_dict()}, 202
    except RuntimeError as exc:
        logger.error("Story optimisation queue unavailable: %s", exc)
        return {"error": "Background queue is not configured"}, 503
    except Exception:  # pragma: no cover - unexpected queue error
        logger.exception("Failed to enqueue story optimisation for comic_id=%s", comic_id)
        return {"error": "Failed to enqueue story optimisation"}, 500


def _handle_character_optimization(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    character_id = data.get("character_id")
    if character_id is None:
        return {"error": "character_id is required"}, 400

    try:
        character_id = int(character_id)
    except (TypeError, ValueError):
        return {"error": "character_id must be an integer"}, 400

    character = db.session.get(Character, character_id)
    if not character or character.user_id != current_user.id:
        return {"error": "Character not found"}, 404

    description_override = (data.get("description") or "").strip() or None

    try:
        queue = _require_queue()
        job = queue.enqueue(
            process_character_optimization,
            character_id=character.id,
            source_description=description_override,
            job_timeout=current_app.config["RQ_JOB_TIMEOUT"],
            result_ttl=current_app.config["RQ_RESULT_TTL"],
            description=f"Character optimisation for {character.id}",
        )
        character.optimization_job_id = job.id
        db.session.commit()
        _log_queue_snapshot(queue, "character_optimization_enqueued")
        return {"job_id": job.id, "character_id": character.id}, 202
    except RuntimeError as exc:
        logger.error("Character optimisation queue unavailable: %s", exc)
        return {"error": "Background queue is not configured"}, 503
    except Exception:  # pragma: no cover - unexpected queue error
        db.session.rollback()
        logger.exception("Failed to enqueue character optimisation for %s", character_id)
        return {"error": "Failed to enqueue character optimisation"}, 500


def _handle_page_render(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    comic_id = data.get("comic_id")
    page_number = data.get("page_number")
    if comic_id is None or page_number is None:
        return {"error": "comic_id and page_number are required"}, 400

    try:
        comic_id = int(comic_id)
        page_number = int(page_number)
    except (TypeError, ValueError):
        return {"error": "comic_id and page_number must be integers"}, 400

    if page_number <= 0:
        return {"error": "page_number must be greater than zero"}, 400

    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return {"error": "Comic not found"}, 404

    aspect_ratio = None
    if data.get("aspect_ratio") is not None:
        try:
            aspect_ratio = validate_aspect_ratio(data.get("aspect_ratio"))
        except ValueError as exc:
            return {"error": str(exc)}, 400

    try:
        queue = _require_queue()
        job = enqueue_page_render(queue, comic, page_number, aspect_ratio=aspect_ratio)
        db.session.refresh(comic)
        _log_queue_snapshot(queue, "page_render_enqueued")
        return {"job_id": job.id, "comic": comic.to_dict()}, 202
    except RuntimeError as exc:
        logger.error("Page render queue unavailable: %s", exc)
        return {"error": "Background queue is not configured"}, 503
    except Exception:  # pragma: no cover - unexpected queue error
        logger.exception(
            "Failed to enqueue page render for comic=%s page=%s",
            comic_id,
            page_number,
        )
        return {"error": "Failed to enqueue page render"}, 500


JOB_HANDLERS: dict[str, Callable[[dict[str, Any]], tuple[dict[str, Any], int]]] = {
    JOB_TYPE_COMIC_GENERATION: _handle_comic_generation,
    JOB_TYPE_STORY_OPTIMIZATION: _handle_story_optimization,
    JOB_TYPE_CHARACTER_OPTIMIZATION: _handle_character_optimization,
    JOB_TYPE_PAGE_RENDER: _handle_page_render,
}


@bp.post("")
@login_required
@swag_from(JOB_CREATE_DOC)
def create_job() -> Any:
    data = request.get_json(silent=True) or {}
    job_type = (data.get("job_type") or JOB_TYPE_COMIC_GENERATION).strip().lower()
    handler = JOB_HANDLERS.get(job_type)

    if not handler:
        return jsonify({"error": f"Unsupported job_type '{job_type}'"}), 400

    payload, status = handler(data)
    return jsonify(payload), status


@bp.get("/<job_id>")
@login_required
@swag_from(JOB_STATUS_DOC)
def get_job_status(job_id: str) -> Any:
    try:
        comic = Comic.query.filter_by(job_id=job_id, user_id=current_user.id).first()
        if not comic:
            stage_match = (
                db.session.query(ComicWorkflowStage, Comic)
                .join(Comic, ComicWorkflowStage.comic_id == Comic.id)
                .filter(
                    ComicWorkflowStage.job_id == job_id,
                    Comic.user_id == current_user.id,
                )
                .first()
            )
            if stage_match:
                _, comic = stage_match

        character = None
        if not comic:
            character = Character.query.filter(
                Character.user_id == current_user.id,
                or_(
                    Character.image_job_id == job_id,
                    Character.optimization_job_id == job_id,
                ),
            ).first()

        if not comic and not character:
            return jsonify({"error": "Job not found"}), 404

        try:
            job = Job.fetch(job_id, connection=current_app.extensions["redis_conn"])
            rq_status = job.get_status()
        except Exception as exc:
            logger.error("Failed to fetch RQ job: %s", exc)
            rq_status = "unknown"

        worker_snapshot = _queue_worker_snapshot()
        response = {
            "job_id": job_id,
            "rq_status": rq_status,
            "worker_snapshot": worker_snapshot,
        }
        if comic:
            response["comic"] = comic.to_dict()
        if worker_snapshot.get("active", 0) == 0:
            response["warning"] = "No active RQ workers detected; job will remain queued."

        return jsonify(response), 200

    except Exception as exc:  # pragma: no cover - unexpected failure
        logger.error("Error getting job status: %s", exc)
        return jsonify({"error": str(exc)}), 500


@bp.get("/active")
@login_required
def list_active_jobs() -> Any:
    """Return in-flight workflow stages owned by the current user."""
    rows = (
        db.session.query(ComicWorkflowStage, Comic)
        .join(Comic, ComicWorkflowStage.comic_id == Comic.id)
        .filter(Comic.user_id == current_user.id)
        .filter(ComicWorkflowStage.status.in_(("pending", "in_progress")))
        .filter(ComicWorkflowStage.job_id.isnot(None))
        .order_by(ComicWorkflowStage.started_at.asc())
        .all()
    )

    active = [
        {
            "job_id": stage.job_id,
            "comic_id": comic.id,
            "stage": stage.stage,
            "status": stage.status,
            "title": comic.title,
            "started_at": stage.started_at.isoformat() if stage.started_at else None,
        }
        for stage, comic in rows
    ]
    return jsonify({"active": active}), 200
