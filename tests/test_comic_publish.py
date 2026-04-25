"""Tests for publishing comics and exposing public listings."""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime

import pytest

from mangasuperb.extensions import db
from mangasuperb.services import jobs
from mangasuperb.services.jobs import finalize_publish_stage
from models import Comic, ComicWorkflowStage, Script
from tests.test_jobs_workflow import _patch_cover_models, _patch_genai


@pytest.fixture
def generated_comic(app, user, monkeypatch) -> Comic:
    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

    with app.app_context():
        script_payload = {
            "title": "Publish Test",
            "story": "An apprentice saves the city.",
            "style_notes": "Bold ink",
            "panels": [
                {
                    "panel_number": 1,
                    "scene": "Establishing shot",
                    "dialogue": "We must prepare!",
                    "visual_notes": "City skyline",
                }
            ],
        }
        script = Script(
            user_id=user.id,
            title=script_payload["title"],
            content=json.dumps(script_payload),
        )
        comic = Comic(
            user_id=user.id,
            script=script,
            title=script_payload["title"],
            style_description=script_payload["style_notes"],
            aspect_ratio="16:9",
        )
        db.session.add_all([script, comic])
        db.session.commit()

        jobs.bootstrap_comic_workflow(comic)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)
        jobs.process_page_render_stage(comic.id, page_number=1, image_model="test-model")
        db.session.refresh(comic)
        return comic


def test_publish_endpoint_enqueues_workflow(
    app,
    auth_client,
    dummy_queue,
    generated_comic: Comic,
    dummy_storage,
    monkeypatch,
):
    response = auth_client.post(f"/api/comics/{generated_comic.id}/publish")
    assert response.status_code == 202
    payload = response.get_json()
    assert set(payload["stage_jobs"].keys()) == {
        "export_job_id",
        "cover_job_id",
        "publish_job_id",
    }
    assert "pdf_url" in payload
    assert dummy_queue.jobs[0].func is jobs.process_cover_generation
    assert dummy_queue.jobs[1].func is jobs.process_export_stage
    assert dummy_queue.jobs[2].func is finalize_publish_stage

    with app.app_context():
        stage = (
            ComicWorkflowStage.query.filter_by(
                comic_id=generated_comic.id, stage="export"
            )
            .order_by(ComicWorkflowStage.id)
            .first()
        )
        assert stage is not None
        assert stage.job_id == dummy_queue.jobs[1].id

    # Simulate the queued publish workflow completing successfully
    updated = None

    with app.app_context():
        cover_prompts: list = []
        _patch_cover_models(monkeypatch, cover_prompts)
        cover_result = jobs.process_cover_generation(generated_comic.id)
        assert cover_result["status"] == "completed"

        export_result = jobs.process_export_stage(generated_comic.id)
        assert export_result["status"] == "completed"

        publish_result = finalize_publish_stage(generated_comic.id)
        assert publish_result["status"] == "completed"

        updated = db.session.get(Comic, generated_comic.id)
        assert updated is not None

    dummy_queue.jobs.clear()

    # Re-publish without any new renders should be a no-op
    second_response = auth_client.post(
        f"/api/comics/{generated_comic.id}/publish",
        json={"make_public": True},
    )
    assert second_response.status_code == 200
    second_payload = second_response.get_json()
    assert second_payload["stage_jobs"] is None
    assert second_payload["pdf_url"] == updated.pdf_url
    assert "message" in second_payload
    assert dummy_queue.jobs == []

    # Simulate pending render (e.g., new page added) and ensure publish returns existing assets
    with app.app_context():
        stage = (
            ComicWorkflowStage.query.filter_by(
                comic_id=generated_comic.id, stage="render"
            )
            .order_by(ComicWorkflowStage.id)
            .first()
        )
        assert stage is not None
        stage.status = "pending"
        stage.completed_at = None
        db.session.commit()

    pending_response = auth_client.post(
        f"/api/comics/{generated_comic.id}/publish",
        json={"make_public": True},
    )
    assert pending_response.status_code == 200
    pending_payload = pending_response.get_json()
    assert pending_payload["stage_jobs"] is None
    assert pending_payload["pdf_url"] == updated.pdf_url
    assert "message" in pending_payload

    # Restore render stage to completed for subsequent assertions
    with app.app_context():
        stage = (
            ComicWorkflowStage.query.filter_by(
                comic_id=generated_comic.id, stage="render"
            )
            .order_by(ComicWorkflowStage.id)
            .first()
        )
        assert stage is not None
        stage.status = "completed"
        stage.completed_at = datetime.utcnow()
        db.session.commit()

    # Changing visibility should still enqueue a new workflow
    third_response = auth_client.post(
        f"/api/comics/{generated_comic.id}/publish",
        json={"make_public": False},
    )
    assert third_response.status_code == 202
    third_payload = third_response.get_json()
    assert set(third_payload["stage_jobs"].keys()) == {
        "export_job_id",
        "cover_job_id",
        "publish_job_id",
    }
    assert len(dummy_queue.jobs) == 3
    assert third_payload["pdf_url"] == updated.pdf_url
    assert dummy_queue.jobs[-1].func is finalize_publish_stage


def test_public_listing_returns_published_comic(
    app,
    client,
    generated_comic: Comic,
    dummy_storage,
    monkeypatch,
):
    cover_prompts: list[tuple[str, str]] = []

    with app.app_context():
        _patch_cover_models(monkeypatch, cover_prompts)
        cover_result = jobs.process_cover_generation(generated_comic.id)
        assert cover_result["status"] == "completed"

        export_result = jobs.process_export_stage(generated_comic.id)
        assert export_result["status"] == "completed"

        publish_result = finalize_publish_stage(generated_comic.id)
        assert publish_result["status"] == "completed"

        zip_payload = dummy_storage.files[export_result["zip_url"]]
        zip_names = zipfile.ZipFile(io.BytesIO(zip_payload)).namelist()
        assert zip_names[0] == "cover.png"
        assert any(name.startswith("page-") for name in zip_names[1:])

    list_response = client.get("/api/comics/public")
    assert list_response.status_code == 200
    listing = list_response.get_json()
    assert listing["count"] >= 1
    published = next(
        (item for item in listing["comics"] if item["id"] == generated_comic.id),
        None,
    )
    assert published is not None
    assert published["cover_image_url"].endswith(".png")
    assert published["pdf_url"].endswith(".pdf")
    assert published["zip_url"].endswith(".zip")
    assert published["published_at"] is not None

    detail_response = client.get(f"/api/comics/public/{generated_comic.id}")
    assert detail_response.status_code == 200
    detail = detail_response.get_json()
    assert detail["id"] == generated_comic.id
    assert detail["cover_image_url"] == published["cover_image_url"]


def test_comic_like_toggle(app, auth_client, generated_comic: Comic):
    like_response = auth_client.post(f"/api/comics/{generated_comic.id}/like")
    assert like_response.status_code == 200
    payload = like_response.get_json()
    assert payload["like_count"] == 1
    assert payload["comic"]["user_liked"] is True

    like_again = auth_client.post(f"/api/comics/{generated_comic.id}/like")
    assert like_again.status_code == 200
    assert like_again.get_json()["like_count"] == 1

    unlike_response = auth_client.delete(f"/api/comics/{generated_comic.id}/like")
    assert unlike_response.status_code == 200
    unlike_payload = unlike_response.get_json()
    assert unlike_payload["like_count"] == 0
    assert unlike_payload["comic"]["user_liked"] is False
