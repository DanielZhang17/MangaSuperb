from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.skills.visual_mode import VisualModeSkill


def _context(
    color_mode: str,
    style_notes: str,
    panel_style: str | None = None,
    script_data: dict[str, object] | None = None,
) -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Visual Test",
        page_number=1,
        style_notes=style_notes,
        script_data=(
            {"color_mode": "color", "style_notes": style_notes}
            if script_data is None
            else script_data
        ),
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="The hero runs across a rooftop.",
                dialogue=None,
                camera_notes=None,
                style_notes=panel_style,
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid.",
            notes=None,
            aspect_ratio="2:3",
        ),
        characters=(),
        visual_preferences={"color_mode": color_mode},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


def test_black_white_mode_suppresses_full_color_language() -> None:
    result = SkillPipeline([VisualModeSkill()]).run(
        _context(
            "black-white",
            "Classic manga black and white linework with vibrant full color watercolor color wash.",
            "Use rich chromatic lighting and gradients.",
        )
    )

    constraints = result.constraints

    assert constraints.visual_mode == "black-white"
    assert constraints.visual_mode_source == "explicit"
    assert any(
        "black-and-white manga linework" in text
        for text in constraints.positive_constraints
    )
    assert "vibrant full color" in constraints.suppressed_phrases
    assert "watercolor color wash" in constraints.suppressed_phrases
    assert any(
        "Avoid full-color rendering" in text
        for text in constraints.negative_constraints
    )


def test_color_mode_suppresses_black_white_only_language() -> None:
    result = SkillPipeline([VisualModeSkill()]).run(
        _context(
            "color",
            "Colorful shounen art with monochrome only and black-and-white only notes.",
        )
    )

    constraints = result.constraints

    assert constraints.visual_mode == "color"
    assert "monochrome only" in constraints.suppressed_phrases
    assert "black-and-white only" in constraints.suppressed_phrases
    assert any(
        "controlled full color" in text for text in constraints.positive_constraints
    )


def test_black_white_mode_suppresses_script_only_full_color_language() -> None:
    result = SkillPipeline([VisualModeSkill()]).run(
        _context(
            "black-white",
            "Classic manga ink linework.",
            script_data={
                "color_mode": "color",
                "rendering_notes": "Use vibrant full color.",
            },
        )
    )

    assert "vibrant full color" in result.constraints.suppressed_phrases
