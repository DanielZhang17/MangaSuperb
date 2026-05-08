"""Built-in generation skill registry."""
from __future__ import annotations

from mangasuperb.services.generation_skills.pipeline import GenerationSkill
from mangasuperb.services.generation_skills.skills import (
    CameraStyleEnrichmentSkill,
    CharacterConsistencySkill,
    DialogueExtractionSkill,
    DialogueRenderingSkill,
    LayoutDisciplineSkill,
    PanelAssignmentSkill,
    PanelFidelitySkill,
    ShotBoundarySkill,
    VisualModeSkill,
)


def shot_split_skills() -> tuple[GenerationSkill, ...]:
    return (
        ShotBoundarySkill(),
        DialogueExtractionSkill(),
        CameraStyleEnrichmentSkill(),
        PanelAssignmentSkill(),
    )


def page_render_skills() -> tuple[GenerationSkill, ...]:
    return (
        VisualModeSkill(),
        CharacterConsistencySkill(),
        DialogueRenderingSkill(),
        LayoutDisciplineSkill(),
        PanelFidelitySkill(),
    )


def get_builtin_skills(task_type: str) -> tuple[GenerationSkill, ...]:
    skills = (*shot_split_skills(), *page_render_skills())
    return tuple(skill for skill in skills if task_type in skill.scopes)
