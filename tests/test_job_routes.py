"""Tests covering /api/jobs endpoint variations."""
from __future__ import annotations

import json
from types import SimpleNamespace

from flask import Flask

from mangasuperb.extensions import db
from mangasuperb.services import jobs as job_services
from models import Character, Comic, Script, User


def _create_comic(app: Flask, user_id: int) -> Comic:
    script = Script(user_id=user_id, title="Test", content=json.dumps({"title": "Test", "panels": [{"panel_number": 1, "scene": "Test scene"}]}))
    comic = Comic(user_id=user_id, script=script, title="Test")
    db.session.add_all([script, comic])
    db.session.commit()
    return comic


def _create_character(app: Flask, user_id: int) -> Character:
    character = Character(
        user_id=user_id,
        name="Nova",
        description="A wandering hero.",
        sex="unspecified",
        is_public=False,
    )
    db.session.add(character)
    db.session.commit()
    return character


def test_create_job_requires_prompt(auth_client):
    response = auth_client.post("/api/jobs", json={})
    assert response.status_code == 400
    assert response.get_json()["error"] == "Prompt is required"


def test_create_story_optimization_job(app: Flask, auth_client, user: SimpleNamespace, dummy_queue):
    with app.app_context():
        comic = _create_comic(app, user.id)
        comic_id = comic.id

    response = auth_client.post(
        "/api/jobs",
        json={"job_type": "story_optimization", "comic_id": comic_id},
    )
    assert response.status_code == 202
    payload = response.get_json()
    assert "stage_jobs" in payload
    assert len(dummy_queue.jobs) == 2
    assert dummy_queue.jobs[0].func is job_services.process_outline_stage
    assert dummy_queue.jobs[1].func is job_services.process_shot_stage


def test_create_character_optimization_job(app: Flask, auth_client, user: SimpleNamespace, dummy_queue):
    with app.app_context():
        character = _create_character(app, user.id)
        character_id = character.id

    response = auth_client.post(
        "/api/jobs",
        json={"job_type": "character_optimization", "character_id": character_id},
    )
    assert response.status_code == 202
    payload = response.get_json()
    assert payload["character_id"] == character_id
    assert dummy_queue.jobs[-1].func is job_services.process_character_optimization


from datetime import datetime

from models import ComicWorkflowStage, Script


def _create_comic_simple(user_id: int, *, title: str = "Test Comic") -> Comic:
    script = Script(user_id=user_id, title=title, content=json.dumps({"title": title, "panels": []}))
    comic = Comic(
        user_id=user_id,
        script=script,
        title=title,
        status="processing",
        workflow_stage="render",
        workflow_status="in_progress",
    )
    db.session.add_all([script, comic])
    db.session.commit()
    return comic


def _create_stage(comic_id: int, stage: str, status: str, job_id: str | None) -> ComicWorkflowStage:
    row = ComicWorkflowStage(
        comic_id=comic_id,
        stage=stage,
        status=status,
        job_id=job_id,
        started_at=datetime.utcnow(),
    )
    db.session.add(row)
    db.session.commit()
    return row


def test_active_jobs_returns_only_in_flight_for_current_user(app, auth_client, user):
    with app.app_context():
        owned = _create_comic_simple(user.id, title="Mine")
        _create_stage(owned.id, "render", "in_progress", "job-mine-1")
        _create_stage(owned.id, "outline", "completed", "job-mine-old")
        owned_id = owned.id

        other = User(username="other", email="other@example.com", password_hash="x")
        db.session.add(other)
        db.session.commit()
        other_comic = _create_comic_simple(other.id, title="Theirs")
        _create_stage(other_comic.id, "render", "in_progress", "job-theirs-1")

    res = auth_client.get("/api/jobs/active")
    assert res.status_code == 200
    body = res.get_json()
    assert "active" in body
    job_ids = sorted(entry["job_id"] for entry in body["active"])
    assert job_ids == ["job-mine-1"]
    entry = body["active"][0]
    assert entry["comic_id"] == owned_id
    assert entry["stage"] == "render"
    assert entry["title"] == "Mine"
    assert entry["status"] == "in_progress"
    assert entry["started_at"] is not None


def test_active_jobs_handles_orphan_when_comic_deleted(app, auth_client, user):
    with app.app_context():
        comic = _create_comic_simple(user.id, title="Soon-Gone")
        _create_stage(comic.id, "render", "in_progress", "job-orphan")
        db.session.delete(comic)
        db.session.commit()

    res = auth_client.get("/api/jobs/active")
    assert res.status_code == 200
    assert res.get_json()["active"] == []
