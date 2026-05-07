from __future__ import annotations

import re

from mangasuperb.services.generation_skills.constraints import ResolvedGenerationContext


class PromptRenderer:
    def render_page_prompt(self, resolved: ResolvedGenerationContext) -> str:
        context = resolved.context
        constraints = resolved.constraints
        suppressed = constraints.suppressed_phrases

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
            self._section(
                "Layout Discipline",
                self._sanitize_lines(constraints.layout_constraints, suppressed),
            ),
            self._section("Panel-by-Panel Content", self._panel_lines(resolved)),
            self._section("Dialogue Policy", self._dialogue_lines(resolved)),
            self._section(
                "Continuity Context",
                self._sanitize_lines(
                    list(context.previous_context_lines)
                    or ["No previous page context."],
                    suppressed,
                ),
            ),
            self._section(
                "Hard Constraints",
                self._sanitize_lines(
                    constraints.positive_constraints + constraints.panel_constraints,
                    suppressed,
                ),
            ),
            self._section(
                "Negative Constraints",
                self._sanitize_lines(
                    constraints.negative_constraints
                    or ["No additional negative constraints."],
                    suppressed,
                ),
            ),
        ]

        if context.reference_notes:
            sections.append(
                self._section(
                    "Character Image References",
                    self._sanitize_lines(list(context.reference_notes), suppressed),
                )
            )

        return "\n\n".join(section for section in sections if section.strip())

    def _section(self, title: str, lines: list[str]) -> str:
        body = "\n".join(f"- {line}" for line in lines if line)
        return f"{title}:\n{body}"

    def _character_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        if not resolved.constraints.character_locks:
            return ["No named character locks supplied."]

        lines: list[str] = []
        suppressed = resolved.constraints.suppressed_phrases
        for lock in resolved.constraints.character_locks:
            ref = f" Ref {lock.reference_index}." if lock.reference_index else ""
            role = f" ({lock.role})" if lock.role else ""
            sex = f" Sex or age cue: {lock.sex}." if lock.sex else ""
            description = self._sanitize(lock.description, suppressed)
            lines.append(f"{lock.name}{role}:{ref} {description}.{sex}".strip())
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
        lines.extend(self._text_option_lines(resolved))
        return lines

    def _text_option_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        options = resolved.context.text_options
        lines: list[str] = []

        bubble_shape = self._string_option(options, "bubble_shape")
        if bubble_shape:
            shape_desc = "rectangular" if bubble_shape == "rect" else "rounded corner"
            lines.append(f"Use {shape_desc} speech bubbles for dialogue")

        bubble_tail = options.get("bubble_tail")
        if isinstance(bubble_tail, bool):
            tail_desc = "with" if bubble_tail else "without"
            lines.append(f"Draw speech bubble tails {tail_desc} pointers to speakers")

        font_family = self._string_option(options, "font_family")
        if font_family:
            lines.append(f"Use {font_family} font family for text")

        font_size = self._string_option(options, "font_size")
        if font_size:
            lines.append(f"Use {font_size} font size for text")

        return lines

    def _sanitize(self, text: str, suppressed_phrases: list[str]) -> str:
        result = text
        for phrase in suppressed_phrases:
            result = re.sub(re.escape(phrase), "", result, flags=re.IGNORECASE)
        result = re.sub(r"\s{2,}", " ", result)
        result = re.sub(r"\s+([.,;:])", r"\1", result)
        return result.strip()

    def _sanitize_lines(self, lines: list[str], suppressed_phrases: list[str]) -> list[str]:
        return [
            sanitized
            for line in lines
            if (sanitized := self._sanitize(line, suppressed_phrases))
        ]

    def _string_option(self, options: object, key: str) -> str | None:
        if not hasattr(options, "get"):
            return None
        value = options.get(key)  # type: ignore[attr-defined]
        if not isinstance(value, str):
            return None
        stripped = value.strip()
        return stripped or None
