"""Structured inputs for runtime generation skills."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class PanelContext:
    panel_number: int | None
    sequence_index: int
    description: str
    dialogue: str | None = None
    camera_notes: str | None = None
    style_notes: str | None = None
    source_title: str | None = None


@dataclass(frozen=True)
class LayoutContext:
    layout_key: str
    instruction: str
    notes: str | None = None
    aspect_ratio: str | None = None


@dataclass(frozen=True)
class CharacterContext:
    name: str
    role: str | None = None
    description: str | None = None
    optimized_description: str | None = None
    style_prompt: str | None = None
    reference_note: str | None = None


@dataclass(frozen=True)
class GenerationContext:
    task_type: str
    comic_id: int | None
    comic_title: str
    page_number: int | None
    story: str
    style_notes: str
    script_data: dict[str, Any] = field(default_factory=dict)
    panels: tuple[PanelContext, ...] = ()
    layout: LayoutContext | None = None
    characters: tuple[CharacterContext, ...] = ()
    visual_preferences: dict[str, Any] = field(default_factory=dict)
    reference_notes: tuple[str, ...] = ()
    previous_context_lines: tuple[str, ...] = ()
    text_options: dict[str, Any] = field(default_factory=dict)
