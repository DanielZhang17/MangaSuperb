from __future__ import annotations

from typing import Any

from mangasuperb.services.generation_skills.context import GenerationContext

VALID_VISUAL_MODES = frozenset(("black-white", "color"))


def normalize_visual_mode(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.replace("_", "-").strip().lower()
    if normalized in VALID_VISUAL_MODES:
        return normalized
    return None


def resolve_visual_mode(context: GenerationContext) -> tuple[str, str]:
    explicit = normalize_visual_mode(context.visual_preferences.get("color_mode"))
    if explicit is not None:
        return explicit, "explicit"

    scripted = normalize_visual_mode(context.script_data.get("color_mode"))
    if scripted is not None:
        return scripted, "script"

    return "black-white", "default"
