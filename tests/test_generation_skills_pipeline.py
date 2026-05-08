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


def _context(task_type: str = "page_render") -> GenerationContext:
    return GenerationContext(
        task_type=task_type,
        comic_id=1,
        comic_title="Test Comic",
        page_number=1,
        story="A hero enters the city.",
        style_notes="Classic manga black and white linework.",
        script_data={},
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


class OptionalFailure:
    id = "optional_failure"
    scopes = ("page_render",)
    priority = 5
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raise RuntimeError("optional failed")


class RequiredFailure(OptionalFailure):
    id = "required_failure"
    required = True


def test_pipeline_runs_skills_in_priority_order() -> None:
    sink: list[str] = []
    result = SkillPipeline([RecordingSkill(sink), EarlySkill(sink)]).run(_context())

    assert sink == ["early", "recording"]
    assert result.positive_constraints == ("recorded",)
    assert result.metadata["applied_skills"] == ["early", "recording"]


def test_pipeline_skips_non_matching_scope() -> None:
    sink: list[str] = []
    result = SkillPipeline([RecordingSkill(sink)]).run(_context("shot_split"))

    assert sink == []
    assert result.positive_constraints == ()
    assert result.metadata["applied_skills"] == []


def test_pipeline_logs_and_skips_optional_failure(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.WARNING)

    result = SkillPipeline([OptionalFailure()]).run(_context())

    assert result.metadata["applied_skills"] == []
    assert result.metadata["skipped_skills"] == ["optional_failure"]
    assert "optional failed" in caplog.text


def test_pipeline_raises_required_failure() -> None:
    with pytest.raises(SkillPipelineError, match="required_failure"):
        SkillPipeline([RequiredFailure()]).run(_context())
