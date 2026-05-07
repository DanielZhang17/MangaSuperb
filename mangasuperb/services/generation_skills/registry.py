from __future__ import annotations

from mangasuperb.services.generation_skills.pipeline import GenerationSkill
from mangasuperb.services.generation_skills.skills import (
    CharacterConsistencySkill,
    DialogueRenderingSkill,
    LayoutDisciplineSkill,
    PanelFidelitySkill,
    VisualModeSkill,
)


def page_render_skills() -> tuple[GenerationSkill, ...]:
    return (
        VisualModeSkill(),
        CharacterConsistencySkill(),
        DialogueRenderingSkill(),
        LayoutDisciplineSkill(),
        PanelFidelitySkill(),
    )
