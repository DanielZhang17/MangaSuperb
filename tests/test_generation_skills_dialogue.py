from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.skills.dialogue_rendering import (
    DialogueRenderingSkill,
)


def _context(dialogues: list[str | None]) -> GenerationContext:
    panels = tuple(
        PanelContext(
            panel_number=index,
            sequence_index=index,
            description=f"Panel {index} action.",
            dialogue=dialogue,
            camera_notes=None,
            style_notes=None,
        )
        for index, dialogue in enumerate(dialogues, start=1)
    )
    return GenerationContext(
        task_type="page_render",
        comic_title="Dialogue Test",
        page_number=1,
        style_notes="Classic manga black and white linework.",
        script_data={},
        panels=panels,
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


def test_short_single_dialogue_uses_render_text_mode() -> None:
    result = SkillPipeline([DialogueRenderingSkill()]).run(_context(["Go now!"]))

    assert result.constraints.dialogue_mode == "render_text"
    assert [(line.panel_number, line.text) for line in result.constraints.dialogue_lines] == [
        (1, "Go now!")
    ]
    assert any(
        "render the exact short dialogue text" in text
        for text in result.constraints.positive_constraints
    )


def test_long_or_multi_panel_dialogue_uses_hybrid_mode_and_preserves_text() -> None:
    result = SkillPipeline([DialogueRenderingSkill()]).run(
        _context(
            [
                "I know the city remembers every promise we broke tonight.",
                "Then we make one promise it cannot erase.",
            ]
        )
    )

    assert result.constraints.dialogue_mode == "hybrid"
    assert [line.text for line in result.constraints.dialogue_lines] == [
        "I know the city remembers every promise we broke tonight.",
        "Then we make one promise it cannot erase.",
    ]
    assert any("best-effort attempt" in text for text in result.constraints.positive_constraints)
    assert any(
        "clean readable balloon space" in text
        for text in result.constraints.positive_constraints
    )


def test_no_dialogue_leaves_default_hybrid_policy() -> None:
    result = SkillPipeline([DialogueRenderingSkill()]).run(_context([None, ""]))

    assert result.constraints.dialogue_mode == "hybrid"
    assert result.constraints.dialogue_lines == []
