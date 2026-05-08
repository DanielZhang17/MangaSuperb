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
    Character,
    Comic,
    ComicCharacter,
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


MINI_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC"
)


class DummyGenerativeModel:
    """Track prompts and return inline image data."""

    def __init__(self, model_name: str, store: list[str]) -> None:
        self.model_name = model_name
        self._store = store

    def generate_content(self, prompt: str) -> DummyModelResult:
        self._store.append(prompt)
        payload = base64.b64encode(MINI_PNG)
        inline = SimpleNamespace(data=payload.decode("utf-8"))
        part = SimpleNamespace(inline_data=inline)
        content = SimpleNamespace(parts=[part])
        candidate = SimpleNamespace(content=content)
        return DummyModelResult(candidates=[candidate])


class DummyTextModel:
    """Return a canned text response while recording prompts."""

    def __init__(self, store: list[tuple[str, str]]) -> None:
        self._store = store

    def generate_content(self, prompt: str):
        self._store.append(("text", prompt))
        return SimpleNamespace(text="The hero confronts looming shadows to protect the city.")


class DummyCoverImageModel:
    """Return image bytes while tracking prompts for cover generation."""

    def __init__(self, store: list[tuple[str, str]]) -> None:
        self._store = store

    def generate_content(self, prompt: str) -> DummyModelResult:
        self._store.append(("image", prompt))
        payload = base64.b64encode(MINI_PNG)
        inline = SimpleNamespace(inline_data=SimpleNamespace(data=payload.decode("utf-8")))
        content = SimpleNamespace(parts=[inline])
        candidate = SimpleNamespace(content=content)
        return DummyModelResult(candidates=[candidate])


class DummyGenAIClient:
    """Small stand-in for google.genai.Client used by job tests."""

    def __init__(self, responder) -> None:
        self.models = SimpleNamespace(generate_content=responder)


class FakeOptimizerProvider:
    def __init__(self, calls: list[str], response: str) -> None:
        self.calls = calls
        self.response = response

    def generate_text(self, prompt: str) -> str:
        self.calls.append(prompt)
        return self.response


def _prompt_text(contents) -> str:
    if isinstance(contents, str):
        return contents
    if isinstance(contents, list) and contents:
        first = contents[0]
        if isinstance(first, str):
            return first
    return str(contents)


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
    from mangasuperb.services import ai_provider

    def _generate_content(*, model: str, contents, config=None):
        store.append(_prompt_text(contents))
        return DummyGenerativeModel(model, []).generate_content(_prompt_text(contents))

    monkeypatch.setattr(
        ai_provider.genai,
        "Client",
        lambda api_key: DummyGenAIClient(_generate_content),
    )


def _patch_cover_models(monkeypatch: pytest.MonkeyPatch, store: list[tuple[str, str]]) -> None:
    from mangasuperb.services import ai_provider

    def _generate_content(*, model: str, contents, config=None):
        prompt = _prompt_text(contents)
        if model == "test-script-model":
            return DummyTextModel(store).generate_content(prompt)
        return DummyCoverImageModel(store).generate_content(prompt)

    monkeypatch.setattr(
        ai_provider.genai,
        "Client",
        lambda api_key: DummyGenAIClient(_generate_content),
    )


def test_sequential_workflow_generates_resources(
    app,
    comic: Comic,
    script_payload,
    dummy_storage,
    monkeypatch,
):
    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

    with app.app_context():
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

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
            image_model="test-model",
        )
        assert render_result["status"] == "processing"
        assert len(prompts) == 1
        assert "Panel-by-panel content:" in prompts[0]
        assert "Layout constraints:" in prompts[0]
        assert "Character locks" not in prompts[0]
        assert dummy_storage.uploads[0].filename.endswith(".png")

        refreshed_comic = db.session.get(Comic, comic.id)
        assert refreshed_comic.status == "processing"
        assert refreshed_comic.workflow_stage == "export"
        assert refreshed_comic.workflow_status == "pending"

        workflow_rows = {
            row.stage: row for row in ComicWorkflowStage.query.filter_by(comic_id=comic.id)
        }
        assert workflow_rows["outline"].status == "completed"
        assert workflow_rows["shots"].status == "completed"
        assert workflow_rows["render"].status == "completed"
        assert workflow_rows["export"].status == "pending"

        page = ComicPage.query.filter_by(comic_id=comic.id, page_number=1).first()
        assert page is not None
        assert page.script_id == comic.script_id
        stored = json.loads(page.panel_text)
        assert stored[0]["dialogue"] == "Line 1"

        export_result = jobs.process_export_stage(comic.id)
        assert export_result["status"] == "completed"

        refreshed_comic = db.session.get(Comic, comic.id)
        assert refreshed_comic.status == "completed"
        assert refreshed_comic.workflow_stage == "export"
        assert refreshed_comic.workflow_status == "completed"
        assert refreshed_comic.pdf_url is not None


def test_render_stage_chains_additional_pages(
    app,
    user: User,
    dummy_storage,
    dummy_queue,
    monkeypatch,
):
    panels = []
    for idx in range(1, PANELS_PER_PAGE * 2 + 1):
        panels.append(
            {
                "panel_number": idx,
                "scene": f"Scene {idx}",
                "dialogue": f"Line {idx}",
                "visual_notes": f"Visual {idx}",
            }
        )
    script_payload = {
        "title": "Longer Story",
        "story": "Two chapters of adventure.",
        "style_notes": "Expressive ink",
        "panels": panels,
    }

    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

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

        jobs.bootstrap_comic_workflow(comic)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)

        dummy_queue.jobs.clear()

        render_result = jobs.process_page_render_stage(
            comic.id,
            page_number=1,
            image_model="test-model",
            chain_remaining=True,
        )
        assert render_result["status"] == "processing"

        assert dummy_queue.jobs, "Expected follow-up render job to be enqueued"
        chained_job = dummy_queue.jobs[-1]
        assert chained_job.kwargs["page_number"] == 2
        assert chained_job.kwargs["chain_remaining"] is True

        refreshed_comic = db.session.get(Comic, comic.id)
        render_stage = next(
            stage
            for stage in ComicWorkflowStage.query.filter_by(comic_id=comic.id)
            if stage.stage == "render"
        )
        assert render_stage.status == "in_progress"
        assert refreshed_comic.workflow_stage == "render"
        assert refreshed_comic.workflow_status == "in_progress"
        assert refreshed_comic.status == "processing"


def test_requeue_render_includes_context(
    app,
    comic: Comic,
    dummy_storage,
    monkeypatch,
):
    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

    extra_panel = {
        "panel_number": PANELS_PER_PAGE + 1,
        "scene": "Cliffhanger",
        "dialogue": "To be continued",
        "visual_notes": "Dramatic zoom",
    }

    with app.app_context():
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

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
            image_model="test-model",
        )
        assert second_pass["status"] == "processing"
        assert len(prompts) == 2
        assert "Previous pages context" in prompts[1]
        assert "Page 1 Panel 1" in prompts[1]

        refreshed_comic = db.session.get(Comic, comic.id)
        assert refreshed_comic.workflow_stage == "export"
        assert refreshed_comic.workflow_status == "pending"
        assert refreshed_comic.status == "processing"

        render_stage = (
            ComicWorkflowStage.query.filter_by(comic_id=comic.id, stage="render").first()
        )
        assert render_stage is not None
        assert render_stage.status == "completed"

        assert len(dummy_storage.uploads) == 2


def test_cover_generation_creates_cover_asset(
    app,
    comic: Comic,
    dummy_storage,
    monkeypatch,
):
    prompts: list[tuple[str, str]] = []
    _patch_cover_models(monkeypatch, prompts)

    with app.app_context():
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)

        cover_result = jobs.process_cover_generation(comic.id)
        assert cover_result["status"] == "completed"
        assert cover_result["cover_image_url"].endswith(".png")

        refreshed_comic = db.session.get(Comic, comic.id)
        assert refreshed_comic.cover_image_url is not None

        assert prompts[0][0] == "text"
        assert "Story outline" in prompts[0][1]
        assert prompts[1][0] == "image"
        assert "Design a finished manga cover" in prompts[1][1]

        assert any("cover" in upload.filename for upload in dummy_storage.uploads)


def test_render_prompt_includes_character_roster(
    app,
    comic: Comic,
    script_payload,
    dummy_storage,
    monkeypatch,
):
    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

    with app.app_context():
        stored_comic = db.session.get(Comic, comic.id)
        script = db.session.get(Script, comic.script_id)

        character = Character(
            user_id=stored_comic.user_id,
            name="Aya",
            description="A daring pilot with a signature flight jacket.",
            sex="female",
            is_public=True,
            style_prompt="High-energy shounen hero with windswept hair",
            optimized_description=(
                "Confident ace pilot with windswept hair and a battered bomber jacket."
            ),
        )
        db.session.add(character)
        db.session.flush()
        db.session.add(
            ComicCharacter(
                comic_id=stored_comic.id,
                character_id=character.id,
                order_index=1,
                role="Protagonist",
            )
        )

        script_data = json.loads(script.content)
        script_data["characters"] = [
            {
                "id": character.id,
                "name": character.name,
                "description": character.description,
                "style_prompt": character.style_prompt,
                "optimized_description": character.optimized_description,
                "order_index": 1,
                "role": "Protagonist",
            }
        ]
        script.content = json.dumps(script_data)
        db.session.commit()

        jobs.process_outline_stage(stored_comic.id)
        jobs.process_shot_stage(stored_comic.id)
        jobs.process_page_render_stage(
            stored_comic.id,
            page_number=1,
            image_model="test-model",
        )

        assert prompts, "Expected image generation prompt to be captured"
        assert "Character roster:" in prompts[0]
        assert "Aya" in prompts[0]
        assert "Protagonist" in prompts[0]


def test_shot_stage_recovers_dialogue_from_summary(app, comic: Comic):
    with app.app_context():
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        script = db.session.get(Script, comic.script_id)
        script.content = json.dumps(
            {
                "panels": [
                    {
                        "panel_number": 1,
                        "scene": "Original generated scene",
                        "dialogue": "Original generated line",
                    }
                ]
            }
        )

        ComicOutlineSection.query.filter_by(comic_id=comic.id).delete()
        db.session.flush()

        section = ComicOutlineSection(
            comic_id=comic.id,
            order_index=1,
            title="Confrontation",
            summary="秦飞扬滚落台阶。“姓马的，我诅咒你不得好死！”他怒吼。",
        )
        db.session.add(section)
        db.session.commit()

        result = jobs.process_shot_stage(comic.id)
        assert result["status"] == "completed"

        panels = (
            ComicPanelShot.query.filter_by(comic_id=comic.id)
            .order_by(ComicPanelShot.sequence_index)
            .all()
        )
        assert len(panels) == 1
        assert panels[0].dialogue == "姓马的，我诅咒你不得好死！"
        assert panels[0].description == section.summary


def test_default_workflow_does_not_call_text_optimizer(app, comic: Comic, monkeypatch):
    calls: list[str] = []

    def fail_text_provider():
        raise AssertionError("text optimizer should be disabled by default")

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        fail_text_provider,
    )

    with app.app_context():
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        result = jobs.process_shot_stage(comic.id)

        assert result["status"] == "completed"
        assert calls == []


def test_render_optimizer_runs_once_when_enabled(
    app,
    comic: Comic,
    dummy_storage,
    monkeypatch,
):
    image_prompts: list[str] = []
    optimizer_calls: list[str] = []
    _patch_genai(monkeypatch, image_prompts)

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(
            optimizer_calls,
            "Optimized render prompt\n"
            "Panel 1: Scene 1\n"
            "Panel 2: Scene 2\n"
            "Panel 3: Scene 3\n"
            "Panel 4: Scene 4",
        ),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "page_render"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)
        result = jobs.process_page_render_stage(
            comic.id,
            page_number=1,
            image_model="test-model",
        )

        assert result["status"] == "processing"
        assert len(optimizer_calls) == 1
        assert image_prompts[0].startswith("Optimized render prompt")


def test_render_optimizer_fallback_when_required_panel_is_dropped(
    app,
    comic: Comic,
    monkeypatch,
):
    image_prompts: list[str] = []
    optimizer_calls: list[str] = []
    _patch_genai(monkeypatch, image_prompts)

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(optimizer_calls, "Optimized prompt without panel labels"),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "page_render"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)
        jobs.process_page_render_stage(comic.id, page_number=1, image_model="test-model")

        assert len(optimizer_calls) == 1
        assert "Panel-by-panel content:" in image_prompts[0]


def test_shot_optimizer_runs_once_when_enabled(app, comic: Comic, monkeypatch):
    optimizer_calls: list[str] = []

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(optimizer_calls, "[]"),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "shot_split"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        result = jobs.process_shot_stage(comic.id)

        assert result["status"] == "completed"
        assert len(optimizer_calls) == 1
        assert ComicPanelShot.query.filter_by(comic_id=comic.id).count() == PANELS_PER_PAGE


def test_shot_optimizer_advisory_updates_structured_fields(
    app,
    comic: Comic,
    monkeypatch,
):
    optimizer_calls: list[str] = []
    advisory = json.dumps(
        [
            {
                "sequence_index": 1,
                "description": "Model-refined opening action.",
                "dialogue": "Stay close.",
                "camera_notes": "wide shot",
                "style_notes": "speed lines",
            },
            {
                "sequence_index": 99,
                "description": "This extra panel must be ignored.",
            },
        ]
    )

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(optimizer_calls, advisory),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "shot_split"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        result = jobs.process_shot_stage(comic.id)

        assert result["status"] == "completed"
        panels = (
            ComicPanelShot.query.filter_by(comic_id=comic.id)
            .order_by(ComicPanelShot.sequence_index)
            .all()
        )
        assert len(panels) == PANELS_PER_PAGE
        assert panels[0].description == "Model-refined opening action."
        assert panels[0].dialogue == "Stay close."
        assert panels[0].camera_notes == "wide shot"
        assert panels[0].style_notes == "speed lines"
        assert all(panel.sequence_index != 99 for panel in panels)
