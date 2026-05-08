"""Constraint accumulation for runtime generation skills."""
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

    def add_layout_constraint(self, text: str) -> None:
        _append_unique(self.layout_constraints, text)

    def add_panel_constraint(self, text: str) -> None:
        _append_unique(self.panel_constraints, text)


@dataclass(frozen=True)
class ResolvedGenerationContext:
    context: GenerationContext
    constraints: ConstraintSet

    @property
    def positive_constraints(self) -> tuple[str, ...]:
        return tuple(self.constraints.positive_constraints)

    @property
    def negative_constraints(self) -> tuple[str, ...]:
        return tuple(self.constraints.negative_constraints)

    @property
    def character_locks(self) -> tuple[CharacterLock, ...]:
        return tuple(self.constraints.character_locks)

    @property
    def layout_constraints(self) -> tuple[str, ...]:
        return tuple(self.constraints.layout_constraints)

    @property
    def panel_constraints(self) -> tuple[str, ...]:
        return tuple(self.constraints.panel_constraints)

    @property
    def visual_mode(self) -> str | None:
        return self.constraints.visual_mode

    @property
    def dialogue_mode(self) -> str | None:
        return self.constraints.dialogue_mode

    @property
    def metadata(self) -> dict[str, Any]:
        metadata = dict(self.constraints.metadata)
        metadata.setdefault("applied_skills", list(self.constraints.applied_skills))
        metadata.setdefault("skipped_skills", list(self.constraints.skipped_skills))
        return metadata


ResolvedConstraints = ResolvedGenerationContext


def resolve_constraints(
    constraints: ConstraintSet,
    context: GenerationContext,
) -> ResolvedGenerationContext:
    return ResolvedGenerationContext(context=context, constraints=constraints)


def _append_unique(items: list[str], text: str) -> None:
    normalized = text.strip()
    if normalized and normalized not in items:
        items.append(normalized)
