"""Utilities for interacting with Gemini and validating generation payloads."""
from __future__ import annotations

import base64
import datetime
import json
import logging
import os
from typing import Any, Dict, Iterable, List, Optional

from config import Config
from mangasuperb.services.ai_provider import get_text_provider

logger = logging.getLogger(__name__)

ALLOWED_ASPECT_RATIOS = {
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
}
DEFAULT_COMIC_STYLE = "Classic manga black and white linework"
DEFAULT_ASPECT_RATIO = "2:3"

SCRIPT_PROMPT_TEMPLATE = """You are a professional manga scriptwriter. Based on the following idea, create a detailed manga script with:
1. A brief story summary
2. 3-4 panel descriptions with dialogue and scene details
3. Character descriptions
4. Visual style notes that can prompt the image generation model to create fitting manga-style images.

User idea: {idea}

Format your response as JSON with this structure:
{{
    "title": "Manga Title",
    "summary": "Brief story summary",
    "panels": [
        {{
            "panel_number": 1,
            "scene": "Scene description",
            "dialogue": "Character dialogue",
            "visual_notes": "Visual style and composition notes"
        }}
    ],
    "characters": ["Character 1 description", "Character 2 description"],
    "style_notes": "Overall visual style"
}}"""

CHARACTER_OPTIMIZE_PROMPT = """You are a creative editor who polishes comic and manga character bios.
Rewrite the following description to be vivid and concise (max 120 words), suitable for guiding an illustrator.
Keep core facts, enhance clarity, and focus on visual traits and personality.

Original description:
{description}

Return only the refined description."""

STORY_ENHANCE_PROMPT = """You are a seasoned manga editor. Polish the following story draft so it is vivid and coherent.
Keep the core plot but enhance pacing, tension, and character motivations.
Return a revised story prose suitable for manga. No longer than 1000 words.

Original story:
{story}

Return only the revised story."""


def _strip_code_fences(payload: str) -> str:
    if not payload:
        return payload

    markers = [("```json", "```"), ("```", "```")]
    for start, end in markers:
        if start in payload:
            section = payload.split(start, 1)[1]
            if end in section:
                return section.split(end, 1)[0].strip()
    return payload.strip()


_PROMPT_LOG_LIMIT = 200


def _prompt_logging_enabled() -> bool:
    return os.getenv("LOG_PROMPTS", "").strip().lower() == "true"


def _truncate_for_log(text: str) -> str:
    if len(text) <= _PROMPT_LOG_LIMIT:
        return text
    omitted = len(text) - _PROMPT_LOG_LIMIT
    return f"{text[:_PROMPT_LOG_LIMIT]}... [truncated {omitted} chars]"


def _summarize_content_part(part: Any, idx: int) -> str:
    if part is None:
        return f"[part {idx}] <empty>"

    if isinstance(part, str):
        return f"[text {idx}] {_truncate_for_log(part)}"

    if isinstance(part, dict):
        if "text" in part and isinstance(part["text"], str):
            return f"[text {idx}] {_truncate_for_log(part['text'])}"

        inline = part.get("inline_data")
        if inline:
            mime = inline.get("mime_type") or "unknown"
            data = inline.get("data") or b""
            length = len(data) if isinstance(data, (bytes, bytearray)) else len(str(data))
            return f"[image {idx}] mime={mime} bytes={length}"

    return f"[part {idx}] {_truncate_for_log(repr(part))}"


def log_gemini_contents(contents: Iterable[Any], model_name: str, context: str = "") -> None:
    """Write prompt contents to logs/gemini_prompts.log when LOG_PROMPTS is enabled."""
    if not _prompt_logging_enabled():
        return

    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    os.makedirs("logs", exist_ok=True)

    summary_lines = []
    for idx, part in enumerate(contents, start=1):
        summary_lines.append(_summarize_content_part(part, idx))

    context_line = f" context={context}" if context else ""
    log_entry = f"[{timestamp}] model={model_name}{context_line}\n" + "\n".join(summary_lines) + "\n\n"

    try:
        with open("logs/gemini_prompts.log", "a", encoding="utf-8") as fh:
            fh.write(log_entry)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("Failed to write Gemini prompt log: %s", exc)


def build_script_prompt(idea: str) -> str:
    """Render a structured prompt describing the desired manga script."""
    return SCRIPT_PROMPT_TEMPLATE.format(idea=idea)


def generate_script_from_prompt(
    prompt: str,
    model_name: str | None = None,
    *,
    api_key: str | None = None,
) -> Dict[str, Any]:
    """Call Gemini to create a manga script from the supplied prompt."""
    if not prompt:
        raise ValueError("Prompt is required")

    prompt_text = build_script_prompt(prompt)
    raw_text = get_text_provider().generate_text(prompt_text)
    cleaned = _strip_code_fences(raw_text)

    try:
        script_data = json.loads(cleaned)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive logging
        logger.exception("Failed to parse script JSON")
        raise ValueError("Model response is not valid JSON") from exc

    panels = script_data.get("panels")
    if not isinstance(panels, list) or not panels:
        raise ValueError("Generated script does not include panels")

    return script_data


def optimize_character_description(
    description: str,
    model_name: str = Config.GEMINI_SCRIPT_MODEL,
    *,
    api_key: str | None = None,
) -> str:
    """Use Gemini to enhance a character description."""
    if not description:
        raise ValueError("Description is required")

    prompt_text = CHARACTER_OPTIMIZE_PROMPT.format(description=description)
    optimized = get_text_provider().generate_text(prompt_text).strip()
    if not optimized:
        raise ValueError("Optimization returned empty text")
    return optimized


def normalize_reference_images(images: Iterable[Any]) -> List[Dict[str, str]]:
    """Validate and normalise reference image payloads."""
    normalized: List[Dict[str, str]] = []
    if not images:
        return normalized

    for idx, item in enumerate(images):
        if item is None:
            continue

        data: Optional[str] = None
        mime_type = "image/png"

        if isinstance(item, dict):
            data = item.get("data") or item.get("base64")
            mime_type = item.get("mime_type") or mime_type
        elif isinstance(item, str):
            if item.startswith("data:"):
                header, _, b64_data = item.partition(",")
                if not b64_data:
                    raise ValueError(f"Reference image at index {idx} is not valid base64 data")
                mime_type = header.split(";")[0].split(":")[-1] or mime_type
                data = b64_data
            else:
                data = item
        else:
            raise ValueError("Reference images must be base64 strings or objects with data fields")

        if not data:
            raise ValueError(f"Reference image at index {idx} is missing data")

        try:
            base64.b64decode(data, validate=True)
        except Exception as exc:  # pragma: no cover - validation
            raise ValueError(
                f"Reference image at index {idx} is not valid base64 data"
            ) from exc

        normalized.append({"mime_type": mime_type, "data": data})

    return normalized


def enhance_story_text(
    story: str,
    model_name: Optional[str] = None,
    *,
    api_key: Optional[str] = None,
) -> str:
    """Enhance a story draft using Gemini."""
    if not story:
        raise ValueError("Story text is required")

    enhanced = get_text_provider().generate_text(
        STORY_ENHANCE_PROMPT.format(story=story)
    ).strip()
    if not enhanced:
        raise ValueError("Enhancement returned empty text")
    return enhanced


def validate_aspect_ratio(value: Optional[str]) -> str:
    """Ensure aspect ratios map to one of the supported display options."""
    ratio = str(value or DEFAULT_ASPECT_RATIO).strip()
    if ratio not in ALLOWED_ASPECT_RATIOS:
        raise ValueError(f"Aspect ratio must be one of {sorted(ALLOWED_ASPECT_RATIOS)}")
    return ratio
