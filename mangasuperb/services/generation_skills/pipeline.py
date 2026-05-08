"""Runtime skill pipeline."""
from __future__ import annotations

import logging
from typing import Protocol

from mangasuperb.services.generation_skills.constraints import (
    ConstraintSet,
    ResolvedConstraints,
    resolve_constraints,
)
from mangasuperb.services.generation_skills.context import GenerationContext

logger = logging.getLogger(__name__)


class SkillPipelineError(RuntimeError):
    """Raised when a required generation skill fails."""


class GenerationSkill(Protocol):
    id: str
    scopes: tuple[str, ...]
    priority: int
    required: bool

    def should_apply(self, context: GenerationContext) -> bool:
        raise NotImplementedError

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raise NotImplementedError


class SkillPipeline:
    def __init__(self, skills: list[GenerationSkill] | tuple[GenerationSkill, ...]) -> None:
        self.skills = sorted(skills, key=lambda skill: (skill.priority, skill.id))

    def run(self, context: GenerationContext) -> ResolvedConstraints:
        constraints = ConstraintSet()
        for skill in self.skills:
            if context.task_type not in skill.scopes:
                continue
            if not skill.should_apply(context):
                continue
            try:
                skill.apply(context, constraints)
                constraints.metadata["applied_skills"].append(skill.id)
            except Exception as exc:
                if skill.required:
                    raise SkillPipelineError(f"Required skill failed: {skill.id}") from exc
                constraints.metadata["skipped_skills"].append(skill.id)
                logger.warning("Generation skill skipped id=%s error=%s", skill.id, exc)
        return resolve_constraints(constraints)
