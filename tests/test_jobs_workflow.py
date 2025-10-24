"""Integration tests for staged comic generation jobs."""
from __future__ import annotations

import base64
import json
from types import SimpleNamespace

import pytest

from mangasuperb.extensions import db
from mangasuperb.services import jobs
from mangasuperb.services.jobs import PANELS_PER_PAGE
from models import (
    Comic,
    ComicOutlineSection,
    ComicPage,
    ComicPageLayout,
    ComicPanelShot,
    ComicWorkflowStage,
    Script,
    User,
)


class DummyModelResult(SimpleNamespace):
    """Simple container for fake Gemini responses."""


class DummyGenerativeModel:
    """Track prompts and return inline image data."""

    def __init__(self, model_name: str, store: list[str]) -> None:
        self.model_name = model_name
        self._store = store

    def generate_content(self, prompt: str) -> DummyModelResult:
        self._store.append(prompt)
        payload = base64.b64encode(f"image-{len(self._store)}".encode("utf-8"))
        inline = SimpleNamespace(data=payload.decode("utf-8"))
        part = SimpleNamespace(inline_data=inline)
        content = SimpleNamespace(parts=[part])
        candidate = SimpleNamespace(content=content)
        return DummyModelResult(candidates=[candidate])


@pytest.fixture
def script_payload() -> dict[str, object]:
    panels = []
    for idx in range(1, PANELS_PER_PAGE + 1):
        panels.append(
            {
                "panel_number": idx,
                "scene": f"Scene {idx}",
                "dialogue": f"Line {idx}",
                "visual_notes": f"Visual {idx}",
            }
        )
    return {
        "title": "Test Story",
        "story": "A hero ventures forth.",
        "style_notes": "Expressive ink",
        "panels": panels,
    }


@pytest.fixture
def comic(app, user: User, script_payload) -> SimpleNamespace:
    with app.app_context():
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
        return SimpleNamespace(id=comic.id, script_id=comic.script_id)


def _patch_genai(monkeypatch: pytest.MonkeyPatch, store: list[str]) -> None:
    monkeypatch.setattr(jobs.genai, "configure", lambda api_key: None)
    monkeypatch.setattr(
        jobs.genai,
        "GenerativeModel",
        lambda model_name: DummyGenerativeModel(model_name, store),
    )


def test_sequential_workflow_generates_resources(app, comic: Comic, script_payload, dummy_storage, monkeypatch):
    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

    with app.app_context():
        outline_result = jobs.process_outline_stage(comic.id)
        assert outline_result["status"] == "completed"
        sections = ComicOutlineSection.query.filter_by(comic_id=comic.id).all()
        assert len(sections) == len(script_payload["panels"])

        shot_result = jobs.process_shot_stage(comic.id)
        assert shot_result["status"] == "completed"
        panels = ComicPanelShot.query.filter_by(comic_id=comic.id).all()
        assert len(panels) == len(script_payload["panels"])
        layouts = ComicPageLayout.query.filter_by(comic_id=comic.id).all()
        assert len(layouts) == 1

        render_result = jobs.process_page_render_stage(
            comic.id,
            page_number=1,
            api_key="test-key",
            image_model="test-model",
        )
        assert render_result["status"] == "completed"
        assert len(prompts) == 1
        assert dummy_storage.uploads[0].filename.endswith(".png")

        refreshed_comic = db.session.get(Comic, comic.id)
        assert refreshed_comic.status == "completed"
        assert refreshed_comic.workflow_stage == "render"
        assert refreshed_comic.workflow_status == "completed"
        assert refreshed_comic.completed_at is not None

        workflow_rows = {
            row.stage: row for row in ComicWorkflowStage.query.filter_by(comic_id=comic.id)
        }
        assert workflow_rows["outline"].status == "completed"
        assert workflow_rows["shots"].status == "completed"
        assert workflow_rows["render"].status == "completed"

        page = ComicPage.query.filter_by(comic_id=comic.id, page_number=1).first()
        assert page is not None
        stored = json.loads(page.panel_text)
        assert stored[0]["dialogue"] == "Line 1"


def test_requeue_render_includes_context(app, comic: Comic, dummy_storage, monkeypatch):
    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

    extra_panel = {
        "panel_number": PANELS_PER_PAGE + 1,
        "scene": "Cliffhanger",
        "dialogue": "To be continued",
        "visual_notes": "Dramatic zoom",
    }

    with app.app_context():
        script = db.session.get(Script, comic.script_id)
        payload = json.loads(script.content)
        payload["panels"].append(extra_panel)
        script.content = json.dumps(payload)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)

        first_pass = jobs.process_page_render_stage(
            comic.id,
            page_number=1,
            api_key="test-key",
            image_model="test-model",
        )
        assert first_pass["status"] == "processing"
        stage_row = (
            ComicWorkflowStage.query.filter_by(comic_id=comic.id, stage="render").first()
        )
        assert stage_row.status == "in_progress"

        second_pass = jobs.process_page_render_stage(
            comic.id,
            page_number=2,
            api_key="test-key",
            image_model="test-model",
        )
        assert second_pass["status"] == "completed"
        assert len(prompts) == 2
        assert "Previous pages context" in prompts[1]
        assert "Page 1 Panel 1" in prompts[1]

        refreshed_comic = db.session.get(Comic, comic.id)
        assert refreshed_comic.workflow_status == "completed"
        assert refreshed_comic.status == "completed"

        assert len(dummy_storage.uploads) == 2

        total_pages = ComicPage.query.filter_by(comic_id=comic.id).count()
        assert total_pages == 2
