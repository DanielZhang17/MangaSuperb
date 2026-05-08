"""Page-render prompt rendering through generation skills."""
from __future__ import annotations

from mangasuperb.services.generation_skills.context import GenerationContext
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.registry import get_builtin_skills


def _sanitize_for_visual_mode(text: str, visual_mode: str | None) -> str:
    if visual_mode != "black-white":
        return text
    banned = ("vibrant full color", "rich chromatic lighting")
    sanitized = text
    for phrase in banned:
        sanitized = sanitized.replace(phrase, "").replace(phrase.title(), "")
    return sanitized.strip()


def render_page_prompt(context: GenerationContext) -> tuple[str, dict]:
    resolved = SkillPipeline(get_builtin_skills("page_render")).run(context)
    visual_mode = resolved.visual_mode

    sections: list[str] = [
        f'Task: Render page {context.page_number} of manga "{context.comic_title}".',
    ]

    if resolved.positive_constraints:
        sections.append("Positive constraints:\n" + "\n".join(resolved.positive_constraints))
    if resolved.character_locks:
        sections.append(
            "Character locks / Character roster:\n" + "\n".join(resolved.character_locks)
        )
    if context.layout:
        sections.append("Layout instruction:\n" + context.layout.instruction)
    if resolved.layout_constraints:
        sections.append("Layout constraints:\n" + "\n".join(resolved.layout_constraints))

    panel_lines: list[str] = []
    for panel in context.panels:
        panel_number = panel.panel_number or panel.sequence_index
        line = f"Panel {panel_number}: {_sanitize_for_visual_mode(panel.description, visual_mode)}"
        if panel.dialogue:
            line += f"\nDialogue: {panel.dialogue}"
        if panel.camera_notes:
            line += f"\nCamera: {panel.camera_notes}"
        if panel.style_notes:
            sanitized_style = _sanitize_for_visual_mode(panel.style_notes, visual_mode)
            if sanitized_style:
                line += f"\nStyle: {sanitized_style}"
        panel_lines.append(line)
    sections.append("Panel-by-panel content:\n" + "\n\n".join(panel_lines))

    if resolved.dialogue_mode:
        sections.append(f"Dialogue mode: {resolved.dialogue_mode}")
    if resolved.panel_constraints:
        sections.append("Panel fidelity:\n" + "\n".join(resolved.panel_constraints))
    if context.previous_context_lines:
        sections.append("Previous pages context:\n" + "\n".join(context.previous_context_lines))
    if resolved.negative_constraints:
        sections.append("Negative constraints:\n" + "\n".join(resolved.negative_constraints))

    metadata = dict(resolved.metadata)
    metadata["visual_mode"] = resolved.visual_mode
    metadata["dialogue_mode"] = resolved.dialogue_mode
    return "\n\n".join(section for section in sections if section), metadata
