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
