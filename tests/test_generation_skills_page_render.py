from __future__ import annotations

from types import SimpleNamespace

from mangasuperb.services.generation_skills.page_render import build_page_generation_context


def test_build_page_generation_context_normalizes_model_objects() -> None:
    character = SimpleNamespace(
        id=10,
        name="Aya",
        description="A daring pilot.",
        sex="female",
        style_prompt="windswept hair",
        optimized_description="Confident pilot.",
        image_url="characters/aya.png",
    )
    link = SimpleNamespace(character=character, role="Protagonist", order_index=1)
    comic = SimpleNamespace(
        title="Adapter Test",
        style_description="Classic manga black and white linework.",
        character_links=[link],
    )
    panel = SimpleNamespace(
        panel_number=1,
        sequence_index=1,
        description="Aya enters the hangar.",
        dialogue="Ready.",
        camera_notes="Low angle",
        style_notes="Strong silhouette",
    )

    context = build_page_generation_context(
        comic=comic,
        script_data={"title": "Script Title", "style_notes": "Script style"},
        page_number=3,
        layout_key="grid-2x2",
        layout_instruction="Arrange panels in a 2x2 grid.",
        layout_notes="Keep gutters clear.",
        panels=[panel],
        color_mode="black-white",
        aspect_ratio="2:3",
        reference_notes=["Ref 1: Aya. Next inline image corresponds to this character."],
        previous_context_lines=["Page 2 Panel 1: Aya starts the engine."],
        text_options={"bubble_shape": "round"},
    )

    assert context.comic_title == "Script Title"
    assert context.page_number == 3
    assert context.layout.layout_key == "grid-2x2"
    assert context.panels[0].dialogue == "Ready."
    assert context.characters[0].name == "Aya"
    assert context.characters[0].reference_index == 1
    assert context.characters[0].has_reference_image is True
    assert context.reference_notes == (
        "Ref 1: Aya. Next inline image corresponds to this character.",
    )
