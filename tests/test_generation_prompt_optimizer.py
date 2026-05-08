from __future__ import annotations

from dataclasses import dataclass

from mangasuperb.services.generation_skills.prompt_optimizer import (
    PromptOptimizationResult,
    optimize_text_if_enabled,
)


@dataclass
class FakeTextProvider:
    calls: list[str]
    response: str = "optimized text"
    should_fail: bool = False

    def generate_text(self, prompt: str) -> str:
        self.calls.append(prompt)
        if self.should_fail:
            raise RuntimeError("text model unavailable")
        return self.response


def test_optimizer_disabled_by_default_does_not_call_provider(app) -> None:
    calls: list[str] = []
    provider = FakeTextProvider(calls)

    with app.app_context():
        result = optimize_text_if_enabled(
            scope="page_render",
            source_text="base prompt",
            metadata={"panel_count": 1},
            required_phrases=("base",),
            provider_factory=lambda: provider,
        )

    assert isinstance(result, PromptOptimizationResult)
    assert result.text == "base prompt"
    assert result.enabled is False
    assert result.called is False
    assert result.error is None
    assert calls == []


def test_optimizer_enabled_for_scope_calls_provider(app) -> None:
    calls: list[str] = []
    provider = FakeTextProvider(calls, response="optimized text with base")

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "page_render"
        result = optimize_text_if_enabled(
            scope="page_render",
            source_text="base prompt",
            metadata={"visual_mode": "black-white"},
            required_phrases=("base",),
            provider_factory=lambda: provider,
        )

    assert result.text == "optimized text with base"
    assert result.enabled is True
    assert result.called is True
    assert result.error is None
    assert len(calls) == 1
    assert "visual_mode" in calls[0]
    assert "base prompt" in calls[0]


def test_optimizer_enabled_for_other_scope_does_not_call_provider(app) -> None:
    calls: list[str] = []
    provider = FakeTextProvider(calls)

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "shot_split"
        result = optimize_text_if_enabled(
            scope="page_render",
            source_text="base prompt",
            metadata={},
            required_phrases=("base",),
            provider_factory=lambda: provider,
        )

    assert result.text == "base prompt"
    assert result.enabled is False
    assert result.called is False
    assert calls == []


def test_optimizer_failure_falls_back_to_source_text(app) -> None:
    provider = FakeTextProvider([], should_fail=True)

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "page_render"
        result = optimize_text_if_enabled(
            scope="page_render",
            source_text="base prompt",
            metadata={},
            required_phrases=("base",),
            provider_factory=lambda: provider,
        )

    assert result.text == "base prompt"
    assert result.enabled is True
    assert result.called is True
    assert result.error == "text model unavailable"


def test_optimizer_rejects_response_that_drops_required_phrases(app) -> None:
    provider = FakeTextProvider([], response="optimized text")

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "page_render"
        result = optimize_text_if_enabled(
            scope="page_render",
            source_text="Panel 1: base prompt",
            metadata={},
            required_phrases=("Panel 1",),
            provider_factory=lambda: provider,
        )

    assert result.text == "Panel 1: base prompt"
    assert result.error == "Optimized text dropped required phrases: Panel 1"
