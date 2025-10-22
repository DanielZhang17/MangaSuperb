"""Asynchronous job management endpoints."""
from __future__ import annotations

import json
import logging
from typing import Any

from flasgger import swag_from
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from rq.job import Job

from mangasuperb.extensions import db
from mangasuperb.services.generation import (
    DEFAULT_COMIC_STYLE,
    generate_script_from_prompt,
    validate_aspect_ratio,
)
from models import Comic, Script
from swagger import JOB_CREATE_DOC, JOB_STATUS_DOC

logger = logging.getLogger(__name__)

bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")


@bp.post("")
@login_required
@swag_from(JOB_CREATE_DOC)
def create_job() -> Any:
    try:
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt", "").strip()
        model_name = data.get("model", current_app.config["GEMINI_SCRIPT_MODEL"])
        api_key = data.get("api_key", "").strip()
        requested_style = (data.get("style") or data.get("style_description") or "").strip()
        aspect_ratio = data.get("aspect_ratio")

        logger.info("=== New job request ===")
        logger.info("User: %s", current_user.username)
        logger.info("Prompt length: %s characters", len(prompt))
        logger.info("Model: %s", model_name)

        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400
        if not api_key:
            return jsonify({"error": "API key is required"}), 400

        manga_script = generate_script_from_prompt(prompt, model_name, api_key)
        logger.info("Script generated: %s", manga_script.get("title", "Untitled"))

        script_title = manga_script.get("title") or "Untitled"
        style_notes = requested_style or manga_script.get("style_notes") or DEFAULT_COMIC_STYLE

        try:
            resolved_aspect_ratio = validate_aspect_ratio(aspect_ratio)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

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

            from mangasuperb.services.jobs import process_manga_generation

            queue = current_app.extensions["rq_queue"]
            job = queue.enqueue(
                process_manga_generation,
                comic_id=comic.id,
                api_key=api_key,
                model_name=model_name,
                job_timeout=current_app.config["RQ_JOB_TIMEOUT"],
                result_ttl=current_app.config["RQ_RESULT_TTL"],
            )

            comic.job_id = job.id
            db.session.commit()

        except Exception as exc:  # pragma: no cover - database/queue errors
            db.session.rollback()
            logger.exception("Failed to persist job resources")
            raise

        logger.info("Job enqueued: %s", job.id)
        logger.info("=== Job created successfully ===")

        return jsonify(
            {
                "job_id": job.id,
                "comic_id": comic.id,
                "script_id": script.id,
                "status": "pending",
                "script": manga_script,
            }
        ), 201

    except ValueError as exc:
        logger.error("Script generation failed: %s", exc)
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover - unexpected failure
        logger.error("Error creating job: %s", exc)
        logger.exception("Full traceback:")
        return jsonify({"error": str(exc)}), 500


@bp.get("/<job_id>")
@swag_from(JOB_STATUS_DOC)
def get_job_status(job_id: str) -> Any:
    try:
        try:
            job = Job.fetch(job_id, connection=current_app.extensions["redis_conn"])
            rq_status = job.get_status()
        except Exception as exc:
            logger.error("Failed to fetch RQ job: %s", exc)
            rq_status = "unknown"

        comic = Comic.query.filter_by(job_id=job_id).first()
        if comic:
            response = {
                "job_id": job_id,
                "rq_status": rq_status,
                "comic": comic.to_dict(),
            }
            return jsonify(response), 200

        return (
            jsonify(
                {
                    "error": "Comic for the requested job was not found",
                    "job_id": job_id,
                    "rq_status": rq_status,
                }
            ),
            404,
        )

    except Exception as exc:  # pragma: no cover - unexpected failure
        logger.error("Error getting job status: %s", exc)
        return jsonify({"error": str(exc)}), 500
