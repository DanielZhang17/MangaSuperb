"""Tests for Gemini prompt logging safeguards."""
from __future__ import annotations

from pathlib import Path

from mangasuperb.services import generation


def _prompt_log_path(root: Path) -> Path:
    return root / "logs" / "gemini_prompts.log"


def test_prompt_logging_truncates_long_text(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("LOG_PROMPTS", "true")
    text = ("a" * 220) + "SECRET_SUFFIX"

    generation.log_gemini_contents([text], "test-model", context="unit")

    content = _prompt_log_path(tmp_path).read_text(encoding="utf-8")
    assert "[text 1] " + ("a" * 200) in content
    assert "... [truncated " in content
    assert "SECRET_SUFFIX" not in content


def test_prompt_logging_false_ignores_flask_debug(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("LOG_PROMPTS", "false")
    monkeypatch.setenv("FLASK_DEBUG", "true")

    generation.log_gemini_contents(["SECRET_PROMPT"], "test-model", context="unit")

    assert not _prompt_log_path(tmp_path).exists()


def test_prompt_logging_unset_is_disabled(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LOG_PROMPTS", raising=False)
    monkeypatch.setenv("FLASK_DEBUG", "true")

    generation.log_gemini_contents(["SECRET_PROMPT"], "test-model", context="unit")

    assert not _prompt_log_path(tmp_path).exists()
