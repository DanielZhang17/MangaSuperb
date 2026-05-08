from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet, DialogueLine
from mangasuperb.services.generation_skills.context import GenerationContext

SHORT_DIALOGUE_LIMIT = 28


class DialogueRenderingSkill:
    id = "dialogue_rendering"
    scopes = ("page_render",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        dialogue_lines = [
            DialogueLine(
                panel_number=panel.panel_number or panel.sequence_index,
                text=text,
            )
            for panel in context.panels
            if panel.dialogue and (text := panel.dialogue.strip())
        ]
        constraints.dialogue_lines.extend(dialogue_lines)

        if not dialogue_lines:
            self._set_mode(constraints, mode="hybrid", line_count=0)
            return

        if len(dialogue_lines) == 1 and len(dialogue_lines[0].text) <= SHORT_DIALOGUE_LIMIT:
            self._apply_short_dialogue(dialogue_lines[0], constraints)
            return

        self._apply_hybrid_dialogue(dialogue_lines, constraints)

    def _apply_short_dialogue(
        self,
        dialogue_line: DialogueLine,
        constraints: ConstraintSet,
    ) -> None:
        self._set_mode(constraints, mode="render_text", line_count=1)
        constraints.add_positive(
            "For panel "
            f"{dialogue_line.panel_number}, render the exact short dialogue text "
            f'"{dialogue_line.text}" in a clean, readable speech balloon.'
        )
        constraints.add_negative(
            "Avoid misspelled, garbled, extra, or invented dialogue text."
        )

    def _apply_hybrid_dialogue(
        self,
        dialogue_lines: list[DialogueLine],
        constraints: ConstraintSet,
    ) -> None:
        self._set_mode(constraints, mode="hybrid", line_count=len(dialogue_lines))
        constraints.add_positive(
            "Use a best-effort attempt to render the provided dialogue text while "
            "prioritizing composition and character acting."
        )
        constraints.add_positive(
            "Reserve clean readable balloon space for each dialogue line and keep "
            "balloons associated with their source panels."
        )
        constraints.add_negative(
            "Avoid garbled lettering, extra dialogue, invented speech, or text that "
            "contradicts the provided dialogue lines."
        )

    def _set_mode(self, constraints: ConstraintSet, *, mode: str, line_count: int) -> None:
        constraints.dialogue_mode = mode
        constraints.metadata["dialogue_mode"] = mode
        constraints.metadata["dialogue_line_count"] = line_count
