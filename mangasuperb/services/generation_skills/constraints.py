from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from mangasuperb.services.generation_skills.context import GenerationContext


@dataclass(frozen=True)
class CharacterLock:
    name: str
    role: str | None
    description: str
    sex: str | None
    reference_index: int | None
    has_reference_image: bool


@dataclass(frozen=True)
class DialogueLine:
    panel_number: int
    text: str


@dataclass
class ConstraintSet:
    visual_mode: str | None = None
    visual_mode_source: str | None = None
    dialogue_mode: str | None = None
    character_locks: list[CharacterLock] = field(default_factory=list)
    dialogue_lines: list[DialogueLine] = field(default_factory=list)
    layout_constraints: list[str] = field(default_factory=list)
    panel_constraints: list[str] = field(default_factory=list)
    positive_constraints: list[str] = field(default_factory=list)
    negative_constraints: list[str] = field(default_factory=list)
    suppressed_phrases: list[str] = field(default_factory=list)
    applied_skills: list[str] = field(default_factory=list)
    skipped_skills: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def add_positive(self, text: str) -> None:
        _append_unique(self.positive_constraints, text)

    def add_negative(self, text: str) -> None:
        _append_unique(self.negative_constraints, text)

    def add_suppressed_phrase(self, text: str) -> None:
        _append_unique(self.suppressed_phrases, text)


@dataclass(frozen=True)
class ResolvedGenerationContext:
    context: GenerationContext
    constraints: ConstraintSet


def _append_unique(items: list[str], text: str) -> None:
    normalized = text.strip()
    if normalized and normalized not in items:
        items.append(normalized)
