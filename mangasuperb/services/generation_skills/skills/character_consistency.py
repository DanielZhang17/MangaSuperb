from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import CharacterLock, ConstraintSet
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
            description = (
                character.optimized_description
                or character.description
                or character.style_prompt
                or "No character description supplied."
            ).strip()
            constraints.character_locks.append(
                CharacterLock(
                    name=character.name,
                    role=character.role,
                    description=description,
                    sex=character.sex,
                    reference_index=character.reference_index,
                    has_reference_image=character.has_reference_image,
                )
            )

        constraints.add_positive(
            "Reference images outrank text descriptions for character identity, face, "
            "hairstyle, body type, clothing identity, age, and sex presentation."
        )
        constraints.add_positive(
            "Keep recurring characters visually consistent across all panels on this page."
        )
        constraints.add_negative(
            "Do not invent extra primary characters unless the current panel description "
            "requires them."
        )
        constraints.metadata["character_lock_count"] = len(constraints.character_locks)
        constraints.metadata["reference_note_count"] = len(context.reference_notes)
