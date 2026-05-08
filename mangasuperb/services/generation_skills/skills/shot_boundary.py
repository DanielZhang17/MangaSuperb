from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class ShotBoundarySkill:
    id = "shot_boundary"
    scopes = ("shot_split",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return False

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        return None
