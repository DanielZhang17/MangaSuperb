"""Utilities for interacting with Gemini and validating generation payloads."""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Dict, Iterable, List, Optional

import google.generativeai as genai

from flask import current_app

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


def build_script_prompt(idea: str) -> str:
    """Render a structured prompt describing the desired manga script."""
    return SCRIPT_PROMPT_TEMPLATE.format(idea=idea)


def _config_value(key: str, fallback: str) -> str:
    try:
        return current_app.config.get(key, fallback)  # type: ignore[attr-defined]
    except RuntimeError:
        return fallback


def _resolve_api_key(explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    return _config_value("GEMINI_API_KEY", Config.GEMINI_API_KEY)


def _resolve_model(config_key: str, default_value: str, override: Optional[str] = None) -> str:
    if override:
        return override
    return _config_value(config_key, default_value)


def generate_script_from_prompt(
    prompt: str,
    model_name: str | None = None,
    *,
    api_key: str | None = None,
) -> Dict[str, Any]:
    """Call Gemini to create a manga script from the supplied prompt."""
    if not prompt:
        raise ValueError("Prompt is required")

    resolved_model = _resolve_model("GEMINI_SCRIPT_MODEL", Config.GEMINI_SCRIPT_MODEL, model_name)
    api_key_value = _resolve_api_key(api_key)
    if not api_key_value:
        raise ValueError("Gemini API key is not configured")

    logger.info("Generating manga script with model: %s", resolved_model)
    genai.configure(api_key=api_key_value)
    script_model = genai.GenerativeModel(resolved_model)
    response = script_model.generate_content(build_script_prompt(prompt))

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
    model_name: str = Config.GEMINI_SCRIPT_MODEL,
    *,
    api_key: str | None = None,
) -> str:
    """Use Gemini to enhance a character description."""
    if not description:
        raise ValueError("Description is required")

    api_key_value = _resolve_api_key(api_key)
    if not api_key_value:
        raise ValueError("Gemini API key is not configured")

    resolved_model = _resolve_model("GEMINI_SCRIPT_MODEL", Config.GEMINI_SCRIPT_MODEL, model_name)
    genai.configure(api_key=api_key_value)
    model = genai.GenerativeModel(resolved_model)
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
