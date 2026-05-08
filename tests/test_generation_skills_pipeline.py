from __future__ import annotations

import logging

import pytest

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import (
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import (
    SkillPipeline,
    SkillPipelineError,
)


def _context(
    task_type: str = "page_render",
    script_data: dict[str, object] | None = None,
    visual_preferences: dict[str, object] | None = None,
    text_options: dict[str, object] | None = None,
) -> GenerationContext:
    return GenerationContext(
        task_type=task_type,
        comic_id=1,
        comic_title="Test Comic",
        page_number=1,
        story="A hero enters the city.",
        style_notes="Classic manga black and white linework.",
        script_data={} if script_data is None else script_data,
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="A hero enters the city.",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
                source_title="Opening",
            ),
        ),
        layout=LayoutContext(
            layout_key="auto-grid",
            instruction="Arrange panels evenly in a balanced manga grid.",
            notes=None,
            aspect_ratio="16:9",
        ),
        characters=(),
        visual_preferences=(
            {"color_mode": "black-white"}
            if visual_preferences is None
            else visual_preferences
        ),
        reference_notes=(),
        previous_context_lines=(),
        text_options={} if text_options is None else text_options,
    )


class RecordingSkill:
    id = "recording"
    scopes = ("page_render",)
    priority = 20
    required = False

    def __init__(self, sink: list[str]) -> None:
        self.sink = sink

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        self.sink.append(self.id)
        constraints.add_positive("recorded")


class EarlySkill(RecordingSkill):
    id = "early"
    priority = 10


class FailingOptionalSkill:
    id = "optional_failure"
    scopes = ("page_render",)
    priority = 5
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raise RuntimeError("optional exploded")


class FailingRequiredSkill(FailingOptionalSkill):
    id = "required_failure"
    required = True


class ShouldApplyFailingOptionalSkill(FailingOptionalSkill):
    id = "optional_should_apply_failure"

    def should_apply(self, context: GenerationContext) -> bool:
        raise RuntimeError("optional gate exploded")


class ShouldApplyFailingRequiredSkill(ShouldApplyFailingOptionalSkill):
    id = "required_should_apply_failure"
    required = True


def test_pipeline_runs_skills_in_priority_order() -> None:
    sink: list[str] = []

    result = SkillPipeline([RecordingSkill(sink), EarlySkill(sink)]).run(_context())

    assert sink == ["early", "recording"]
    assert result.positive_constraints == ("recorded",)
    assert result.metadata["applied_skills"] == ["early", "recording"]
    assert result.constraints.applied_skills == ["early", "recording"]
    assert result.constraints.positive_constraints == ["recorded"]
    assert result.constraints.visual_mode == "black-white"
    assert result.constraints.dialogue_mode == "hybrid"


def test_pipeline_skips_non_matching_scope() -> None:
    sink: list[str] = []

    result = SkillPipeline([RecordingSkill(sink)]).run(_context("shot_split"))

    assert sink == []
    assert result.positive_constraints == ()
    assert result.metadata["applied_skills"] == []


def test_generation_context_copies_mapping_inputs() -> None:
    script_data = {"chapter": 1}
    visual_preferences = {"color_mode": "black-white"}
    text_options = {"font": "dialogue"}

    context = _context(
        script_data=script_data,
        visual_preferences=visual_preferences,
        text_options=text_options,
    )

    script_data["chapter"] = 2
    visual_preferences["color_mode"] = "color"
    text_options["font"] = "sound-effect"

    assert context.script_data["chapter"] == 1
    assert context.visual_preferences["color_mode"] == "black-white"
    assert context.text_options["font"] == "dialogue"


@pytest.mark.parametrize(
    ("color_mode", "expected"),
    [
        (" COLOR ", "color"),
        ("sepia", "black-white"),
    ],
)
def test_pipeline_normalizes_default_visual_mode(
    color_mode: str,
    expected: str,
) -> None:
    result = SkillPipeline([]).run(_context(visual_preferences={"color_mode": color_mode}))

    assert result.constraints.visual_mode == expected


def test_pipeline_resolves_visual_mode_from_script_without_explicit_preference() -> None:
    result = SkillPipeline([]).run(
        _context(script_data={"color_mode": "color"}, visual_preferences={})
    )

    assert result.constraints.visual_mode == "color"
    assert result.constraints.visual_mode_source == "script"


def test_pipeline_skips_non_required_skill_failures(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)

    result = SkillPipeline([FailingOptionalSkill(), RecordingSkill([])]).run(_context())

    assert result.metadata["applied_skills"] == ["recording"]
    assert result.constraints.skipped_skills == ["optional_failure"]
    assert result.constraints.applied_skills == ["recording"]
    assert "optional_failure" in caplog.text
    assert "optional exploded" in caplog.text
    assert "page_render" in caplog.text
    assert caplog.records[0].exc_info is not None


def test_pipeline_raises_for_required_skill_failures() -> None:
    with pytest.raises(SkillPipelineError) as exc:
        SkillPipeline([FailingRequiredSkill()]).run(_context())

    assert "required_failure" in str(exc.value)
    assert "optional exploded" in str(exc.value)


def test_pipeline_skips_non_required_should_apply_failures(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.WARNING)

    result = SkillPipeline([ShouldApplyFailingOptionalSkill(), RecordingSkill([])]).run(
        _context()
    )

    assert result.constraints.skipped_skills == ["optional_should_apply_failure"]
    assert result.constraints.applied_skills == ["recording"]
    assert "optional_should_apply_failure" in caplog.text
    assert "optional gate exploded" in caplog.text
    assert caplog.records[0].exc_info is not None


def test_pipeline_raises_skill_error_for_required_should_apply_failures() -> None:
    with pytest.raises(SkillPipelineError) as exc:
        SkillPipeline([ShouldApplyFailingRequiredSkill()]).run(_context())

    assert "required_should_apply_failure" in str(exc.value)
    assert "optional gate exploded" in str(exc.value)
