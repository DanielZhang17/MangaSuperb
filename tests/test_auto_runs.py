"""Auto run model and API tests."""
from __future__ import annotations

import json
from datetime import datetime
from types import SimpleNamespace
from typing import Any

import pytest

from mangasuperb.extensions import db
from models import Character, Comic, ComicAutoRun, ComicRenderRun, Script, User


def create_comic(user_id: int, title: str = "Auto Draft") -> Comic:
    script = Script(
        user_id=user_id,
        title=title,
        content=json.dumps(
            {
                "story": "A pilot finds a hidden city.",
                "style_description": "Classic manga black and white linework.",
                "aspect_ratio": "16:9",
                "color_mode": "black-white",
            }
        ),
    )
    comic = Comic(
        user_id=user_id,
        script=script,
        title=title,
        status="pending",
        style_description="Classic manga black and white linework.",
        aspect_ratio="16:9",
    )
    db.session.add_all([script, comic])
    db.session.flush()
    return comic


def test_auto_run_serializes_snapshots_and_progress(app: Any, user: Any) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="A pilot finds a hidden city.",
            title_snapshot="Auto Draft",
            preferences_snapshot={
                "image_provider": "gemini",
                "text_provider": "gemini",
                "style_description": "Classic manga black and white linework.",
            },
        )
        run.status = "running"
        run.current_stage = "characters"
        run.character_review = {"reused": [], "created": [], "conflicts": [], "failed": []}
        run.selected_character_ids = [11, 12]
        run.started_at = datetime(2026, 5, 11, 10, 0, 0)
        db.session.add(run)
        db.session.commit()

        payload = run.to_dict()
        comic_id = comic.id
        run_id = run.id

    assert payload["id"] == run_id
    assert payload["comic_id"] == comic_id
    assert payload["user_id"] == user.id
    assert payload["status"] == "running"
    assert payload["current_stage"] == "characters"
    assert payload["story_snapshot"] == "A pilot finds a hidden city."
    assert payload["title_snapshot"] == "Auto Draft"
    assert payload["preferences_snapshot"]["image_provider"] == "gemini"
    assert payload["character_review"]["conflicts"] == []
    assert payload["selected_character_ids"] == [11, 12]
    assert payload["render_progress"] is None
    assert payload["abort_requested"] is False
    assert payload["started_at"].startswith("2026-05-11T10:00:00")


def test_auto_run_json_helpers_tolerate_invalid_json(app: Any, user: Any) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        run = ComicAutoRun(
            comic_id=comic.id,
            user_id=user.id,
            status="queued",
            current_stage="story",
            story_snapshot="Story",
            title_snapshot="Title",
            preferences_snapshot_json="{bad json",
            character_review_json="{bad json",
            selected_character_ids_json="{bad json",
        )
        db.session.add(run)
        db.session.commit()

        payload = run.to_dict()

    assert payload["preferences_snapshot"] == {}
    assert payload["character_review"] is None
    assert payload["selected_character_ids"] == []


def test_auto_run_render_progress_includes_current_page(app: Any, user: Any) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        render_run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2, 3],
        )
        render_run.current_page_number = 2
        render_run.mark_completed_page(1)
        auto_run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Render progress",
            title_snapshot="Auto Draft",
        )
        auto_run.render_run = render_run
        db.session.add_all([render_run, auto_run])
        db.session.commit()

        payload = auto_run.to_dict()

    assert payload["render_progress"] == {
        "completed": 1,
        "failed": 0,
        "total": 3,
        "current_page_number": 2,
    }


def test_create_auto_run_creates_comic_script_and_workflow(app: Any, user: Any) -> None:
    from mangasuperb.services.auto_runs import create_auto_run

    with app.app_context():
        run, comic = create_auto_run(
            user_id=user.id,
            title="Skyline Break",
            story="A courier outruns signal ghosts above the city.",
            preferences={
                "style_description": "Sharp monochrome cyberpunk manga.",
                "aspect_ratio": "16:9",
                "color_mode": "black-white",
                "image_provider": "gemini",
                "text_provider": "third_party",
            },
        )
        db.session.commit()

        script_data = json.loads(comic.script.content)
        workflow_stages = {stage.stage for stage in comic.workflow_stages}

        assert run.id is not None
        assert run.status == "queued"
        assert run.current_stage == "story"
        assert run.user_id == user.id
        assert run.comic_id == comic.id
        assert run.title_snapshot == "Skyline Break"
        assert run.story_snapshot == "A courier outruns signal ghosts above the city."
        assert run.preferences_snapshot["text_provider"] == "third_party"
        assert comic.title == "Skyline Break"
        assert comic.style_description == "Sharp monochrome cyberpunk manga."
        assert comic.aspect_ratio == "16:9"
        assert script_data["title"] == "Skyline Break"
        assert script_data["story"] == "A courier outruns signal ghosts above the city."
        assert script_data["color_mode"] == "black-white"
        assert workflow_stages == {"outline", "shots", "render", "export"}


def test_create_auto_run_rejects_duplicate_active_run(app: Any, user: Any) -> None:
    from mangasuperb.services.auto_runs import AutoRunConflictError, create_auto_run

    with app.app_context():
        comic = create_comic(user.id)
        existing = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Already running",
            title_snapshot="Auto Draft",
        )
        db.session.add(existing)
        db.session.commit()

        with pytest.raises(AutoRunConflictError) as exc_info:
            create_auto_run(
                user_id=user.id,
                comic_id=comic.id,
                title="Auto Draft",
                story="A revised story should not start yet.",
            )

        assert exc_info.value.auto_run.id == existing.id


def test_create_auto_run_route_enqueues_worker_job(
    auth_client: Any,
    dummy_queue: Any,
) -> None:
    response = auth_client.post(
        "/api/auto/runs",
        json={
            "title": "Neon Relay",
            "story": "A messenger follows a coded lantern through the rain.",
            "preferences": {"image_provider": "gemini", "text_provider": "gemini"},
        },
    )

    assert response.status_code == 202
    payload = response.get_json()
    from mangasuperb.services import auto_runs

    assert payload["auto_run"]["status"] == "queued"
    assert payload["comic"]["title"] == "Neon Relay"
    assert dummy_queue.jobs[-1].func is auto_runs.process_auto_run
    assert dummy_queue.jobs[-1].kwargs["auto_run_id"] == payload["auto_run"]["id"]
    assert payload["auto_run"]["job_id"] == dummy_queue.jobs[-1].id


def test_active_auto_run_route_returns_current_user_run(
    app: Any,
    auth_client: Any,
    user: Any,
) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        other = User(
            username="other-auto-run",
            email="other-auto-run@example.com",
            password_hash="x",
        )
        db.session.add(other)
        db.session.flush()
        other_comic = create_comic(other.id, title="Other Draft")
        other_run = ComicAutoRun.create(
            comic_id=other_comic.id,
            user_id=other.id,
            story_snapshot="Other",
            title_snapshot="Other Draft",
        )
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Mine",
            title_snapshot="Auto Draft",
        )
        db.session.add_all([other_run, run])
        db.session.commit()
        comic_id = comic.id
        run_id = run.id

    response = auth_client.get(f"/api/auto/runs/active?comic_id={comic_id}")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["auto_run"]["id"] == run_id
    assert payload["comic"]["id"] == comic_id


def test_active_auto_run_route_returns_null_without_active_run(auth_client: Any) -> None:
    response = auth_client.get("/api/auto/runs/active")

    assert response.status_code == 200
    assert response.get_json() == {"auto_run": None}


def test_abort_auto_run_route_marks_active_run_aborted(
    app: Any,
    auth_client: Any,
    user: Any,
) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Stop me",
            title_snapshot="Auto Draft",
        )
        run.status = "running"
        run.current_stage = "panels"
        db.session.add(run)
        db.session.commit()
        run_id = run.id

    response = auth_client.post(f"/api/auto/runs/{run_id}/abort")

    assert response.status_code == 200
    payload = response.get_json()["auto_run"]
    assert payload["status"] == "aborted"
    assert payload["abort_requested"] is True
    assert payload["completed_at"] is not None

    with app.app_context():
        persisted = db.session.get(ComicAutoRun, run_id)
        assert persisted.status == "aborted"
        assert persisted.abort_requested is True
        assert persisted.completed_at is not None


def test_abort_auto_run_route_marks_linked_render_run_aborted(
    app: Any,
    auth_client: Any,
    user: Any,
) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        render_run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        render_run.status = "running"
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Stop render too",
            title_snapshot="Auto Draft",
        )
        run.status = "running"
        run.current_stage = "render"
        run.render_run = render_run
        db.session.add_all([render_run, run])
        db.session.commit()
        run_id = run.id
        render_run_id = render_run.id

    response = auth_client.post(f"/api/auto/runs/{run_id}/abort")

    assert response.status_code == 200
    with app.app_context():
        persisted = db.session.get(ComicRenderRun, render_run_id)
        assert persisted.status == "aborted"
        assert persisted.abort_requested is True
        assert persisted.completed_at is not None


def test_retry_auto_run_route_requeues_failed_run(
    app: Any,
    auth_client: Any,
    user: Any,
    dummy_queue: Any,
) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Retry me",
            title_snapshot="Auto Draft",
        )
        run.status = "failed"
        run.current_stage = "render"
        run.error_message = "render failed"
        run.completed_at = datetime.utcnow()
        db.session.add(run)
        db.session.commit()
        run_id = run.id

    response = auth_client.post(f"/api/auto/runs/{run_id}/retry")

    assert response.status_code == 202
    payload = response.get_json()["auto_run"]
    from mangasuperb.services import auto_runs

    assert payload["status"] == "queued"
    assert payload["current_stage"] == "story"
    assert payload["error_message"] is None
    assert payload["job_id"] == dummy_queue.jobs[-1].id
    assert dummy_queue.jobs[-1].func is auto_runs.process_auto_run
    assert dummy_queue.jobs[-1].kwargs["auto_run_id"] == run_id


def test_resolve_auto_run_route_applies_selected_characters_and_requeues(
    app: Any,
    auth_client: Any,
    user: Any,
    dummy_queue: Any,
) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        character = Character(
            user_id=user.id,
            name="Mira",
            description="A masked pilot.",
            sex="female",
        )
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Resolve me",
            title_snapshot="Auto Draft",
        )
        run.status = "needs_review"
        run.current_stage = "characters"
        run.character_review = {
            "reused": [],
            "created": [],
            "conflicts": [{"candidate": {"name": "Mira"}}],
            "failed": [],
            "suggested_roles": {},
        }
        db.session.add_all([character, run])
        db.session.commit()
        run_id = run.id
        character_id = character.id
        comic_id = comic.id

    response = auth_client.post(
        f"/api/auto/runs/{run_id}/resolve",
        json={
            "selected_character_ids": [character_id],
            "character_roles": {str(character_id): "protagonist"},
        },
    )

    assert response.status_code == 202
    payload = response.get_json()["auto_run"]
    from mangasuperb.services import auto_runs

    assert payload["status"] == "queued"
    assert payload["current_stage"] == "panels"
    assert payload["selected_character_ids"] == [character_id]
    assert payload["job_id"] == dummy_queue.jobs[-1].id
    assert dummy_queue.jobs[-1].func is auto_runs.process_auto_run
    assert dummy_queue.jobs[-1].kwargs["auto_run_id"] == run_id
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert [link.character_id for link in persisted.character_links] == [character_id]
        assert persisted.character_links[0].role == "protagonist"


def test_get_auto_run_route_scopes_to_current_user(
    app: Any,
    auth_client: Any,
) -> None:
    with app.app_context():
        other = User(
            username="foreign-auto-run",
            email="foreign-auto-run@example.com",
            password_hash="x",
        )
        db.session.add(other)
        db.session.flush()
        comic = create_comic(other.id, title="Foreign Draft")
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=other.id,
            story_snapshot="Hidden",
            title_snapshot="Foreign Draft",
        )
        db.session.add(run)
        db.session.commit()
        run_id = run.id

    response = auth_client.get(f"/api/auto/runs/{run_id}")

    assert response.status_code == 404


def test_latest_auto_run_route_returns_completed_run_for_current_comic(
    app: Any,
    auth_client: Any,
    user: Any,
) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Done story",
            title_snapshot="Completed Draft",
        )
        run.status = "completed"
        run.current_stage = "preview"
        db.session.add(run)
        db.session.commit()
        comic_id = comic.id
        run_id = run.id

    response = auth_client.get(f"/api/auto/runs/latest?comic_id={comic_id}")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["auto_run"]["id"] == run_id
    assert payload["auto_run"]["status"] == "completed"
    assert payload["comic"]["id"] == comic_id


def test_sync_auto_run_from_terminal_render_run(app: Any, user: Any) -> None:
    from mangasuperb.services.auto_runs import sync_auto_run_from_render_run

    with app.app_context():
        comic = create_comic(user.id)
        render_run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        render_run.status = "completed"
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="Render me",
            title_snapshot="Auto Draft",
        )
        run.status = "running"
        run.current_stage = "render"
        run.render_run = render_run
        db.session.add_all([render_run, run])
        db.session.commit()

        sync_auto_run_from_render_run(render_run)
        db.session.refresh(run)

        assert run.status == "completed"
        assert run.completed_at is not None


def test_process_auto_run_pauses_when_character_review_needed(
    app: Any,
    user: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from mangasuperb.services import auto_runs

    with app.app_context():
        run, _comic = auto_runs.create_auto_run(
            user_id=user.id,
            title="Conflict Draft",
            story="Mira and Myra share the same mask.",
        )
        db.session.commit()
        run_id = run.id

    monkeypatch.setattr(
        auto_runs,
        "extract_cast_candidates",
        lambda story, *, text_provider, style_preference=None: [SimpleNamespace(name="Mira")],
    )
    monkeypatch.setattr(
        auto_runs,
        "prepare_characters_from_candidates",
        lambda *, user_id, candidates, image_provider: {
            "reused": [],
            "created": [],
            "conflicts": [{"candidate": {"name": "Mira"}}],
            "failed": [],
        },
    )

    result = auto_runs.process_auto_run(run_id)

    assert result["status"] == "needs_review"
    with app.app_context():
        persisted = db.session.get(ComicAutoRun, run_id)
        assert persisted.status == "needs_review"
        assert persisted.current_stage == "characters"
        assert persisted.character_review["conflicts"][0]["candidate"]["name"] == "Mira"
