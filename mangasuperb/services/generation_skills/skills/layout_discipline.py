from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class LayoutDisciplineSkill:
    id = "layout_discipline"
    scopes = ("page_render",)
    priority = 40
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        panel_count = len(context.panels)
        layout = context.layout
        if layout is None:
            constraints.layout_constraints.append(f"Preserve panel count: {panel_count}.")
            constraints.add_negative("Avoid collapsing the page into a single poster-style image.")
            constraints.metadata["panel_count"] = panel_count
            return

        constraints.layout_constraints.extend(
            [
                f"Preserve panel count: {panel_count}.",
                f"Preserve page aspect ratio: {layout.aspect_ratio}.",
                f"Use layout key: {layout.layout_key}.",
                "Keep clear panel boundaries, consistent gutters, and manga reading order.",
                layout.instruction,
            ]
        )
        if layout.notes:
            constraints.layout_constraints.append(f"Layout notes: {layout.notes}")
        constraints.add_negative("Avoid collapsing the page into a single poster-style image.")
        constraints.metadata["layout_key"] = layout.layout_key
        constraints.metadata["panel_count"] = panel_count
