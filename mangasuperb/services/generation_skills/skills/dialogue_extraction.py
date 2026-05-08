from __future__ import annotations

import re

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class DialogueExtractionSkill:
    id = "dialogue_extraction"
    scopes = ("shot_split",)
    priority = 20
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        drafts = constraints.metadata.get("shot_drafts", [])
        for draft in drafts:
            if draft.get("dialogue"):
                continue
            match = re.search(r"[“\"]([^”\"]+)[”\"]", draft.get("description", ""))
            if match:
                draft["dialogue"] = match.group(1).strip()
                continue
            entry = draft.get("entry", {})
            dialogue = entry.get("dialogue") if isinstance(entry, dict) else None
            if isinstance(dialogue, str) and dialogue.strip():
                draft["dialogue"] = dialogue.strip()
