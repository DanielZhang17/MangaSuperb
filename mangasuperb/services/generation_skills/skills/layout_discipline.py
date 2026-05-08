from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class LayoutDisciplineSkill:
    id = "layout_discipline"
    scopes = ("page_render",)
    priority = 50
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return context.layout is not None

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        panel_count = len(context.panels)
        aspect_ratio = context.layout.aspect_ratio if context.layout else None
        constraints.add_layout_constraint(f"Preserve exactly {panel_count} panel(s).")
        constraints.add_layout_constraint(
            "Use clear panel boundaries, gutters, and manga reading order."
        )
        if aspect_ratio:
            constraints.add_layout_constraint(f"Target aspect ratio: {aspect_ratio}.")
