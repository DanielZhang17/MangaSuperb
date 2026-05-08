from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class DialogueRenderingSkill:
    id = "dialogue_rendering"
    scopes = ("page_render",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return any(panel.dialogue for panel in context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        dialogues = [panel.dialogue or "" for panel in context.panels if panel.dialogue]
        total_length = sum(len(item) for item in dialogues)
        constraints.dialogue_mode = (
            "render_text" if len(dialogues) == 1 and total_length <= 40 else "hybrid"
        )
        if constraints.dialogue_mode == "render_text":
            constraints.add_positive(
                "Render short dialogue in clean speech bubbles near the correct speaker."
            )
        else:
            constraints.add_positive(
                "Use hybrid dialogue rendering: clean speech bubbles, reserved lettering space, "
                "and best-effort short readable text."
            )
