from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class VisualModeSkill:
    id = "visual_mode"
    scopes = ("page_render",)
    priority = 10
    required = True

    _VALID_MODES = frozenset(("black-white", "color"))
    _FULL_COLOR_PHRASES = (
        "vibrant full color",
        "watercolor color wash",
        "full color",
        "rich chromatic lighting",
        "chromatic lighting",
        "gradients",
    )
    _BLACK_WHITE_ONLY_PHRASES = (
        "monochrome only",
        "black-and-white only",
        "black white only",
        "black-white only",
    )

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        visual_mode, source = self._resolve_visual_mode(context)

        constraints.visual_mode = visual_mode
        constraints.visual_mode_source = source
        constraints.metadata["visual_mode"] = {
            "mode": visual_mode,
            "source": source,
        }

        if visual_mode == "black-white":
            self._apply_black_white(context, constraints)
            return

        self._apply_color(context, constraints)

    def _resolve_visual_mode(self, context: GenerationContext) -> tuple[str, str]:
        explicit = self._normalize_mode(context.visual_preferences.get("color_mode"))
        if explicit is not None:
            return explicit, "explicit"

        scripted = self._normalize_mode(context.script_data.get("color_mode"))
        if scripted is not None:
            return scripted, "script"

        return "black-white", "default"

    def _apply_black_white(
        self,
        context: GenerationContext,
        constraints: ConstraintSet,
    ) -> None:
        constraints.add_positive(
            "Use black-and-white manga linework with clear ink values and screentone depth."
        )
        constraints.add_negative(
            "Avoid full-color rendering, color wash effects, and chromatic lighting."
        )
        for phrase in self._detected_phrases(context, self._FULL_COLOR_PHRASES):
            constraints.add_suppressed_phrase(phrase)

    def _apply_color(
        self,
        context: GenerationContext,
        constraints: ConstraintSet,
    ) -> None:
        constraints.add_positive(
            "Use controlled full color while preserving the comic's linework clarity."
        )
        constraints.add_negative(
            "Avoid monochrome-only or black-and-white-only rendering instructions."
        )
        for phrase in self._detected_phrases(context, self._BLACK_WHITE_ONLY_PHRASES):
            constraints.add_suppressed_phrase(phrase)

    def _detected_phrases(
        self,
        context: GenerationContext,
        phrases: Iterable[str],
    ) -> list[str]:
        haystack = "\n".join(self._context_text(context)).lower()
        return [phrase for phrase in phrases if phrase in haystack]

    def _context_text(self, context: GenerationContext) -> list[str]:
        text = [context.style_notes]
        text.extend(self._string_values(context.script_data))
        text.extend(
            panel_text
            for panel in context.panels
            for panel_text in (
                panel.description,
                panel.dialogue,
                panel.camera_notes,
                panel.style_notes,
            )
            if panel_text
        )
        text.extend(
            layout_text
            for layout_text in (
                context.layout.layout_key,
                context.layout.instruction,
                context.layout.notes,
                context.layout.aspect_ratio,
            )
            if layout_text
        )
        return text

    def _string_values(self, value: Any) -> list[str]:
        if isinstance(value, str):
            return [value]
        if isinstance(value, dict):
            return [
                nested
                for item in value.values()
                for nested in self._string_values(item)
            ]
        if isinstance(value, (list, tuple)):
            return [
                nested
                for item in value
                for nested in self._string_values(item)
            ]
        return []

    def _normalize_mode(self, value: Any) -> str | None:
        if not isinstance(value, str):
            return None

        normalized = value.replace("_", "-").strip().lower()
        if normalized in self._VALID_MODES:
            return normalized
        return None
