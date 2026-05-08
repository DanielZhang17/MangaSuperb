from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext, ShotDraft


class PanelAssignmentSkill:
    id = "panel_assignment"
    scopes = ("shot_split",)
    priority = 40
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        panels_per_page = int(context.text_options.get("panels_per_page", 4))
        resolved: list[ShotDraft] = []
        for index, draft in enumerate(constraints.metadata.get("shot_drafts", []), start=1):
            page_number = (index - 1) // panels_per_page + 1
            panel_number = ((index - 1) % panels_per_page) + 1
            resolved.append(
                ShotDraft(
                    sequence_index=int(draft["sequence_index"]),
                    title=str(draft["title"]),
                    description=str(draft["description"]),
                    dialogue=draft.get("dialogue"),
                    camera_notes=draft.get("camera_notes"),
                    style_notes=draft.get("style_notes"),
                    page_number=page_number,
                    panel_number=panel_number,
                )
            )
        constraints.metadata["shot_drafts"] = tuple(resolved)
