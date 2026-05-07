from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any


@dataclass(frozen=True)
class PanelContext:
    panel_number: int
    sequence_index: int
    description: str
    dialogue: str | None
    camera_notes: str | None
    style_notes: str | None


@dataclass(frozen=True)
class CharacterContext:
    id: int | None
    name: str
    role: str | None
    description: str
    sex: str | None
    style_prompt: str | None
    optimized_description: str | None
    reference_index: int | None = None
    has_reference_image: bool = False


@dataclass(frozen=True)
class LayoutContext:
    layout_key: str
    instruction: str
    notes: str | None
    aspect_ratio: str


@dataclass(frozen=True)
class GenerationContext:
    task_type: str
    comic_title: str
    page_number: int
    style_notes: str
    script_data: Mapping[str, Any]
    panels: tuple[PanelContext, ...]
    layout: LayoutContext
    characters: tuple[CharacterContext, ...]
    visual_preferences: Mapping[str, Any]
    reference_notes: tuple[str, ...]
    previous_context_lines: tuple[str, ...]
    text_options: Mapping[str, Any]

    def __post_init__(self) -> None:
        object.__setattr__(self, "script_data", _freeze_mapping(self.script_data))
        object.__setattr__(
            self,
            "visual_preferences",
            _freeze_mapping(self.visual_preferences),
        )
        object.__setattr__(self, "text_options", _freeze_mapping(self.text_options))


def _freeze_mapping(mapping: Mapping[str, Any]) -> Mapping[str, Any]:
    return MappingProxyType(dict(mapping))
