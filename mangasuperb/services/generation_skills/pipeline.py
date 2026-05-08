"""Runtime skill pipeline."""
from __future__ import annotations

import logging
from typing import Protocol

from mangasuperb.services.generation_skills.constraints import (
    ConstraintSet,
    ResolvedGenerationContext,
)
from mangasuperb.services.generation_skills.context import GenerationContext
from mangasuperb.services.generation_skills.visual_modes import resolve_visual_mode

logger = logging.getLogger(__name__)


class GenerationSkill(Protocol):
    id: str
    scopes: tuple[str, ...]
    priority: int
    required: bool

    def should_apply(self, context: GenerationContext) -> bool:
        ...

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        ...


class SkillPipelineError(RuntimeError):
    """Raised when a required generation skill fails."""


class SkillPipeline:
    def __init__(
        self,
        skills: list[GenerationSkill] | tuple[GenerationSkill, ...],
    ) -> None:
        self.skills = tuple(sorted(skills, key=lambda skill: (skill.priority, skill.id)))

    def run(self, context: GenerationContext) -> ResolvedGenerationContext:
        constraints = ConstraintSet()

        for skill in self.skills:
            if context.task_type not in skill.scopes:
                continue

            try:
                if not skill.should_apply(context):
                    continue
                skill.apply(context, constraints)
            except Exception as exc:
                self._handle_failure(skill, context, constraints, exc)
                continue

            constraints.applied_skills.append(skill.id)

        self._resolve_defaults(context, constraints)
        return ResolvedGenerationContext(context=context, constraints=constraints)

    def _resolve_defaults(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        if context.task_type == "page_render" and constraints.visual_mode is None:
            visual_mode, source = resolve_visual_mode(context)
            constraints.visual_mode = visual_mode
            constraints.visual_mode_source = source
        if context.task_type == "page_render" and constraints.dialogue_mode is None:
            constraints.dialogue_mode = "hybrid"

    def _handle_failure(
        self,
        skill: GenerationSkill,
        context: GenerationContext,
        constraints: ConstraintSet,
        exc: Exception,
    ) -> None:
        if skill.required:
            raise SkillPipelineError(f"{skill.id} failed: {exc}") from exc
        constraints.skipped_skills.append(skill.id)
        constraints.warnings.append(f"{skill.id}: {exc}")
        logger.warning(
            "Generation skill skipped skill_id=%s task_type=%s error=%s",
            skill.id,
            context.task_type,
            exc,
            exc_info=True,
        )
