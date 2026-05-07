from __future__ import annotations

import logging
from typing import Protocol

from mangasuperb.services.generation_skills.constraints import (
    ConstraintSet,
    ResolvedGenerationContext,
)
from mangasuperb.services.generation_skills.context import GenerationContext

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
    pass


class SkillPipeline:
    def __init__(self, skills: list[GenerationSkill] | tuple[GenerationSkill, ...]) -> None:
        self._skills = tuple(sorted(skills, key=lambda skill: (skill.priority, skill.id)))

    def run(self, context: GenerationContext) -> ResolvedGenerationContext:
        constraints = ConstraintSet()

        for skill in self._skills:
            if context.task_type not in skill.scopes:
                continue
            if not skill.should_apply(context):
                continue

            try:
                skill.apply(context, constraints)
            except Exception as exc:
                if skill.required:
                    raise SkillPipelineError(f"{skill.id} failed: {exc}") from exc
                constraints.skipped_skills.append(skill.id)
                constraints.warnings.append(f"{skill.id}: {exc}")
                logger.warning("Generation skill skipped skill_id=%s error=%s", skill.id, exc)
                continue

            constraints.applied_skills.append(skill.id)

        self._resolve_defaults(context, constraints)
        return ResolvedGenerationContext(context=context, constraints=constraints)

    def _resolve_defaults(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        if constraints.visual_mode is None:
            candidate = str(context.visual_preferences.get("color_mode") or "black-white")
            constraints.visual_mode = "color" if candidate == "color" else "black-white"
            constraints.visual_mode_source = "pipeline-default"
        if constraints.dialogue_mode is None:
            constraints.dialogue_mode = "hybrid"
