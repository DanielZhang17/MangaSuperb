"""Page-render context adapters and prompt rendering."""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.registry import page_render_skills
from mangasuperb.services.generation_skills.renderer import PromptRenderer


def build_page_generation_context(
    *,
    comic: Any,
    script_data: Mapping[str, Any],
    page_number: int,
    layout_key: str,
    layout_instruction: str,
    layout_notes: str | None,
    panels: Sequence[Any],
    color_mode: str,
    aspect_ratio: str,
    reference_notes: Sequence[str],
    previous_context_lines: Sequence[str],
    text_options: Mapping[str, Any],
) -> GenerationContext:
    title = (
        _clean_text(script_data.get("title"))
        or _clean_text(getattr(comic, "title", None))
        or "Untitled"
    )
    style_notes = (
        _clean_text(script_data.get("style_notes"))
        or _clean_text(getattr(comic, "style_description", None))
        or "Classic manga black and white linework."
    )

    story_value = script_data.get("story")
    story = story_value.strip() if isinstance(story_value, str) else ""

    return GenerationContext(
        task_type="page_render",
        comic_id=getattr(comic, "id", None),
        comic_title=title,
        page_number=page_number,
        story=story,
        style_notes=style_notes,
        script_data=script_data,
        panels=tuple(_panel_context(panel) for panel in panels),
        layout=LayoutContext(
            layout_key=layout_key,
            instruction=layout_instruction,
            notes=_clean_text(layout_notes),
            aspect_ratio=aspect_ratio,
        ),
        characters=tuple(_character_contexts(comic, reference_notes)),
        visual_preferences={"color_mode": color_mode},
        reference_notes=tuple(note for note in reference_notes if note),
        previous_context_lines=tuple(line for line in previous_context_lines if line),
        text_options=text_options,
    )


def render_page_prompt(context: GenerationContext) -> tuple[str, dict]:
    resolved = SkillPipeline(page_render_skills()).run(context)
    prompt = PromptRenderer().render_page_prompt(resolved)
    metadata = dict(resolved.metadata)
    metadata["visual_mode"] = resolved.constraints.visual_mode
    metadata["visual_mode_source"] = resolved.constraints.visual_mode_source
    metadata["dialogue_mode"] = resolved.constraints.dialogue_mode
    metadata["suppressed_phrases"] = tuple(resolved.constraints.suppressed_phrases)
    return prompt, metadata


def _panel_context(panel: Any) -> PanelContext:
    panel_number = getattr(panel, "panel_number", None) or getattr(
        panel,
        "sequence_index",
        1,
    )
    sequence_index = getattr(panel, "sequence_index", None) or panel_number
    return PanelContext(
        panel_number=int(panel_number),
        sequence_index=int(sequence_index),
        description=_clean_text(getattr(panel, "description", None))
        or "Scene description missing",
        dialogue=_clean_text(getattr(panel, "dialogue", None)),
        camera_notes=_clean_text(getattr(panel, "camera_notes", None)),
        style_notes=_clean_text(getattr(panel, "style_notes", None)),
        source_title=_clean_text(getattr(panel, "title", None)),
    )


def _character_contexts(comic: Any, reference_notes: Sequence[str]) -> list[CharacterContext]:
    contexts: list[CharacterContext] = []
    for index, link in enumerate(getattr(comic, "character_links", []) or [], start=1):
        character = getattr(link, "character", None)
        if not character:
            continue
        name = _clean_text(getattr(character, "name", None)) or (
            f"Character {getattr(character, 'id', index)}"
        )
        reference_index = _reference_index_for_name(name, reference_notes)
        has_reference_image = bool(reference_index or getattr(character, "image_url", None))
        contexts.append(
            CharacterContext(
                id=getattr(character, "id", None),
                name=name,
                role=_clean_text(getattr(link, "role", None)),
                description=_clean_text(getattr(character, "description", None)),
                sex=_clean_text(getattr(character, "sex", None)),
                style_prompt=_clean_text(getattr(character, "style_prompt", None)),
                optimized_description=_clean_text(
                    getattr(character, "optimized_description", None)
                ),
                reference_note=None,
                reference_index=reference_index,
                has_reference_image=has_reference_image,
            )
        )
    return contexts


def _reference_index_for_name(name: str, reference_notes: Sequence[str]) -> int | None:
    pattern = re.compile(r"Ref\s+(\d+):\s+" + re.escape(name) + r"\b", re.IGNORECASE)
    for note in reference_notes:
        match = pattern.search(note)
        if match:
            return int(match.group(1))
    return None


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None
