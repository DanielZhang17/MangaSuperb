from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class CameraStyleEnrichmentSkill:
    id = "camera_style_enrichment"
    scopes = ("shot_split",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        for draft in constraints.metadata.get("shot_drafts", []):
            entry = draft.get("entry", {})
            if not isinstance(entry, dict):
                entry = {}
            if not draft.get("camera_notes"):
                camera = entry.get("camera") or entry.get("camera_notes")
                if isinstance(camera, str) and camera.strip():
                    draft["camera_notes"] = camera.strip()
            if not draft.get("style_notes"):
                style = entry.get("visual_notes") or context.style_notes
                if isinstance(style, str) and style.strip():
                    draft["style_notes"] = style.strip()
