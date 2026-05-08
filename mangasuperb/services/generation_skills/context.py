"""Structured inputs for runtime generation skills."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
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
    id: int | None = None
    sex: str | None = None
    reference_index: int | None = None
    has_reference_image: bool = False


@dataclass(frozen=True)
class GenerationContext:
    task_type: str
    comic_title: str
    page_number: int | None
    style_notes: str
    comic_id: int | None = None
    story: str = ""
    script_data: Mapping[str, Any] = field(default_factory=dict)
    panels: tuple[PanelContext, ...] = ()
    layout: LayoutContext | None = None
    characters: tuple[CharacterContext, ...] = ()
    visual_preferences: Mapping[str, Any] = field(default_factory=dict)
    reference_notes: tuple[str, ...] = ()
    previous_context_lines: tuple[str, ...] = ()
    text_options: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "script_data", _freeze_mapping(self.script_data))
        object.__setattr__(self, "panels", tuple(self.panels))
        object.__setattr__(self, "characters", tuple(self.characters))
        object.__setattr__(
            self,
            "visual_preferences",
            _freeze_mapping(self.visual_preferences),
        )
        object.__setattr__(self, "reference_notes", tuple(self.reference_notes))
        object.__setattr__(
            self,
            "previous_context_lines",
            tuple(self.previous_context_lines),
        )
        object.__setattr__(self, "text_options", _freeze_mapping(self.text_options))


@dataclass(frozen=True)
class ShotDraft:
    sequence_index: int
    title: str
    description: str
    dialogue: str | None
    camera_notes: str | None
    style_notes: str | None
    page_number: int
    panel_number: int


def _freeze_mapping(mapping: Mapping[str, Any]) -> Mapping[str, Any]:
    return MappingProxyType(dict(mapping))
