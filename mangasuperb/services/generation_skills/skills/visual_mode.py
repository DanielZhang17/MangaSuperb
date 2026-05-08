from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class VisualModeSkill:
    id = "visual_mode"
    scopes = ("page_render",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raw = str(context.visual_preferences.get("color_mode", "black-white")).strip().lower()
        mode = "color" if raw == "color" else "black-white"
        constraints.visual_mode = mode
        if mode == "black-white":
            constraints.add_positive(
                "Visual mode: black-white manga linework, ink, screentone, grayscale contrast."
            )
            constraints.add_negative(
                "Avoid full-color rendering language, chromatic gradients, and vibrant color wash."
            )
        else:
            constraints.add_positive(
                "Visual mode: full-color manga illustration with controlled lighting."
            )
