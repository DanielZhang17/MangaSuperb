from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.page_render import render_page_prompt


def _context(color_mode: str = "black-white") -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_id=1,
        comic_title="Sky City",
        page_number=1,
        story="A pilot enters a neon city.",
        style_notes="Vibrant full color with classic manga linework.",
        script_data={"title": "Sky City"},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="Aya pilots a damaged airship through smoke.",
                dialogue="Hold on!",
                camera_notes="wide establishing shot",
                style_notes="rich chromatic lighting",
                source_title="Arrival",
            ),
        ),
        layout=LayoutContext(
            layout_key="auto-grid",
            instruction="Arrange panels evenly in a balanced manga grid.",
            notes=None,
            aspect_ratio="16:9",
        ),
        characters=(
            CharacterContext(
                name="Aya",
                role="Protagonist",
                description="A daring pilot.",
                optimized_description="Windswept pilot with a battered bomber jacket.",
                style_prompt="shounen hero",
                reference_note="Reference image 1 shows Aya.",
            ),
        ),
        visual_preferences={"color_mode": color_mode},
        reference_notes=("Reference image 1 shows Aya.",),
        previous_context_lines=("Page 0 Panel 1: Aya starts the engine.",),
        text_options={},
    )


def test_page_render_prompt_resolves_black_white_visual_conflict() -> None:
    prompt, metadata = render_page_prompt(_context("black-white"))

    assert "Visual mode: black-white manga linework" in prompt
    assert "Avoid full-color rendering language" in prompt
    assert "vibrant full color" not in prompt.lower()
    assert metadata["visual_mode"] == "black-white"


def test_page_render_prompt_includes_character_dialogue_layout_and_panel_scope() -> None:
    prompt, metadata = render_page_prompt(_context("black-white"))

    assert "Character locks" in prompt
    assert "Aya" in prompt
    assert "Protagonist" in prompt
    assert "Panel 1: Aya pilots a damaged airship through smoke." in prompt
    assert "Dialogue: Hold on!" in prompt
    assert "Layout constraints" in prompt
    assert "panel boundaries" in prompt
    assert "Current page panels override previous page context" in prompt
    assert metadata["dialogue_mode"] in {"render_text", "hybrid"}
