from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class CameraStyleEnrichmentSkill:
    id = "camera_style_enrichment"
    scopes = ("shot_split",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return False

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        return None
