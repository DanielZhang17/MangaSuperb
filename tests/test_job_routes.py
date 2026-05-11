"""Tests covering /api/jobs endpoint variations."""
from __future__ import annotations

import json
from datetime import datetime
from types import SimpleNamespace

from flask import Flask

from mangasuperb.extensions import db
from mangasuperb.routes import jobs as job_routes
from mangasuperb.services import jobs as job_services
from models import Character, Comic, ComicAutoRun, ComicRenderRun, ComicWorkflowStage, Script, User


def _create_comic(app: Flask, user_id: int) -> Comic:
    script = Script(
        user_id=user_id,
        title="Test",
        content=json.dumps(
            {"title": "Test", "panels": [{"panel_number": 1, "scene": "Test scene"}]}
        ),
    )
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


def test_create_story_optimization_job_passes_text_provider(
    app: Flask,
    auth_client,
    user: SimpleNamespace,
    dummy_queue,
):
    with app.app_context():
        comic = _create_comic(app, user.id)
        comic_id = comic.id

    response = auth_client.post(
        "/api/jobs",
        json={
            "job_type": "story_optimization",
            "comic_id": comic_id,
            "text_provider": "third_party",
        },
    )

    assert response.status_code == 202
    assert dummy_queue.jobs[0].kwargs["text_provider"] == "third_party"
    assert dummy_queue.jobs[1].kwargs["text_provider"] == "third_party"


def test_create_character_optimization_job(
    app: Flask,
    auth_client,
    user: SimpleNamespace,
    dummy_queue,
):
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


def test_character_optimization_job_status_accepts_returned_job_id(
    app: Flask,
    auth_client,
    user: SimpleNamespace,
    monkeypatch,
):
    rq_fetch_calls = _patch_rq_fetch(monkeypatch)
    with app.app_context():
        character = _create_character(app, user.id)
        character.image_job_id = "existing-image-job"
        character.image_status = "failed"
        character.image_error = "previous image error"
        db.session.commit()
        character_id = character.id

    create_response = auth_client.post(
        "/api/jobs",
        json={"job_type": "character_optimization", "character_id": character_id},
    )

    assert create_response.status_code == 202
    create_payload = create_response.get_json()
    job_id = create_payload["job_id"]

    status_response = auth_client.get(f"/api/jobs/{job_id}")

    assert status_response.status_code == 200
    status_payload = status_response.get_json()
    assert rq_fetch_calls == [job_id]
    assert set(status_payload) == {"job_id", "rq_status", "worker_snapshot", "warning"}
    assert status_payload["job_id"] == job_id
    assert status_payload["rq_status"] == "queued"
    with app.app_context():
        persisted = db.session.get(Character, character_id)
        assert persisted.optimization_job_id == job_id
        assert persisted.image_job_id == "existing-image-job"
        assert persisted.image_status == "failed"
        assert persisted.image_error == "previous image error"


def _create_comic_simple(user_id: int, *, title: str = "Test Comic") -> Comic:
    script = Script(
        user_id=user_id,
        title=title,
        content=json.dumps({"title": title, "panels": []}),
    )
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


def _create_auto_run(
    user_id: int,
    *,
    title: str = "Auto Job",
    status: str = "running",
    current_stage: str = "render",
    job_id: str | None = "real-auto-job",
    with_render_run: bool = False,
) -> ComicAutoRun:
    comic = _create_comic_simple(user_id, title=title)
    auto_run = ComicAutoRun.create(
        comic_id=comic.id,
        user_id=user_id,
        story_snapshot="A courier enters a sky city.",
        title_snapshot=title,
        preferences_snapshot={"image_provider": "gemini"},
    )
    auto_run.status = status
    auto_run.current_stage = current_stage
    auto_run.job_id = job_id
    auto_run.started_at = datetime.utcnow()
    if with_render_run:
        render_run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user_id,
            mode="all_pages",
            requested_pages=[1, 2, 3],
        )
        render_run.status = "running"
        render_run.mark_completed_page(1)
        render_run.job_id = "render-job-for-auto"
        db.session.add(render_run)
        db.session.flush()
        auto_run.render_run_id = render_run.id
    db.session.add(auto_run)
    db.session.commit()
    return auto_run


def _patch_rq_fetch(monkeypatch, expected_job_id: str | None = None) -> list[str]:
    calls: list[str] = []

    def fetch(job_id, connection):
        calls.append(job_id)
        if expected_job_id is not None and job_id != expected_job_id:
            raise RuntimeError(f"Unexpected RQ fetch for {job_id}")
        return SimpleNamespace(get_status=lambda: "queued")

    monkeypatch.setattr(
        job_routes.Job,
        "fetch",
        fetch,
    )
    return calls


def _forbid_rq_fetch(monkeypatch) -> list[str]:
    calls: list[str] = []

    def fail_fetch(job_id, connection):
        calls.append(job_id)
        raise RuntimeError(f"Unexpected RQ fetch for {job_id}")

    monkeypatch.setattr(job_routes.Job, "fetch", fail_fetch)
    return calls


def test_active_jobs_returns_only_in_flight_for_current_user(app, auth_client, user):
    with app.app_context():
        owned = _create_comic_simple(user.id, title="Mine")
        _create_stage(owned.id, "render", "in_progress", "job-mine-1")
        _create_stage(owned.id, "shots", "pending", "job-mine-2")
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
    assert job_ids == ["job-mine-1", "job-mine-2"]
    entry = body["active"][0]
    assert entry["comic_id"] == owned_id
    assert entry["stage"] == "render"
    assert entry["title"] == "Mine"
    assert entry["status"] == "in_progress"
    assert entry["started_at"] is not None


def test_active_jobs_includes_character_image_and_optimization_jobs(
    app,
    auth_client,
    user,
    monkeypatch,
):
    rq_fetch_calls = _patch_rq_fetch(monkeypatch)
    with app.app_context():
        character = _create_character(app, user.id)
        character.image_job_id = "character-image-job"
        character.image_status = "processing"
        character.optimization_job_id = "character-optimization-job"

        other = User(
            username="other-character",
            email="other-character@example.com",
            password_hash="x",
        )
        db.session.add(other)
        db.session.commit()
        other_character = _create_character(app, other.id)
        other_character.image_job_id = "other-character-image-job"
        other_character.image_status = "processing"
        db.session.commit()
        character_id = character.id

    res = auth_client.get("/api/jobs/active")

    assert res.status_code == 200
    active = res.get_json()["active"]
    by_job_id = {entry["job_id"]: entry for entry in active}
    assert set(by_job_id) == {"character-image-job", "character-optimization-job"}
    assert rq_fetch_calls == ["character-optimization-job"]
    assert by_job_id["character-image-job"] == {
        "job_id": "character-image-job",
        "kind": "character_image",
        "character_id": character_id,
        "stage": "character_image",
        "status": "processing",
        "title": "Nova",
        "started_at": by_job_id["character-image-job"]["started_at"],
    }
    assert by_job_id["character-image-job"]["started_at"] is not None
    assert by_job_id["character-optimization-job"]["kind"] == "character_optimization"
    assert by_job_id["character-optimization-job"]["character_id"] == character_id
    assert by_job_id["character-optimization-job"]["status"] == "queued"


def test_active_jobs_handles_orphan_when_comic_deleted(app, auth_client, user):
    with app.app_context():
        comic = _create_comic_simple(user.id, title="Soon-Gone")
        _create_stage(comic.id, "render", "in_progress", "job-orphan")
        db.session.delete(comic)
        db.session.commit()

    res = auth_client.get("/api/jobs/active")
    assert res.status_code == 200
    assert res.get_json()["active"] == []


def test_active_jobs_includes_current_users_active_auto_runs(
    app,
    auth_client,
    user,
):
    with app.app_context():
        auto_run = _create_auto_run(
            user.id,
            title="Auto Adventure",
            status="running",
            current_stage="render",
            job_id="auto-real-job",
            with_render_run=True,
        )
        other = User(username="auto-other", email="auto-other@example.com", password_hash="x")
        db.session.add(other)
        db.session.commit()
        _create_auto_run(
            other.id,
            title="Private Auto",
            status="running",
            current_stage="render",
            job_id="other-auto-job",
            with_render_run=True,
        )
        auto_run_id = auto_run.id
        comic_id = auto_run.comic_id
        started_at = auto_run.started_at.isoformat()
        _create_stage(comic_id, "render", "in_progress", "render-job-for-auto")

    response = auth_client.get("/api/jobs/active")

    assert response.status_code == 200
    active = response.get_json()["active"]
    assert "render-job-for-auto" not in {entry["job_id"] for entry in active}
    auto_entries = [entry for entry in active if entry.get("kind") == "auto_run"]
    assert len(auto_entries) == 1
    entry = auto_entries[0]
    assert entry["job_id"] == "auto-real-job"
    assert entry["kind"] == "auto_run"
    assert entry["auto_run_id"] == auto_run_id
    assert entry["auto_run"]["id"] == auto_run_id
    assert entry["comic_id"] == comic_id
    assert entry["stage"] == "render"
    assert entry["status"] == "running"
    assert entry["title"] == "Auto Adventure"
    assert entry["started_at"] == started_at
    assert entry["render_progress"] == {
        "completed": 1,
        "failed": 0,
        "total": 3,
        "current_page_number": None,
    }


def test_job_status_requires_login(client):
    response = client.get("/api/jobs/job-secret")
    assert response.status_code == 401
    assert response.get_json()["error"] == "Authentication required"


def test_job_status_does_not_expose_other_users_comic(app, auth_client, monkeypatch):
    rq_fetch_calls = _forbid_rq_fetch(monkeypatch)
    with app.app_context():
        other = User(username="job-owner", email="job-owner@example.com", password_hash="x")
        db.session.add(other)
        db.session.commit()

        comic = _create_comic_simple(other.id, title="Private Job")
        comic.job_id = "job-secret"
        db.session.commit()

    response = auth_client.get("/api/jobs/job-secret")

    assert rq_fetch_calls == []
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload


def test_job_status_does_not_expose_other_users_stage_job(app, auth_client, monkeypatch):
    rq_fetch_calls = _forbid_rq_fetch(monkeypatch)
    with app.app_context():
        other = User(
            username="stage-owner",
            email="stage-owner@example.com",
            password_hash="x",
        )
        db.session.add(other)
        db.session.commit()
        comic = _create_comic_simple(other.id, title="Private Stage Job")
        _create_stage(comic.id, "render", "in_progress", "stage-secret")

    response = auth_client.get("/api/jobs/stage-secret")

    assert rq_fetch_calls == []
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload


def test_job_status_does_not_expose_other_users_character_job(app, auth_client, monkeypatch):
    rq_fetch_calls = _forbid_rq_fetch(monkeypatch)
    with app.app_context():
        other = User(
            username="character-owner",
            email="character-owner@example.com",
            password_hash="x",
        )
        db.session.add(other)
        db.session.commit()
        character = _create_character(app, other.id)
        character.image_job_id = "character-secret"
        db.session.commit()

    response = auth_client.get("/api/jobs/character-secret")

    assert rq_fetch_calls == []
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload


def test_job_status_does_not_expose_other_users_character_optimization_job(
    app,
    auth_client,
    monkeypatch,
):
    rq_fetch_calls = _forbid_rq_fetch(monkeypatch)
    with app.app_context():
        other = User(
            username="character-optimizer",
            email="character-optimizer@example.com",
            password_hash="x",
        )
        db.session.add(other)
        db.session.commit()
        character = _create_character(app, other.id)
        character.optimization_job_id = "optimization-secret"
        db.session.commit()

    response = auth_client.get("/api/jobs/optimization-secret")

    assert rq_fetch_calls == []
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload


def test_job_status_unknown_job_returns_404_without_worker_snapshot(auth_client, monkeypatch):
    rq_fetch_calls = _forbid_rq_fetch(monkeypatch)

    response = auth_client.get("/api/jobs/not-owned-or-known")

    assert rq_fetch_calls == []
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload


def test_job_status_returns_owned_auto_run_by_synthetic_id(
    app,
    auth_client,
    user,
    monkeypatch,
):
    rq_fetch_calls = _forbid_rq_fetch(monkeypatch)
    with app.app_context():
        auto_run = _create_auto_run(
            user.id,
            title="Synthetic Auto",
            status="running",
            current_stage="characters",
            job_id="real-synthetic-auto-job",
        )
        auto_run_id = auto_run.id
        comic_id = auto_run.comic_id

    response = auth_client.get(f"/api/jobs/auto-run-{auto_run_id}")

    assert response.status_code == 200
    payload = response.get_json()
    assert rq_fetch_calls == []
    assert payload["job_id"] == f"auto-run-{auto_run_id}"
    assert payload["rq_status"] == "running"
    assert payload["auto_run"]["id"] == auto_run_id
    assert payload["auto_run"]["current_stage"] == "characters"
    assert payload["comic"]["id"] == comic_id


def test_job_status_returns_owned_auto_run_by_real_job_id(
    app,
    auth_client,
    user,
    monkeypatch,
):
    rq_fetch_calls = _patch_rq_fetch(monkeypatch, "owned-real-auto-job")
    with app.app_context():
        auto_run = _create_auto_run(
            user.id,
            title="Real Auto",
            status="queued",
            current_stage="story",
            job_id="owned-real-auto-job",
        )
        auto_run_id = auto_run.id
        comic_id = auto_run.comic_id

    response = auth_client.get("/api/jobs/owned-real-auto-job")

    assert response.status_code == 200
    payload = response.get_json()
    assert rq_fetch_calls == ["owned-real-auto-job"]
    assert payload["job_id"] == "owned-real-auto-job"
    assert payload["rq_status"] == "queued"
    assert payload["auto_run"]["id"] == auto_run_id
    assert payload["comic"]["id"] == comic_id


def test_job_status_returns_owned_comic_job(app, auth_client, user, monkeypatch):
    rq_fetch_calls = _patch_rq_fetch(monkeypatch, "owned-comic-job")
    with app.app_context():
        comic = _create_comic_simple(user.id, title="Owned Comic Job")
        comic.job_id = "owned-comic-job"
        db.session.commit()
        comic_id = comic.id

    response = auth_client.get("/api/jobs/owned-comic-job")

    assert response.status_code == 200
    payload = response.get_json()
    assert rq_fetch_calls == ["owned-comic-job"]
    assert payload["job_id"] == "owned-comic-job"
    assert payload["rq_status"] == "queued"
    assert "worker_snapshot" in payload
    assert payload["comic"]["id"] == comic_id


def test_job_status_returns_owned_stage_job(app, auth_client, user, monkeypatch):
    rq_fetch_calls = _patch_rq_fetch(monkeypatch, "owned-stage-job")
    with app.app_context():
        comic = _create_comic_simple(user.id, title="Owned Stage Job")
        _create_stage(comic.id, "render", "in_progress", "owned-stage-job")
        comic_id = comic.id

    response = auth_client.get("/api/jobs/owned-stage-job")

    assert response.status_code == 200
    payload = response.get_json()
    assert rq_fetch_calls == ["owned-stage-job"]
    assert payload["job_id"] == "owned-stage-job"
    assert payload["rq_status"] == "queued"
    assert "worker_snapshot" in payload
    assert payload["comic"]["id"] == comic_id


def test_job_status_returns_owned_character_image_job(app, auth_client, user, monkeypatch):
    rq_fetch_calls = _patch_rq_fetch(monkeypatch, "owned-character-image-job")
    with app.app_context():
        character = _create_character(app, user.id)
        character.image_job_id = "owned-character-image-job"
        db.session.commit()

    response = auth_client.get("/api/jobs/owned-character-image-job")

    assert response.status_code == 200
    payload = response.get_json()
    assert rq_fetch_calls == ["owned-character-image-job"]
    assert set(payload) == {"job_id", "rq_status", "worker_snapshot", "warning"}
    assert payload["job_id"] == "owned-character-image-job"
    assert payload["rq_status"] == "queued"
