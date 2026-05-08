"""Shot split context resolution."""
from __future__ import annotations

from dataclasses import replace

from mangasuperb.services.generation_skills.context import GenerationContext, ShotDraft
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.registry import get_builtin_skills


def resolve_shot_drafts(
    context: GenerationContext,
    *,
    panels_per_page: int,
) -> tuple[tuple[ShotDraft, ...], dict]:
    context = replace(
        context,
        text_options={**context.text_options, "panels_per_page": panels_per_page},
    )
    constraints = SkillPipeline(get_builtin_skills("shot_split")).run(context)
    drafts = tuple(constraints.metadata.get("shot_drafts", ()))
    metadata = dict(constraints.metadata)
    metadata["panel_count"] = len(drafts)
    metadata.pop("shot_drafts", None)
    return drafts, metadata
