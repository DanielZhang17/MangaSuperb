from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.registry import page_render_skills
from mangasuperb.services.generation_skills.renderer import PromptRenderer


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Renderer Test",
        page_number=1,
        style_notes=(
            "Classic manga black and white linework with vibrant full color watercolor "
            "color wash."
        ),
        script_data={"title": "Renderer Test"},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="Aya points toward the runway.",
                dialogue="Go now!",
                camera_notes="Low angle",
                style_notes="Use rich chromatic lighting.",
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid.",
            notes=None,
            aspect_ratio="2:3",
        ),
        characters=(
            CharacterContext(
                id=1,
                name="Aya",
                role="Protagonist",
                description="A daring pilot.",
                sex="female",
                style_prompt=None,
                optimized_description="Confident pilot with windswept hair.",
                reference_index=1,
                has_reference_image=True,
            ),
        ),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=("Ref 1: Aya. Next inline image corresponds to this character.",),
        previous_context_lines=("Page 0 Panel 1: Aya finds the aircraft.",),
        text_options={"bubble_shape": "round", "bubble_tail": True},
    )


def test_renderer_outputs_ordered_sections_and_suppresses_defeated_phrases() -> None:
    resolved = SkillPipeline(page_render_skills()).run(_context())

    prompt = PromptRenderer().render_page_prompt(resolved)

    expected_order = [
        "Task Intent",
        "Resolved Visual Mode",
        "Character Locks",
        "Layout Discipline",
        "Panel-by-Panel Content",
        "Dialogue Policy",
        "Continuity Context",
        "Hard Constraints",
        "Negative Constraints",
    ]
    positions = [prompt.index(section) for section in expected_order]

    assert positions == sorted(positions)
    assert "black-and-white manga linework" in prompt
    assert "Aya" in prompt
    assert "Go now!" in prompt
    assert "vibrant full color" not in prompt
    assert "watercolor color wash" not in prompt
    assert "rich chromatic lighting" not in prompt


def test_renderer_suppresses_defeated_phrases_across_all_source_sections() -> None:
    context = GenerationContext(
        task_type="page_render",
        comic_title="Renderer Test",
        page_number=1,
        style_notes="Classic manga black and white linework.",
        script_data={"title": "Renderer Test"},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="Aya points toward the runway.",
                dialogue="Go now!",
                camera_notes=None,
                style_notes=None,
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels with vibrant full color accents.",
            notes="Use watercolor color wash in the gutters.",
            aspect_ratio="2:3",
        ),
        characters=(
            CharacterContext(
                id=1,
                name="Aya",
                role="Protagonist",
                description="A daring pilot.",
                sex="female",
                style_prompt=None,
                optimized_description="Confident pilot under rich chromatic lighting.",
                reference_index=1,
                has_reference_image=True,
            ),
        ),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=(
            "Ref 1: Aya. Ignore vibrant full color details in this source note.",
        ),
        previous_context_lines=(
            "Page 0 Panel 1: Aya finds the aircraft under watercolor color wash.",
        ),
        text_options={},
    )

    prompt = PromptRenderer().render_page_prompt(
        SkillPipeline(page_render_skills()).run(context)
    )

    assert "vibrant full color" not in prompt
    assert "watercolor color wash" not in prompt
    assert "rich chromatic lighting" not in prompt


def test_renderer_preserves_page_render_text_customization_options() -> None:
    context = GenerationContext(
        task_type="page_render",
        comic_title="Renderer Test",
        page_number=1,
        style_notes="Classic manga black and white linework.",
        script_data={"title": "Renderer Test"},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="Aya points toward the runway.",
                dialogue="Go now!",
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
        text_options={
            "font_family": "Noto Sans",
            "font_size": "large",
            "bubble_shape": "rect",
            "bubble_tail": False,
        },
    )

    prompt = PromptRenderer().render_page_prompt(
        SkillPipeline(page_render_skills()).run(context)
    )

    assert "Use rectangular speech bubbles for dialogue" in prompt
    assert "Draw speech bubble tails without pointers to speakers" in prompt
    assert "Use Noto Sans font family for text" in prompt
    assert "Use large font size for text" in prompt
