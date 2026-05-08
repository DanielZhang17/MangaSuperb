"""Constraint accumulation for runtime generation skills."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ConstraintSet:
    visual_mode: str | None = None
    dialogue_mode: str | None = None
    positive_constraints: list[str] = field(default_factory=list)
    negative_constraints: list[str] = field(default_factory=list)
    character_locks: list[str] = field(default_factory=list)
    layout_constraints: list[str] = field(default_factory=list)
    panel_constraints: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(
        default_factory=lambda: {"applied_skills": [], "skipped_skills": []}
    )

    def add_positive(self, value: str) -> None:
        if value and value not in self.positive_constraints:
            self.positive_constraints.append(value)

    def add_negative(self, value: str) -> None:
        if value and value not in self.negative_constraints:
            self.negative_constraints.append(value)

    def add_character_lock(self, value: str) -> None:
        if value and value not in self.character_locks:
            self.character_locks.append(value)

    def add_layout_constraint(self, value: str) -> None:
        if value and value not in self.layout_constraints:
            self.layout_constraints.append(value)

    def add_panel_constraint(self, value: str) -> None:
        if value and value not in self.panel_constraints:
            self.panel_constraints.append(value)


@dataclass(frozen=True)
class ResolvedConstraints:
    visual_mode: str | None
    dialogue_mode: str | None
    positive_constraints: tuple[str, ...]
    negative_constraints: tuple[str, ...]
    character_locks: tuple[str, ...]
    layout_constraints: tuple[str, ...]
    panel_constraints: tuple[str, ...]
    metadata: dict[str, Any]


def resolve_constraints(constraints: ConstraintSet) -> ResolvedConstraints:
    return ResolvedConstraints(
        visual_mode=constraints.visual_mode,
        dialogue_mode=constraints.dialogue_mode,
        positive_constraints=tuple(constraints.positive_constraints),
        negative_constraints=tuple(constraints.negative_constraints),
        character_locks=tuple(constraints.character_locks),
        layout_constraints=tuple(constraints.layout_constraints),
        panel_constraints=tuple(constraints.panel_constraints),
        metadata=dict(constraints.metadata),
    )
