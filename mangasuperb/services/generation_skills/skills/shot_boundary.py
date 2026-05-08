from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class ShotBoundarySkill:
    id = "shot_boundary"
    scopes = ("shot_split",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        drafts: list[dict] = []
        panel_payload = context.script_data.get("panels")
        payload_items = panel_payload if isinstance(panel_payload, list) else []
        for index, panel in enumerate(context.panels, start=1):
            entry = payload_items[index - 1] if index <= len(payload_items) else {}
            if not isinstance(entry, dict):
                entry = {}
            drafts.append(
                {
                    "sequence_index": panel.sequence_index,
                    "title": panel.source_title or f"Section {index}",
                    "description": panel.description,
                    "dialogue": panel.dialogue,
                    "camera_notes": panel.camera_notes,
                    "style_notes": panel.style_notes,
                    "entry": entry,
                }
            )
        constraints.metadata["shot_drafts"] = drafts
