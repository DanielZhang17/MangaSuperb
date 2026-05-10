from __future__ import annotations

import json

from mangasuperb.extensions import db
from mangasuperb.services import jobs
from models import (
    Comic,
    ComicPage,
    ComicPageLayout,
    ComicPanelShot,
    ComicRenderRun,
    ComicWorkflowStage,
    Script,
)


def _comic_with_pages(user_id: int, *, page_count: int = 3) -> Comic:
    script = Script(
        user_id=user_id,
        title="Run Story",
        content=json.dumps({"title": "Run Story", "story": "Run"}),
    )
    comic = Comic(user_id=user_id, script=script, title="Run Story", aspect_ratio="16:9")
    db.session.add_all([script, comic])
    db.session.flush()
    for page_number in range(1, page_count + 1):
        layout = ComicPageLayout(
            comic_id=comic.id,
            page_number=page_number,
            layout_key="auto-grid",
        )
        panel = ComicPanelShot(
            comic_id=comic.id,
            sequence_index=page_number,
            page_number=page_number,
            panel_number=1,
            description=f"Page {page_number}",
            dialogue=f"Line {page_number}",
        )
        db.session.add_all([layout, panel])
    db.session.commit()
    return comic


def test_start_all_pages_render_run_enqueues_first_page(app, auth_client, user, dummy_queue):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=3)
        comic_id = comic.id

    response = auth_client.post(
        f"/api/panels/{comic_id}/render-runs",
        json={"mode": "all_pages", "image_provider": "gemini"},
    )

    assert response.status_code == 202
    payload = response.get_json()
    assert payload["render_run"]["mode"] == "all_pages"
    assert payload["render_run"]["requested_pages"] == [1, 2, 3]
    assert dummy_queue.jobs[-1].func is jobs.process_page_render_stage
    assert dummy_queue.jobs[-1].kwargs["render_run_id"] == payload["render_run"]["id"]
    assert dummy_queue.jobs[-1].kwargs["page_number"] == 1


def test_remaining_pages_skip_rendered_pages(app, auth_client, user, dummy_queue):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=3)
        page = ComicPage(
            comic_id=comic.id,
            script_id=comic.script_id,
            page_number=1,
            image_url="https://cdn.example.com/page-1.png",
        )
        db.session.add(page)
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(
        f"/api/panels/{comic_id}/render-runs",
        json={"mode": "remaining_pages"},
    )

    assert response.status_code == 202
    payload = response.get_json()
    assert payload["render_run"]["requested_pages"] == [2, 3]
    assert dummy_queue.jobs[-1].kwargs["page_number"] == 2


def test_abort_render_run_marks_run(app, auth_client, user):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        db.session.add(run)
        db.session.commit()
        run_id = run.id

    response = auth_client.post(f"/api/panels/render-runs/{run_id}/abort")

    assert response.status_code == 200
    with app.app_context():
        persisted = db.session.get(ComicRenderRun, run_id)
        assert persisted.status == "aborted"
        assert persisted.abort_requested is True


def test_endpoint_render_run_appears_once_in_active_jobs(
    app,
    auth_client,
    user,
    dummy_queue,
):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        comic_id = comic.id

    start_response = auth_client.post(
        f"/api/panels/{comic_id}/render-runs",
        json={"mode": "all_pages"},
    )
    render_run = start_response.get_json()["render_run"]

    response = auth_client.get("/api/jobs/active")

    assert response.status_code == 200
    matching = [
        item
        for item in response.get_json()["active"]
        if item["job_id"] == render_run["job_id"]
    ]
    assert len(matching) == 1
    assert matching[0]["render_run_id"] == render_run["id"]
    assert matching[0]["render_progress"] == {"completed": 0, "total": 2}
    assert dummy_queue.jobs[-1].id == render_run["job_id"]


def test_abort_endpoint_clears_underlying_active_render_stage(
    app,
    auth_client,
    user,
):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        comic_id = comic.id

    start_response = auth_client.post(
        f"/api/panels/{comic_id}/render-runs",
        json={"mode": "all_pages"},
    )
    render_run = start_response.get_json()["render_run"]

    response = auth_client.post(f"/api/panels/render-runs/{render_run['id']}/abort")

    assert response.status_code == 200
    active_response = auth_client.get("/api/jobs/active")
    active_job_ids = {
        item["job_id"] for item in active_response.get_json()["active"]
    }
    assert render_run["job_id"] not in active_job_ids
    with app.app_context():
        stage = ComicWorkflowStage.query.filter_by(
            comic_id=comic_id,
            stage="render",
        ).one()
        assert stage.status == "aborted"
        assert stage.completed_at is not None


def test_render_run_route_rejects_non_string_mode(app, auth_client, user):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=1)
        comic_id = comic.id

    response = auth_client.post(
        f"/api/panels/{comic_id}/render-runs",
        json={"mode": 123},
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "mode is invalid"


def test_aborted_render_run_skips_page_without_enqueueing_next(
    app,
    user,
    dummy_queue,
    monkeypatch,
):
    called = False

    class FailingProvider:
        def generate_image(self, *args, **kwargs):
            nonlocal called
            called = True
            raise AssertionError("aborted run must not render")

    monkeypatch.setattr(jobs, "get_image_provider", lambda provider=None: FailingProvider())

    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        run.abort_requested = True
        db.session.add(run)
        db.session.commit()

        result = jobs.process_page_render_stage(comic.id, page_number=1, render_run_id=run.id)

        persisted = db.session.get(ComicRenderRun, run.id)
        assert result["status"] == "aborted"
        assert persisted.status == "aborted"
        assert persisted.completed_pages == []
        assert dummy_queue.jobs == []
        assert called is False


def test_page_failure_marks_run_failed_and_stops_later_pages(app, user, dummy_queue, monkeypatch):
    class FailingProvider:
        def generate_image(self, *args, **kwargs):
            raise RuntimeError("image provider unavailable")

    monkeypatch.setattr(jobs, "get_image_provider", lambda provider=None: FailingProvider())

    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        db.session.add(run)
        db.session.commit()

        result = jobs.process_page_render_stage(comic.id, page_number=1, render_run_id=run.id)

        persisted = db.session.get(ComicRenderRun, run.id)
        assert result["status"] == "failed"
        assert persisted.status == "failed"
        assert persisted.failed_pages == [1]
        assert persisted.completed_pages == []
        assert dummy_queue.jobs == []


def test_render_run_appears_in_active_jobs(app, auth_client, user):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        run.status = "running"
        run.current_page_number = 1
        db.session.add(run)
        db.session.commit()

    response = auth_client.get("/api/jobs/active")

    assert response.status_code == 200
    active = response.get_json()["active"]
    render_run_rows = [item for item in active if item.get("render_run_id")]
    assert len(render_run_rows) == 1
    assert render_run_rows[0]["stage"] == "render"
    assert render_run_rows[0]["render_progress"] == {"completed": 0, "total": 2}
