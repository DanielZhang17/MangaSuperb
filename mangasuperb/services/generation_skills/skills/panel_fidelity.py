from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class PanelFidelitySkill:
    id = "panel_fidelity"
    scopes = ("page_render",)
    priority = 40
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        constraints.add_panel_constraint("Current page panels override previous page context.")
        constraints.add_panel_constraint("Focus only on the panels described for this page.")
