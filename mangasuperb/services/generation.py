"""Utilities for interacting with Gemini and validating generation payloads."""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Dict, Iterable, List, Optional

import google.generativeai as genai

from config import Config

logger = logging.getLogger(__name__)

ALLOWED_ASPECT_RATIOS = {"16:9", "9:16", "1:1"}
DEFAULT_COMIC_STYLE = "Classic manga black and white linework"
DEFAULT_ASPECT_RATIO = "16:9"

SCRIPT_PROMPT_TEMPLATE = """You are a professional manga scriptwriter. Based on the following idea, create a detailed manga script with:
1. A brief story summary
2. 4-6 panel descriptions with dialogue and scene details
3. Character descriptions
4. Visual style notes that can prompt the image generation model to create fitting manga-style images.

User idea: {idea}

{character_context}{style_context}

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


def _extract_text_from_response(response: Any) -> str:
    text = getattr(response, "text", "") or ""
    if text:
        return text

    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        parts = getattr(getattr(candidate, "content", None), "parts", []) or []
        for part in parts:
            part_text = getattr(part, "text", None)
            if part_text:
                text += part_text
    return text


def _build_character_context(characters: Optional[Iterable[Dict[str, Any]]]) -> str:
    if not characters:
        return ""

    entries: List[str] = []
    for idx, character in enumerate(characters, start=1):
        name = (character.get("name") or f"Character {idx}").strip()
        role = (character.get("role") or "").strip()
        description = (
            character.get("optimized_description")
            or character.get("description")
            or ""
        ).strip()
        style_prompt = (character.get("style_prompt") or "").strip()

        segments: List[str] = [f"Name: {name}"]
        if role:
            segments.append(f"Role: {role}")
        if description:
            segments.append(f"Bio: {description}")
        if style_prompt:
            segments.append(f"Visual style cues: {style_prompt}")

        entries.append(" - " + "; ".join(segments))

    return "Existing characters:\n" + "\n".join(entries) + "\n\n"


def build_script_prompt(
    idea: str,
    *,
    characters: Optional[Iterable[Dict[str, Any]]] = None,
    style_description: Optional[str] = None,
) -> str:
    """Render a structured prompt describing the desired manga script."""
    character_context = _build_character_context(characters)

    style_context = ""
    if style_description:
        style_context = f"Preferred overarching art direction: {style_description.strip()}\n\n"

    return SCRIPT_PROMPT_TEMPLATE.format(
        idea=idea,
        character_context=character_context,
        style_context=style_context,
    )


def generate_script_from_prompt(
    prompt: str,
    model_name: str,
    api_key: str,
    *,
    characters: Optional[Iterable[Dict[str, Any]]] = None,
    style_description: Optional[str] = None,
) -> Dict[str, Any]:
    """Call Gemini to create a manga script from the supplied prompt."""
    if not prompt:
        raise ValueError("Prompt is required")

    logger.info("Generating manga script with model: %s", model_name)
    genai.configure(api_key=api_key)
    script_model = genai.GenerativeModel(model_name)
    response = script_model.generate_content(
        build_script_prompt(prompt, characters=characters, style_description=style_description)
    )

    raw_text = _extract_text_from_response(response)
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
    api_key: str,
    *,
    model_name: str = Config.GEMINI_SCRIPT_MODEL,
) -> str:
    """Use Gemini to enhance a character description."""
    if not description:
        raise ValueError("Description is required")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(CHARACTER_OPTIMIZE_PROMPT.format(description=description))
    optimized = _extract_text_from_response(response).strip()
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


def validate_aspect_ratio(value: Optional[str]) -> str:
    """Ensure aspect ratios map to one of the supported display options."""
    ratio = (value or DEFAULT_ASPECT_RATIO).strip()
    if ratio not in ALLOWED_ASPECT_RATIOS:
        raise ValueError(f"Aspect ratio must be one of {sorted(ALLOWED_ASPECT_RATIOS)}")
    return ratio
