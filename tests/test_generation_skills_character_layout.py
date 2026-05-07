from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.skills.character_consistency import (
    CharacterConsistencySkill,
)
from mangasuperb.services.generation_skills.skills.layout_discipline import (
    LayoutDisciplineSkill,
)
from mangasuperb.services.generation_skills.skills.panel_fidelity import PanelFidelitySkill


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Skill Test",
        page_number=2,
        style_notes="Classic manga black and white linework.",
        script_data={},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=5,
                description="Aya enters the hangar.",
                dialogue="We fly at dawn.",
                camera_notes="Low angle",
                style_notes="Strong silhouette",
            ),
            PanelContext(
                panel_number=2,
                sequence_index=6,
                description="Ben checks the engine.",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid, reading right-to-left.",
            notes="Do not make a poster.",
            aspect_ratio="2:3",
        ),
        characters=(
            CharacterContext(
                id=1,
                name="Aya",
                role="Protagonist",
                description="A daring pilot with a signature flight jacket.",
                sex="female",
                style_prompt="windswept hair",
                optimized_description=(
                    "Confident ace pilot with windswept hair and a battered bomber jacket."
                ),
                reference_index=1,
                has_reference_image=True,
            ),
        ),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=("Ref 1: Aya. Next inline image corresponds to this character.",),
        previous_context_lines=("Page 1 Panel 1: Aya finds the old aircraft.",),
        text_options={},
    )


def test_character_consistency_creates_reference_prioritized_locks() -> None:
    result = SkillPipeline([CharacterConsistencySkill()]).run(_context())

    assert len(result.constraints.character_locks) == 1
    lock = result.constraints.character_locks[0]
    assert lock.name == "Aya"
    assert lock.role == "Protagonist"
    assert lock.reference_index == 1
    assert lock.has_reference_image is True
    assert "battered bomber jacket" in lock.description
    assert any(
        "Reference images outrank text descriptions" in text
        for text in result.constraints.positive_constraints
    )


def test_layout_discipline_emits_page_layout_constraints() -> None:
    result = SkillPipeline([LayoutDisciplineSkill()]).run(_context())

    assert any("panel count: 2" in text for text in result.constraints.layout_constraints)
    assert any("aspect ratio: 2:3" in text for text in result.constraints.layout_constraints)
    assert any("grid-2x2" in text for text in result.constraints.layout_constraints)
    assert any("gutter" in text.lower() for text in result.constraints.layout_constraints)


def test_panel_fidelity_scopes_current_page_and_previous_context() -> None:
    result = SkillPipeline([PanelFidelitySkill()]).run(_context())

    assert any("current page 2" in text for text in result.constraints.panel_constraints)
    assert any("Panel 1" in text for text in result.constraints.panel_constraints)
    assert any(
        "Previous page context is continuity only" in text
        for text in result.constraints.positive_constraints
    )
