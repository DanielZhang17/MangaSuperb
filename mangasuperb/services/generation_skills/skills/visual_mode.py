from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class VisualModeSkill:
    id = "visual_mode"
    scopes = ("page_render",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return False

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        return None
