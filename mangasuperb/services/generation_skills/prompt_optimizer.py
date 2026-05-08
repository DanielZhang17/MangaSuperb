"""Optional model-backed prompt optimization gated by backend config."""
from __future__ import annotations

import json
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from flask import current_app

from mangasuperb.services.ai_provider import TextProvider, get_text_provider

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PromptOptimizationResult:
    text: str
    enabled: bool
    called: bool
    error: str | None = None


def _config_value(key: str, default: Any) -> Any:
    try:
        return current_app.config.get(key, default)
    except RuntimeError:
        return default


def _scope_enabled(scope: str) -> bool:
    enabled = bool(_config_value("GENERATION_PROMPT_OPTIMIZATION_ENABLED", False))
    if not enabled:
        return False

    raw_scopes = str(
        _config_value("GENERATION_PROMPT_OPTIMIZATION_SCOPES", "shot_split,page_render")
    )
    scopes = {item.strip() for item in raw_scopes.split(",") if item.strip()}
    return scope in scopes


def _build_optimizer_prompt(scope: str, source_text: str, metadata: dict[str, Any]) -> str:
    metadata_json = json.dumps(metadata, ensure_ascii=False, sort_keys=True)
    return (
        "You optimize generation-stage prompts without changing user intent.\n"
        f"Scope: {scope}\n"
        f"Metadata JSON: {metadata_json}\n\n"
        "Rules:\n"
        "- Preserve all required names, panel labels, dialogue, and explicit settings.\n"
        "- Remove ambiguity and contradictory wording.\n"
        "- Return only the optimized text.\n\n"
        f"Source text:\n{source_text}"
    )


def _missing_required_phrases(text: str, phrases: Iterable[str]) -> list[str]:
    return [phrase for phrase in phrases if phrase and phrase not in text]


def optimize_text_if_enabled(
    *,
    scope: str,
    source_text: str,
    metadata: dict[str, Any],
    required_phrases: Iterable[str] = (),
    provider_factory: Callable[[], TextProvider] | None = None,
) -> PromptOptimizationResult:
    if not _scope_enabled(scope):
        return PromptOptimizationResult(text=source_text, enabled=False, called=False)

    try:
        prompt = _build_optimizer_prompt(scope, source_text, metadata)
        provider = provider_factory or get_text_provider
        optimized = provider().generate_text(prompt).strip()
        if not optimized:
            return PromptOptimizationResult(
                text=source_text,
                enabled=True,
                called=True,
                error="Optimizer returned empty text",
            )

        missing = _missing_required_phrases(optimized, required_phrases)
        if missing:
            return PromptOptimizationResult(
                text=source_text,
                enabled=True,
                called=True,
                error="Optimized text dropped required phrases: " + ", ".join(missing),
            )

        return PromptOptimizationResult(text=optimized, enabled=True, called=True)
    except Exception as exc:
        logger.warning("Prompt optimization failed scope=%s error=%s", scope, exc)
        return PromptOptimizationResult(
            text=source_text,
            enabled=True,
            called=True,
            error=str(exc),
        )
