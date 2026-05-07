from __future__ import annotations

import re

from mangasuperb.services.generation_skills.constraints import ResolvedGenerationContext


class PromptRenderer:
    def render_page_prompt(self, resolved: ResolvedGenerationContext) -> str:
        context = resolved.context
        constraints = resolved.constraints

        sections = [
            self._section(
                "Task Intent",
                [
                    f'Render page {context.page_number} of the manga "{context.comic_title}".',
                    "Output a finished manga page, not a concept sheet or poster.",
                    "Overall style: "
                    f"{self._sanitize(context.style_notes, constraints.suppressed_phrases)}",
                ],
            ),
            self._section(
                "Resolved Visual Mode",
                [
                    f"Visual mode: {constraints.visual_mode}",
                    f"Source: {constraints.visual_mode_source}",
                ],
            ),
            self._section("Character Locks", self._character_lines(resolved)),
            self._section("Layout Discipline", constraints.layout_constraints),
            self._section("Panel-by-Panel Content", self._panel_lines(resolved)),
            self._section("Dialogue Policy", self._dialogue_lines(resolved)),
            self._section(
                "Continuity Context",
                list(context.previous_context_lines) or ["No previous page context."],
            ),
            self._section(
                "Hard Constraints",
                constraints.positive_constraints + constraints.panel_constraints,
            ),
            self._section(
                "Negative Constraints",
                constraints.negative_constraints
                or ["No additional negative constraints."],
            ),
        ]

        if context.reference_notes:
            sections.append(
                self._section("Character Image References", list(context.reference_notes))
            )

        return "\n\n".join(section for section in sections if section.strip())

    def _section(self, title: str, lines: list[str]) -> str:
        body = "\n".join(f"- {line}" for line in lines if line)
        return f"{title}:\n{body}"

    def _character_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        if not resolved.constraints.character_locks:
            return ["No named character locks supplied."]

        lines: list[str] = []
        for lock in resolved.constraints.character_locks:
            ref = f" Ref {lock.reference_index}." if lock.reference_index else ""
            role = f" ({lock.role})" if lock.role else ""
            sex = f" Sex or age cue: {lock.sex}." if lock.sex else ""
            lines.append(f"{lock.name}{role}:{ref} {lock.description}.{sex}".strip())
        return lines

    def _panel_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        suppressed = resolved.constraints.suppressed_phrases
        lines: list[str] = []
        for panel in resolved.context.panels:
            parts = [
                f"Panel {panel.panel_number}: "
                f"{self._sanitize(panel.description, suppressed)}"
            ]
            if panel.dialogue:
                parts.append(f'Dialogue: "{panel.dialogue.strip()}"')
            if panel.camera_notes:
                parts.append(f"Camera: {self._sanitize(panel.camera_notes, suppressed)}")
            if panel.style_notes:
                parts.append(f"Style: {self._sanitize(panel.style_notes, suppressed)}")
            lines.append(" ".join(parts))
        return lines

    def _dialogue_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        mode = resolved.constraints.dialogue_mode or "hybrid"
        lines = [f"Mode: {mode}"]
        for dialogue in resolved.constraints.dialogue_lines:
            lines.append(f'Panel {dialogue.panel_number}: "{dialogue.text}"')
        if len(lines) == 1:
            lines.append(
                "No dialogue on this page; preserve clean balloon space only when the "
                "panel composition calls for it."
            )
        return lines

    def _sanitize(self, text: str, suppressed_phrases: list[str]) -> str:
        result = text
        for phrase in suppressed_phrases:
            result = re.sub(re.escape(phrase), "", result, flags=re.IGNORECASE)
        result = re.sub(r"\s{2,}", " ", result)
        result = re.sub(r"\s+([.,;:])", r"\1", result)
        return result.strip()
