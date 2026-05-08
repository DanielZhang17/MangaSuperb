from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class CharacterConsistencySkill:
    id = "character_consistency"
    scopes = ("page_render",)
    priority = 20
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.characters or context.reference_notes)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        for character in context.characters:
            parts = [character.name]
            if character.role:
                parts.append(f"role: {character.role}")
            description = character.optimized_description or character.description
            if description:
                parts.append(description)
            if character.reference_note:
                parts.append(character.reference_note)
            constraints.add_character_lock("; ".join(parts))
        if context.reference_notes:
            constraints.add_positive(
                "Reference images outrank conflicting text descriptions for character appearance."
            )
