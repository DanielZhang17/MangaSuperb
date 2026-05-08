"""Built-in generation skill registry."""
from __future__ import annotations

from mangasuperb.services.generation_skills.pipeline import GenerationSkill


def get_builtin_skills(task_type: str) -> tuple[GenerationSkill, ...]:
    from mangasuperb.services.generation_skills.skills.camera_style_enrichment import (
        CameraStyleEnrichmentSkill,
    )
    from mangasuperb.services.generation_skills.skills.character_consistency import (
        CharacterConsistencySkill,
    )
    from mangasuperb.services.generation_skills.skills.dialogue_extraction import (
        DialogueExtractionSkill,
    )
    from mangasuperb.services.generation_skills.skills.dialogue_rendering import (
        DialogueRenderingSkill,
    )
    from mangasuperb.services.generation_skills.skills.layout_discipline import (
        LayoutDisciplineSkill,
    )
    from mangasuperb.services.generation_skills.skills.panel_assignment import (
        PanelAssignmentSkill,
    )
    from mangasuperb.services.generation_skills.skills.panel_fidelity import (
        PanelFidelitySkill,
    )
    from mangasuperb.services.generation_skills.skills.shot_boundary import ShotBoundarySkill
    from mangasuperb.services.generation_skills.skills.visual_mode import VisualModeSkill

    skills: tuple[GenerationSkill, ...] = (
        ShotBoundarySkill(),
        DialogueExtractionSkill(),
        CameraStyleEnrichmentSkill(),
        PanelAssignmentSkill(),
        VisualModeSkill(),
        CharacterConsistencySkill(),
        DialogueRenderingSkill(),
        PanelFidelitySkill(),
        LayoutDisciplineSkill(),
    )
    return tuple(skill for skill in skills if task_type in skill.scopes)
