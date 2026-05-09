"""Shot split context resolution."""
from __future__ import annotations

import json
from dataclasses import replace

from mangasuperb.services.generation_skills.context import (
    GenerationContext,
    PanelContext,
    ShotDraft,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.prompt_optimizer import optimize_text_if_enabled
from mangasuperb.services.generation_skills.registry import get_builtin_skills
from mangasuperb.services.ai_provider import get_text_provider


def _drafts_to_json_text(context: GenerationContext) -> str:
    payload = [
        {
            "sequence_index": panel.sequence_index,
            "title": panel.source_title,
            "description": panel.description,
            "dialogue": panel.dialogue,
            "camera_notes": panel.camera_notes,
            "style_notes": panel.style_notes,
        }
        for panel in context.panels
    ]
    return json.dumps(payload, ensure_ascii=False)


def _string_or_none(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _merge_shot_advisory(context: GenerationContext, optimized_text: str) -> GenerationContext:
    try:
        payload = json.loads(optimized_text)
    except json.JSONDecodeError:
        return context
    if not isinstance(payload, list):
        return context

    advisory_by_index: dict[int, dict] = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            sequence_index = int(item.get("sequence_index"))
        except (TypeError, ValueError):
            continue
        advisory_by_index[sequence_index] = item

    merged_panels: list[PanelContext] = []
    for panel in context.panels:
        advisory = advisory_by_index.get(panel.sequence_index, {})
        merged_panels.append(
            PanelContext(
                panel_number=panel.panel_number,
                sequence_index=panel.sequence_index,
                description=_string_or_none(advisory.get("description")) or panel.description,
                dialogue=_string_or_none(advisory.get("dialogue")) or panel.dialogue,
                camera_notes=_string_or_none(advisory.get("camera_notes")) or panel.camera_notes,
                style_notes=_string_or_none(advisory.get("style_notes")) or panel.style_notes,
                source_title=panel.source_title,
            )
        )

    return replace(context, panels=tuple(merged_panels))


def resolve_shot_drafts(
    context: GenerationContext,
    *,
    panels_per_page: int,
    text_provider: str | None = None,
) -> tuple[tuple[ShotDraft, ...], dict]:
    context = replace(
        context,
        text_options={**context.text_options, "panels_per_page": panels_per_page},
    )
    optimization = optimize_text_if_enabled(
        scope="shot_split",
        source_text=_drafts_to_json_text(context),
        metadata={"comic_id": context.comic_id, "panel_count": len(context.panels)},
        required_phrases=('"sequence_index"',),
        provider_factory=((lambda: get_text_provider(text_provider)) if text_provider else None),
    )
    metadata_prefix = {
        "prompt_optimizer_enabled": optimization.enabled,
        "text_model_call_count": 1 if optimization.called else 0,
        "prompt_optimizer_error": optimization.error,
    }
    if optimization.called and optimization.error is None:
        context = _merge_shot_advisory(context, optimization.text)

    constraints = SkillPipeline(get_builtin_skills("shot_split")).run(context)
    drafts = tuple(constraints.metadata.get("shot_drafts", ()))
    metadata = dict(constraints.metadata)
    metadata.update(metadata_prefix)
    metadata["panel_count"] = len(drafts)
    metadata.pop("shot_drafts", None)
    return drafts, metadata
