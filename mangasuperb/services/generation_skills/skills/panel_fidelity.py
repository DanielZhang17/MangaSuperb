from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class PanelFidelitySkill:
    id = "panel_fidelity"
    scopes = ("page_render",)
    priority = 50
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        constraints.panel_constraints.append(
            f"Focus only on current page {context.page_number}; render the panels listed "
            "for this page."
        )
        for panel in context.panels:
            constraints.panel_constraints.append(
                f"Panel {panel.panel_number}: keep this panel scoped to sequence "
                f"{panel.sequence_index}."
            )
        if context.previous_context_lines:
            constraints.add_positive(
                "Previous page context is continuity only and must not override current "
                "panel descriptions, dialogue, camera notes, or layout."
            )
        constraints.metadata["panel_fidelity_panel_count"] = len(context.panels)
