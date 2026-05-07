from __future__ import annotations

import logging

import pytest

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext, LayoutContext, PanelContext
from mangasuperb.services.generation_skills.pipeline import (
    GenerationSkill,
    SkillPipeline,
    SkillPipelineError,
)


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Test Comic",
        page_number=1,
        style_notes="Classic manga black and white linework.",
        script_data={},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="A hero enters the room.",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid.",
            notes=None,
            aspect_ratio="2:3",
        ),
        characters=(),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
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


def test_pipeline_runs_skills_in_priority_order() -> None:
    sink: list[str] = []

    result = SkillPipeline([RecordingSkill(sink), EarlySkill(sink)]).run(_context())

    assert sink == ["early", "recording"]
    assert result.constraints.applied_skills == ["early", "recording"]
    assert result.constraints.positive_constraints == ["recorded"]
    assert result.constraints.visual_mode == "black-white"
    assert result.constraints.dialogue_mode == "hybrid"


def test_pipeline_skips_non_required_skill_failures(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)

    result = SkillPipeline([FailingOptionalSkill(), RecordingSkill([])]).run(_context())

    assert result.constraints.skipped_skills == ["optional_failure"]
    assert result.constraints.applied_skills == ["recording"]
    assert "optional_failure" in caplog.text
    assert "optional exploded" in caplog.text


def test_pipeline_raises_for_required_skill_failures() -> None:
    with pytest.raises(SkillPipelineError) as exc:
        SkillPipeline([FailingRequiredSkill()]).run(_context())

    assert "required_failure" in str(exc.value)
    assert "optional exploded" in str(exc.value)
