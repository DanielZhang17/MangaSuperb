from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class DialogueRenderingSkill:
    id = "dialogue_rendering"
    scopes = ("page_render",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return False

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        return None
