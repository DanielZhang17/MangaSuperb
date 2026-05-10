"""Auto/manual preference normalization for creator workflows."""
from __future__ import annotations

import json
from typing import Any

STYLE_PRESETS: tuple[dict[str, Any], ...] = (
    {
        "value": "Classic manga black and white linework.",
        "label": "经典黑白漫画线稿",
        "is_custom": False,
    },
    {
        "value": "High-contrast ink with splashy gradients",
        "label": "高对比墨线 + 渐变",
        "is_custom": False,
    },
    {
        "value": "Moebius-inspired clean lines, minimal shading",
        "label": "莫比乌斯风·干净线条",
        "is_custom": False,
    },
    {
        "value": "Gritty seinen style with textured shading",
        "label": "青年向质感阴影",
        "is_custom": False,
    },
)
LAYOUT_OPTIONS: tuple[str, ...] = ("auto-grid", "grid-2x2", "vertical", "cinematic")
COLOR_MODES: tuple[str, ...] = ("black-white", "color")
ASPECT_RATIOS: tuple[str, ...] = ("16:9", "4:3", "3:4", "1:1", "2:3", "3:2")
FONT_FAMILIES: tuple[str, ...] = ("source-han-sans", "yahei", "heiti", "songti")
FONT_SIZES: tuple[str, ...] = ("18", "20", "22", "24", "28")
BUBBLE_SHAPES: tuple[str, ...] = ("rect", "round")
AI_PROVIDERS: tuple[str, ...] = ("gemini", "third_party")
PREFERENCE_FIELDS: tuple[str, ...] = (
    "character_detection",
    "style",
    "color_mode",
    "aspect_ratio",
    "page_layout",
    "font_family",
    "font_size",
    "bubble_shape",
    "bubble_tail",
    "text_provider",
    "image_provider",
)


def _auto() -> dict[str, str]:
    return {"mode": "auto"}


def available_options() -> dict[str, Any]:
    return {
        "style_presets": [dict(preset) for preset in STYLE_PRESETS],
        "layout_options": list(LAYOUT_OPTIONS),
        "color_modes": list(COLOR_MODES),
        "aspect_ratios": list(ASPECT_RATIOS),
        "font_families": list(FONT_FAMILIES),
        "font_sizes": list(FONT_SIZES),
        "bubble_shapes": list(BUBBLE_SHAPES),
        "ai_providers": list(AI_PROVIDERS),
    }


def default_preferences() -> dict[str, Any]:
    return {
        "version": 2,
        "style_presets": [dict(preset) for preset in STYLE_PRESETS],
        "fields": {field: _auto() for field in PREFERENCE_FIELDS},
    }


def _parse_raw(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return raw if isinstance(raw, dict) else {}


def _normalize_style_presets(raw_presets: Any) -> list[dict[str, Any]]:
    presets = [dict(preset) for preset in STYLE_PRESETS]
    if not isinstance(raw_presets, list):
        return presets

    seen = {preset["value"] for preset in presets}
    for entry in raw_presets:
        if not isinstance(entry, dict):
            continue
        raw_value = entry.get("value") or entry.get("prompt")
        if not isinstance(raw_value, str):
            continue
        value = raw_value.strip()
        if not value:
            continue

        raw_label = entry.get("label") or entry.get("name")
        label = raw_label.strip() if isinstance(raw_label, str) else "Custom Style"
        if not label:
            label = "Custom Style"

        is_custom = bool(entry.get("is_custom")) or value not in {
            preset["value"] for preset in STYLE_PRESETS
        }

        if value in seen:
            for preset in presets:
                if preset["value"] == value:
                    if raw_label:
                        preset["label"] = label
                    if is_custom:
                        preset["is_custom"] = True
                    break
            continue

        presets.append({"value": value, "label": label, "is_custom": is_custom})
        seen.add(value)

    return presets


def _allowed_values(
    field: str,
    *,
    style_presets: list[dict[str, Any]] | None = None,
) -> tuple[Any, ...] | None:
    if field == "style":
        presets = style_presets if style_presets is not None else list(STYLE_PRESETS)
        return tuple(preset["value"] for preset in presets)
    if field == "page_layout":
        return LAYOUT_OPTIONS
    if field == "color_mode":
        return COLOR_MODES
    if field == "aspect_ratio":
        return ASPECT_RATIOS
    if field == "font_family":
        return FONT_FAMILIES
    if field == "font_size":
        return FONT_SIZES
    if field == "bubble_shape":
        return BUBBLE_SHAPES
    if field in {"text_provider", "image_provider"}:
        return AI_PROVIDERS
    if field == "character_detection":
        return ("enabled",)
    if field == "bubble_tail":
        return (True, False)
    return None


def _normalize_field(
    field: str,
    raw_value: Any,
    *,
    style_presets: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not isinstance(raw_value, dict):
        return _auto()
    if raw_value.get("mode") != "manual":
        return _auto()

    value = raw_value.get("value")
    if field == "bubble_tail" and not isinstance(value, bool):
        return _auto()

    allowed = _allowed_values(field, style_presets=style_presets)
    if allowed is None or value not in allowed:
        return _auto()
    return {"mode": "manual", "value": value}


def normalize_preferences(raw: Any) -> dict[str, Any]:
    parsed = _parse_raw(raw)
    normalized = default_preferences()
    normalized["style_presets"] = _normalize_style_presets(parsed.get("style_presets"))

    fields = parsed.get("fields")
    if isinstance(fields, dict):
        for field in PREFERENCE_FIELDS:
            normalized["fields"][field] = _normalize_field(
                field,
                fields.get(field),
                style_presets=normalized["style_presets"],
            )
        return normalized

    legacy_map = {
        "selected_style": "style",
        "default_layout": "page_layout",
        "color_mode": "color_mode",
    }
    for legacy_key, field in legacy_map.items():
        if legacy_key in parsed:
            normalized["fields"][field] = _normalize_field(
                field,
                {"mode": "manual", "value": parsed.get(legacy_key)},
                style_presets=normalized["style_presets"],
            )
    return normalized


def apply_preferences_update(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = normalize_preferences(current)
    if "style_presets" in updates:
        merged["style_presets"] = _normalize_style_presets(updates.get("style_presets"))
        merged["fields"]["style"] = _normalize_field(
            "style",
            merged["fields"].get("style"),
            style_presets=merged["style_presets"],
        )

    incoming = updates.get("fields")
    if isinstance(incoming, dict):
        for field in PREFERENCE_FIELDS:
            if field in incoming:
                merged["fields"][field] = _normalize_field(
                    field,
                    incoming[field],
                    style_presets=merged["style_presets"],
                )
    return merged
