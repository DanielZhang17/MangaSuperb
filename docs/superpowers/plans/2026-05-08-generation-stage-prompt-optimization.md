# Generation Stage Prompt Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-gated prompt optimization for shot splitting and page rendering without automatically rewriting the user's story.

**Architecture:** Add a provider-agnostic `mangasuperb.services.generation_skills` package for deterministic generation constraints. Add a small `prompt_optimizer` service that calls the existing text provider only when `.env` config enables the current scope. Integrate the resolved shot drafts and page-render prompts into `process_shot_stage()` and `process_page_render_stage()` while keeping `story enhance` user-triggered only.

**Tech Stack:** Python dataclasses, Flask `current_app.config`, SQLAlchemy model objects, existing text and image provider abstractions, pytest, local SQLite test database, existing dummy R2 storage fixture.

---

## Scope Notes

This plan supersedes the earlier page-render-only plan at `docs/superpowers/plans/2026-05-07-generation-skills-platform.md`. It keeps that plan's page-render skill ideas, but expands the executable scope to `shot_split` and `page_render`, with model-backed optimization disabled by default.

The implementation must not add a frontend auto-enhance flow. `/api/stories/enhance` remains callable only from explicit user actions.

## File Structure

- Modify `config.py`: add `GENERATION_PROMPT_OPTIMIZATION_ENABLED` and `GENERATION_PROMPT_OPTIMIZATION_SCOPES`.
- Modify `.env.example`: document the two new backend config flags, defaulted off.
- Modify `tests/conftest.py`: set test defaults for the two config flags.
- Create `mangasuperb/services/generation_skills/__init__.py`: public exports for the package.
- Create `mangasuperb/services/generation_skills/context.py`: immutable context dataclasses shared by `shot_split` and `page_render`.
- Create `mangasuperb/services/generation_skills/constraints.py`: constraint and resolved-result dataclasses.
- Create `mangasuperb/services/generation_skills/pipeline.py`: skill protocol, execution order, and error handling.
- Create `mangasuperb/services/generation_skills/registry.py`: built-in skill lookup by task type.
- Create `mangasuperb/services/generation_skills/prompt_optimizer.py`: `.env` gate and optional text-model call wrapper.
- Create `mangasuperb/services/generation_skills/shot_split.py`: adapter and renderer for resolved shot drafts.
- Create `mangasuperb/services/generation_skills/page_render.py`: adapter and renderer for page-render prompts.
- Create `mangasuperb/services/generation_skills/skills/__init__.py`: skill exports.
- Create `mangasuperb/services/generation_skills/skills/shot_boundary.py`: preserve section order and one draft per section.
- Create `mangasuperb/services/generation_skills/skills/dialogue_extraction.py`: extract dialogue into structured fields.
- Create `mangasuperb/services/generation_skills/skills/camera_style_enrichment.py`: preserve explicit camera/style fields and apply conservative fallbacks.
- Create `mangasuperb/services/generation_skills/skills/panel_assignment.py`: assign page and panel numbers with the existing panel-per-page policy.
- Create `mangasuperb/services/generation_skills/skills/visual_mode.py`: resolve black-white versus color constraints.
- Create `mangasuperb/services/generation_skills/skills/character_consistency.py`: build character locks and reference priority constraints.
- Create `mangasuperb/services/generation_skills/skills/dialogue_rendering.py`: select page-render dialogue policy.
- Create `mangasuperb/services/generation_skills/skills/panel_fidelity.py`: scope prompt content to current page panels.
- Create `mangasuperb/services/generation_skills/skills/layout_discipline.py`: preserve panel count, gutters, reading order, and aspect ratio.
- Modify `mangasuperb/services/__init__.py`: export `generation_skills`.
- Modify `mangasuperb/services/jobs.py`: route shot splitting and page rendering through the new package.
- Create `tests/test_generation_skills_pipeline.py`: base pipeline behavior.
- Create `tests/test_generation_shot_split.py`: deterministic shot-split behavior.
- Create `tests/test_generation_page_render.py`: deterministic page-render prompt behavior.
- Create `tests/test_generation_prompt_optimizer.py`: `.env` gate and fallback behavior.
- Modify `tests/test_jobs_workflow.py`: integration coverage for disabled and enabled optimization.

## Task 1: Configuration And Optimizer Gate

**Files:**
- Modify: `config.py`
- Modify: `.env.example`
- Modify: `tests/conftest.py`
- Create: `mangasuperb/services/generation_skills/__init__.py`
- Create: `mangasuperb/services/generation_skills/prompt_optimizer.py`
- Create: `tests/test_generation_prompt_optimizer.py`

- [ ] **Step 1: Write failing optimizer config tests**

```python
# tests/test_generation_prompt_optimizer.py
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_generation_prompt_optimizer.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'mangasuperb.services.generation_skills'`.

- [ ] **Step 3: Add config defaults**

In `config.py`, after `TEXT_PROVIDER = os.getenv('TEXT_PROVIDER', 'gemini')`, add:

```python
    GENERATION_PROMPT_OPTIMIZATION_ENABLED = (
        os.getenv("GENERATION_PROMPT_OPTIMIZATION_ENABLED", "false").strip().lower()
        == "true"
    )
    GENERATION_PROMPT_OPTIMIZATION_SCOPES = os.getenv(
        "GENERATION_PROMPT_OPTIMIZATION_SCOPES",
        "shot_split,page_render",
    )
```

In `tests/conftest.py`, inside the `app.config.update` call after `TEXT_PROVIDER="gemini"`, add:

```python
        GENERATION_PROMPT_OPTIMIZATION_ENABLED=False,
        GENERATION_PROMPT_OPTIMIZATION_SCOPES="shot_split,page_render",
```

In `.env.example`, after the AI provider section, add:

```dotenv
# Generation-stage prompt optimization
# Disabled by default because enabled scopes add one extra text-model call.
GENERATION_PROMPT_OPTIMIZATION_ENABLED=false
GENERATION_PROMPT_OPTIMIZATION_SCOPES=shot_split,page_render
```

- [ ] **Step 4: Add the optimizer service**

Create `mangasuperb/services/generation_skills/__init__.py`:

```python
"""Runtime generation skills and prompt optimization helpers."""
```

Create `mangasuperb/services/generation_skills/prompt_optimizer.py`:

```python
"""Optional model-backed prompt optimization gated by backend config."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Callable, Iterable

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
    provider_factory: Callable[[], TextProvider] = get_text_provider,
) -> PromptOptimizationResult:
    if not _scope_enabled(scope):
        return PromptOptimizationResult(text=source_text, enabled=False, called=False)

    try:
        prompt = _build_optimizer_prompt(scope, source_text, metadata)
        optimized = provider_factory().generate_text(prompt).strip()
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
```

- [ ] **Step 5: Run the optimizer tests**

Run: `.venv/bin/python -m pytest tests/test_generation_prompt_optimizer.py -v`

Expected: PASS with 5 tests passing.

- [ ] **Step 6: Commit**

```bash
git add config.py .env.example tests/conftest.py mangasuperb/services/generation_skills/__init__.py mangasuperb/services/generation_skills/prompt_optimizer.py tests/test_generation_prompt_optimizer.py
git commit -m "feat: gate generation prompt optimization by config"
```

## Task 2: Core Skill Context And Pipeline

**Files:**
- Create: `mangasuperb/services/generation_skills/context.py`
- Create: `mangasuperb/services/generation_skills/constraints.py`
- Create: `mangasuperb/services/generation_skills/pipeline.py`
- Create: `mangasuperb/services/generation_skills/registry.py`
- Create: `mangasuperb/services/generation_skills/skills/__init__.py`
- Modify: `mangasuperb/services/__init__.py`
- Create: `tests/test_generation_skills_pipeline.py`

- [ ] **Step 1: Write failing pipeline tests**

```python
# tests/test_generation_skills_pipeline.py
from __future__ import annotations

import logging

import pytest

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext, LayoutContext, PanelContext
from mangasuperb.services.generation_skills.pipeline import SkillPipeline, SkillPipelineError


def _context(task_type: str = "page_render") -> GenerationContext:
    return GenerationContext(
        task_type=task_type,
        comic_id=1,
        comic_title="Test Comic",
        page_number=1,
        story="A hero enters the city.",
        style_notes="Classic manga black and white linework.",
        script_data={},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="A hero enters the city.",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
                source_title="Opening",
            ),
        ),
        layout=LayoutContext(
            layout_key="auto-grid",
            instruction="Arrange panels evenly in a balanced manga grid.",
            notes=None,
            aspect_ratio="16:9",
        ),
        characters=(),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


class RecordingSkill:
    id = "recording"
    scopes = ("page_render",)
    priority = 20
    required = False

    def __init__(self, sink: list[str]) -> None:
        self.sink = sink

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        self.sink.append(self.id)
        constraints.add_positive("recorded")


class EarlySkill(RecordingSkill):
    id = "early"
    priority = 10


class OptionalFailure:
    id = "optional_failure"
    scopes = ("page_render",)
    priority = 5
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raise RuntimeError("optional failed")


class RequiredFailure(OptionalFailure):
    id = "required_failure"
    required = True


def test_pipeline_runs_skills_in_priority_order() -> None:
    sink: list[str] = []
    result = SkillPipeline([RecordingSkill(sink), EarlySkill(sink)]).run(_context())

    assert sink == ["early", "recording"]
    assert result.positive_constraints == ("recorded",)
    assert result.metadata["applied_skills"] == ["early", "recording"]


def test_pipeline_skips_non_matching_scope() -> None:
    sink: list[str] = []
    result = SkillPipeline([RecordingSkill(sink)]).run(_context("shot_split"))

    assert sink == []
    assert result.positive_constraints == ()
    assert result.metadata["applied_skills"] == []


def test_pipeline_logs_and_skips_optional_failure(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)

    result = SkillPipeline([OptionalFailure()]).run(_context())

    assert result.metadata["applied_skills"] == []
    assert result.metadata["skipped_skills"] == ["optional_failure"]
    assert "optional failed" in caplog.text


def test_pipeline_raises_required_failure() -> None:
    with pytest.raises(SkillPipelineError, match="required_failure"):
        SkillPipeline([RequiredFailure()]).run(_context())
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_pipeline.py -v`

Expected: FAIL with import errors for missing context and pipeline modules.

- [ ] **Step 3: Add context and constraint dataclasses**

Create `mangasuperb/services/generation_skills/context.py`:

```python
"""Structured inputs for runtime generation skills."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class PanelContext:
    panel_number: int | None
    sequence_index: int
    description: str
    dialogue: str | None = None
    camera_notes: str | None = None
    style_notes: str | None = None
    source_title: str | None = None


@dataclass(frozen=True)
class LayoutContext:
    layout_key: str
    instruction: str
    notes: str | None = None
    aspect_ratio: str | None = None


@dataclass(frozen=True)
class CharacterContext:
    name: str
    role: str | None = None
    description: str | None = None
    optimized_description: str | None = None
    style_prompt: str | None = None
    reference_note: str | None = None


@dataclass(frozen=True)
class GenerationContext:
    task_type: str
    comic_id: int | None
    comic_title: str
    page_number: int | None
    story: str
    style_notes: str
    script_data: dict[str, Any] = field(default_factory=dict)
    panels: tuple[PanelContext, ...] = ()
    layout: LayoutContext | None = None
    characters: tuple[CharacterContext, ...] = ()
    visual_preferences: dict[str, Any] = field(default_factory=dict)
    reference_notes: tuple[str, ...] = ()
    previous_context_lines: tuple[str, ...] = ()
    text_options: dict[str, Any] = field(default_factory=dict)
```

Create `mangasuperb/services/generation_skills/constraints.py`:

```python
"""Constraint accumulation for runtime generation skills."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ConstraintSet:
    visual_mode: str | None = None
    dialogue_mode: str | None = None
    positive_constraints: list[str] = field(default_factory=list)
    negative_constraints: list[str] = field(default_factory=list)
    character_locks: list[str] = field(default_factory=list)
    layout_constraints: list[str] = field(default_factory=list)
    panel_constraints: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(
        default_factory=lambda: {"applied_skills": [], "skipped_skills": []}
    )

    def add_positive(self, value: str) -> None:
        if value and value not in self.positive_constraints:
            self.positive_constraints.append(value)

    def add_negative(self, value: str) -> None:
        if value and value not in self.negative_constraints:
            self.negative_constraints.append(value)

    def add_character_lock(self, value: str) -> None:
        if value and value not in self.character_locks:
            self.character_locks.append(value)

    def add_layout_constraint(self, value: str) -> None:
        if value and value not in self.layout_constraints:
            self.layout_constraints.append(value)

    def add_panel_constraint(self, value: str) -> None:
        if value and value not in self.panel_constraints:
            self.panel_constraints.append(value)


@dataclass(frozen=True)
class ResolvedConstraints:
    visual_mode: str | None
    dialogue_mode: str | None
    positive_constraints: tuple[str, ...]
    negative_constraints: tuple[str, ...]
    character_locks: tuple[str, ...]
    layout_constraints: tuple[str, ...]
    panel_constraints: tuple[str, ...]
    metadata: dict[str, Any]


def resolve_constraints(constraints: ConstraintSet) -> ResolvedConstraints:
    return ResolvedConstraints(
        visual_mode=constraints.visual_mode,
        dialogue_mode=constraints.dialogue_mode,
        positive_constraints=tuple(constraints.positive_constraints),
        negative_constraints=tuple(constraints.negative_constraints),
        character_locks=tuple(constraints.character_locks),
        layout_constraints=tuple(constraints.layout_constraints),
        panel_constraints=tuple(constraints.panel_constraints),
        metadata=dict(constraints.metadata),
    )
```

- [ ] **Step 4: Add pipeline, registry, and exports**

Create `mangasuperb/services/generation_skills/pipeline.py`:

```python
"""Runtime skill pipeline."""
from __future__ import annotations

import logging
from typing import Protocol

from mangasuperb.services.generation_skills.constraints import (
    ConstraintSet,
    ResolvedConstraints,
    resolve_constraints,
)
from mangasuperb.services.generation_skills.context import GenerationContext

logger = logging.getLogger(__name__)


class SkillPipelineError(RuntimeError):
    """Raised when a required generation skill fails."""


class GenerationSkill(Protocol):
    id: str
    scopes: tuple[str, ...]
    priority: int
    required: bool

    def should_apply(self, context: GenerationContext) -> bool:
        raise NotImplementedError

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raise NotImplementedError


class SkillPipeline:
    def __init__(self, skills: list[GenerationSkill] | tuple[GenerationSkill, ...]) -> None:
        self.skills = sorted(skills, key=lambda skill: (skill.priority, skill.id))

    def run(self, context: GenerationContext) -> ResolvedConstraints:
        constraints = ConstraintSet()
        for skill in self.skills:
            if context.task_type not in skill.scopes:
                continue
            if not skill.should_apply(context):
                continue
            try:
                skill.apply(context, constraints)
                constraints.metadata["applied_skills"].append(skill.id)
            except Exception as exc:
                if skill.required:
                    raise SkillPipelineError(f"Required skill failed: {skill.id}") from exc
                constraints.metadata["skipped_skills"].append(skill.id)
                logger.warning("Generation skill skipped id=%s error=%s", skill.id, exc)
        return resolve_constraints(constraints)
```

Create `mangasuperb/services/generation_skills/registry.py`:

```python
"""Built-in generation skill registry."""
from __future__ import annotations

from mangasuperb.services.generation_skills.pipeline import GenerationSkill


def get_builtin_skills(task_type: str) -> tuple[GenerationSkill, ...]:
    from mangasuperb.services.generation_skills.skills.camera_style_enrichment import (
        CameraStyleEnrichmentSkill,
    )
    from mangasuperb.services.generation_skills.skills.character_consistency import (
        CharacterConsistencySkill,
    )
    from mangasuperb.services.generation_skills.skills.dialogue_extraction import (
        DialogueExtractionSkill,
    )
    from mangasuperb.services.generation_skills.skills.dialogue_rendering import (
        DialogueRenderingSkill,
    )
    from mangasuperb.services.generation_skills.skills.layout_discipline import (
        LayoutDisciplineSkill,
    )
    from mangasuperb.services.generation_skills.skills.panel_assignment import (
        PanelAssignmentSkill,
    )
    from mangasuperb.services.generation_skills.skills.panel_fidelity import (
        PanelFidelitySkill,
    )
    from mangasuperb.services.generation_skills.skills.shot_boundary import ShotBoundarySkill
    from mangasuperb.services.generation_skills.skills.visual_mode import VisualModeSkill

    skills: tuple[GenerationSkill, ...] = (
        ShotBoundarySkill(),
        DialogueExtractionSkill(),
        CameraStyleEnrichmentSkill(),
        PanelAssignmentSkill(),
        VisualModeSkill(),
        CharacterConsistencySkill(),
        DialogueRenderingSkill(),
        PanelFidelitySkill(),
        LayoutDisciplineSkill(),
    )
    return tuple(skill for skill in skills if task_type in skill.scopes)
```

Create `mangasuperb/services/generation_skills/skills/__init__.py`:

```python
"""Built-in runtime generation skills."""
```

Modify `mangasuperb/services/__init__.py`:

```python
"""Service layer helpers for MangaSuperb."""
__all__ = [
    "generation",
    "generation_skills",
    "jobs",
]
```

- [ ] **Step 5: Add temporary empty skill classes so imports resolve**

Create each skill file listed in the registry with this pattern, changing the class name, `id`, and `scopes` to match the filename:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class ShotBoundarySkill:
    id = "shot_boundary"
    scopes = ("shot_split",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return False

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        return None
```

Use these exact class mappings:

```text
shot_boundary.py -> ShotBoundarySkill -> id "shot_boundary" -> scopes ("shot_split",)
dialogue_extraction.py -> DialogueExtractionSkill -> id "dialogue_extraction" -> scopes ("shot_split",)
camera_style_enrichment.py -> CameraStyleEnrichmentSkill -> id "camera_style_enrichment" -> scopes ("shot_split",)
panel_assignment.py -> PanelAssignmentSkill -> id "panel_assignment" -> scopes ("shot_split",)
visual_mode.py -> VisualModeSkill -> id "visual_mode" -> scopes ("page_render",)
character_consistency.py -> CharacterConsistencySkill -> id "character_consistency" -> scopes ("page_render",)
dialogue_rendering.py -> DialogueRenderingSkill -> id "dialogue_rendering" -> scopes ("page_render",)
panel_fidelity.py -> PanelFidelitySkill -> id "panel_fidelity" -> scopes ("page_render",)
layout_discipline.py -> LayoutDisciplineSkill -> id "layout_discipline" -> scopes ("page_render",)
```

- [ ] **Step 6: Run the pipeline tests**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_pipeline.py -v`

Expected: PASS with 4 tests passing.

- [ ] **Step 7: Commit**

```bash
git add mangasuperb/services/__init__.py mangasuperb/services/generation_skills tests/test_generation_skills_pipeline.py
git commit -m "feat: add generation skill pipeline"
```

## Task 3: Deterministic Shot Split Skills

**Files:**
- Create: `mangasuperb/services/generation_skills/shot_split.py`
- Modify: `mangasuperb/services/generation_skills/context.py`
- Modify: `mangasuperb/services/generation_skills/skills/shot_boundary.py`
- Modify: `mangasuperb/services/generation_skills/skills/dialogue_extraction.py`
- Modify: `mangasuperb/services/generation_skills/skills/camera_style_enrichment.py`
- Modify: `mangasuperb/services/generation_skills/skills/panel_assignment.py`
- Create: `tests/test_generation_shot_split.py`

- [ ] **Step 1: Write failing shot split tests**

```python
# tests/test_generation_shot_split.py
from __future__ import annotations

from mangasuperb.services.generation_skills.context import GenerationContext, PanelContext
from mangasuperb.services.generation_skills.shot_split import resolve_shot_drafts


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="shot_split",
        comic_id=7,
        comic_title="Test Comic",
        page_number=None,
        story="秦飞扬滚落台阶。“姓马的，我诅咒你不得好死！”他怒吼。",
        style_notes="Expressive ink",
        script_data={
            "panels": [
                {
                    "scene": "Original generated scene",
                    "dialogue": "Original generated line",
                    "camera": "low angle",
                    "visual_notes": "speed lines",
                }
            ]
        },
        panels=(
            PanelContext(
                panel_number=None,
                sequence_index=1,
                description="秦飞扬滚落台阶。“姓马的，我诅咒你不得好死！”他怒吼。",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
                source_title="Confrontation",
            ),
        ),
        layout=None,
        characters=(),
        visual_preferences={},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


def test_shot_split_preserves_order_and_extracts_dialogue() -> None:
    drafts, metadata = resolve_shot_drafts(_context(), panels_per_page=4)

    assert len(drafts) == 1
    assert drafts[0].sequence_index == 1
    assert drafts[0].page_number == 1
    assert drafts[0].panel_number == 1
    assert drafts[0].title == "Confrontation"
    assert drafts[0].dialogue == "姓马的，我诅咒你不得好死！"
    assert drafts[0].description.startswith("秦飞扬滚落台阶")
    assert metadata["applied_skills"] == [
        "shot_boundary",
        "dialogue_extraction",
        "camera_style_enrichment",
        "panel_assignment",
    ]


def test_shot_split_preserves_explicit_camera_and_style_fields() -> None:
    drafts, metadata = resolve_shot_drafts(_context(), panels_per_page=4)

    assert drafts[0].camera_notes == "low angle"
    assert drafts[0].style_notes == "speed lines"
    assert metadata["panel_count"] == 1


def test_shot_split_does_not_invent_extra_drafts() -> None:
    drafts, metadata = resolve_shot_drafts(_context(), panels_per_page=4)

    assert [draft.sequence_index for draft in drafts] == [1]
    assert metadata["skipped_skills"] == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_generation_shot_split.py -v`

Expected: FAIL with `ImportError` for missing `resolve_shot_drafts`.

- [ ] **Step 3: Add shot draft dataclass and resolver**

Append to `mangasuperb/services/generation_skills/context.py`:

```python
@dataclass(frozen=True)
class ShotDraft:
    sequence_index: int
    title: str
    description: str
    dialogue: str | None
    camera_notes: str | None
    style_notes: str | None
    page_number: int
    panel_number: int
```

Create `mangasuperb/services/generation_skills/shot_split.py`:

```python
"""Shot split context resolution."""
from __future__ import annotations

from mangasuperb.services.generation_skills.context import GenerationContext, ShotDraft
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.registry import get_builtin_skills


def resolve_shot_drafts(
    context: GenerationContext,
    *,
    panels_per_page: int,
) -> tuple[tuple[ShotDraft, ...], dict]:
    constraints = SkillPipeline(get_builtin_skills("shot_split")).run(context)
    drafts = tuple(constraints.metadata.get("shot_drafts", ()))
    metadata = dict(constraints.metadata)
    metadata["panel_count"] = len(drafts)
    metadata.pop("shot_drafts", None)
    return drafts, metadata
```

- [ ] **Step 4: Implement shot split skills**

Replace `mangasuperb/services/generation_skills/skills/shot_boundary.py` with:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class ShotBoundarySkill:
    id = "shot_boundary"
    scopes = ("shot_split",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        drafts: list[dict] = []
        panel_payload = context.script_data.get("panels")
        payload_items = panel_payload if isinstance(panel_payload, list) else []
        for index, panel in enumerate(context.panels, start=1):
            entry = payload_items[index - 1] if index <= len(payload_items) else {}
            if not isinstance(entry, dict):
                entry = {}
            drafts.append(
                {
                    "sequence_index": panel.sequence_index,
                    "title": panel.source_title or f"Section {index}",
                    "description": panel.description,
                    "dialogue": panel.dialogue,
                    "camera_notes": panel.camera_notes,
                    "style_notes": panel.style_notes,
                    "entry": entry,
                }
            )
        constraints.metadata["shot_drafts"] = drafts
```

Replace `mangasuperb/services/generation_skills/skills/dialogue_extraction.py` with:

```python
from __future__ import annotations

import re

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class DialogueExtractionSkill:
    id = "dialogue_extraction"
    scopes = ("shot_split",)
    priority = 20
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        drafts = constraints.metadata.get("shot_drafts", [])
        for draft in drafts:
            if draft.get("dialogue"):
                continue
            match = re.search(r"[“\"]([^”\"]+)[”\"]", draft.get("description", ""))
            if match:
                draft["dialogue"] = match.group(1).strip()
                continue
            entry = draft.get("entry", {})
            dialogue = entry.get("dialogue") if isinstance(entry, dict) else None
            if isinstance(dialogue, str) and dialogue.strip():
                draft["dialogue"] = dialogue.strip()
```

Replace `mangasuperb/services/generation_skills/skills/camera_style_enrichment.py` with:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class CameraStyleEnrichmentSkill:
    id = "camera_style_enrichment"
    scopes = ("shot_split",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        for draft in constraints.metadata.get("shot_drafts", []):
            entry = draft.get("entry", {})
            if not isinstance(entry, dict):
                entry = {}
            if not draft.get("camera_notes"):
                camera = entry.get("camera") or entry.get("camera_notes")
                if isinstance(camera, str) and camera.strip():
                    draft["camera_notes"] = camera.strip()
            if not draft.get("style_notes"):
                style = entry.get("visual_notes") or context.style_notes
                if isinstance(style, str) and style.strip():
                    draft["style_notes"] = style.strip()
```

Replace `mangasuperb/services/generation_skills/skills/panel_assignment.py` with:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext, ShotDraft


class PanelAssignmentSkill:
    id = "panel_assignment"
    scopes = ("shot_split",)
    priority = 40
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        panels_per_page = int(context.text_options.get("panels_per_page", 4))
        resolved: list[ShotDraft] = []
        for index, draft in enumerate(constraints.metadata.get("shot_drafts", []), start=1):
            page_number = (index - 1) // panels_per_page + 1
            panel_number = ((index - 1) % panels_per_page) + 1
            resolved.append(
                ShotDraft(
                    sequence_index=int(draft["sequence_index"]),
                    title=str(draft["title"]),
                    description=str(draft["description"]),
                    dialogue=draft.get("dialogue"),
                    camera_notes=draft.get("camera_notes"),
                    style_notes=draft.get("style_notes"),
                    page_number=page_number,
                    panel_number=panel_number,
                )
            )
        constraints.metadata["shot_drafts"] = tuple(resolved)
```

In `resolve_shot_drafts()`, pass `panels_per_page` through `text_options` by creating a new context:

```python
    context = GenerationContext(
        task_type=context.task_type,
        comic_id=context.comic_id,
        comic_title=context.comic_title,
        page_number=context.page_number,
        story=context.story,
        style_notes=context.style_notes,
        script_data=context.script_data,
        panels=context.panels,
        layout=context.layout,
        characters=context.characters,
        visual_preferences=context.visual_preferences,
        reference_notes=context.reference_notes,
        previous_context_lines=context.previous_context_lines,
        text_options={**context.text_options, "panels_per_page": panels_per_page},
    )
```

- [ ] **Step 5: Run the shot split tests**

Run: `.venv/bin/python -m pytest tests/test_generation_shot_split.py -v`

Expected: PASS with 3 tests passing.

- [ ] **Step 6: Commit**

```bash
git add mangasuperb/services/generation_skills/context.py mangasuperb/services/generation_skills/shot_split.py mangasuperb/services/generation_skills/skills/shot_boundary.py mangasuperb/services/generation_skills/skills/dialogue_extraction.py mangasuperb/services/generation_skills/skills/camera_style_enrichment.py mangasuperb/services/generation_skills/skills/panel_assignment.py tests/test_generation_shot_split.py
git commit -m "feat: add deterministic shot split skills"
```

## Task 4: Deterministic Page Render Skills

**Files:**
- Create: `mangasuperb/services/generation_skills/page_render.py`
- Modify: `mangasuperb/services/generation_skills/skills/visual_mode.py`
- Modify: `mangasuperb/services/generation_skills/skills/character_consistency.py`
- Modify: `mangasuperb/services/generation_skills/skills/dialogue_rendering.py`
- Modify: `mangasuperb/services/generation_skills/skills/panel_fidelity.py`
- Modify: `mangasuperb/services/generation_skills/skills/layout_discipline.py`
- Create: `tests/test_generation_page_render.py`

- [ ] **Step 1: Write failing page render tests**

```python
# tests/test_generation_page_render.py
from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.page_render import render_page_prompt


def _context(color_mode: str = "black-white") -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_id=1,
        comic_title="Sky City",
        page_number=1,
        story="A pilot enters a neon city.",
        style_notes="Vibrant full color with classic manga linework.",
        script_data={"title": "Sky City"},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="Aya pilots a damaged airship through smoke.",
                dialogue="Hold on!",
                camera_notes="wide establishing shot",
                style_notes="rich chromatic lighting",
                source_title="Arrival",
            ),
        ),
        layout=LayoutContext(
            layout_key="auto-grid",
            instruction="Arrange panels evenly in a balanced manga grid.",
            notes=None,
            aspect_ratio="16:9",
        ),
        characters=(
            CharacterContext(
                name="Aya",
                role="Protagonist",
                description="A daring pilot.",
                optimized_description="Windswept pilot with a battered bomber jacket.",
                style_prompt="shounen hero",
                reference_note="Reference image 1 shows Aya.",
            ),
        ),
        visual_preferences={"color_mode": color_mode},
        reference_notes=("Reference image 1 shows Aya.",),
        previous_context_lines=("Page 0 Panel 1: Aya starts the engine.",),
        text_options={},
    )


def test_page_render_prompt_resolves_black_white_visual_conflict() -> None:
    prompt, metadata = render_page_prompt(_context("black-white"))

    assert "Visual mode: black-white manga linework" in prompt
    assert "Avoid full-color rendering language" in prompt
    assert "vibrant full color" not in prompt.lower()
    assert metadata["visual_mode"] == "black-white"


def test_page_render_prompt_includes_character_dialogue_layout_and_panel_scope() -> None:
    prompt, metadata = render_page_prompt(_context("black-white"))

    assert "Character locks" in prompt
    assert "Aya" in prompt
    assert "Protagonist" in prompt
    assert "Panel 1: Aya pilots a damaged airship through smoke." in prompt
    assert "Dialogue: Hold on!" in prompt
    assert "Layout constraints" in prompt
    assert "panel boundaries" in prompt
    assert "Current page panels override previous page context" in prompt
    assert metadata["dialogue_mode"] in {"render_text", "hybrid"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_generation_page_render.py -v`

Expected: FAIL with `ImportError` for missing `render_page_prompt`.

- [ ] **Step 3: Implement page render skills**

Replace `visual_mode.py`:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class VisualModeSkill:
    id = "visual_mode"
    scopes = ("page_render",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raw = str(context.visual_preferences.get("color_mode", "black-white")).strip().lower()
        mode = "color" if raw == "color" else "black-white"
        constraints.visual_mode = mode
        if mode == "black-white":
            constraints.add_positive("Visual mode: black-white manga linework, ink, screentone, grayscale contrast.")
            constraints.add_negative("Avoid full-color rendering language, chromatic gradients, and vibrant color wash.")
        else:
            constraints.add_positive("Visual mode: full-color manga illustration with controlled lighting.")
```

Replace `character_consistency.py`:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class CharacterConsistencySkill:
    id = "character_consistency"
    scopes = ("page_render",)
    priority = 20
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.characters or context.reference_notes)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        for character in context.characters:
            parts = [character.name]
            if character.role:
                parts.append(f"role: {character.role}")
            description = character.optimized_description or character.description
            if description:
                parts.append(description)
            if character.reference_note:
                parts.append(character.reference_note)
            constraints.add_character_lock("; ".join(parts))
        if context.reference_notes:
            constraints.add_positive("Reference images outrank conflicting text descriptions for character appearance.")
```

Replace `dialogue_rendering.py`:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class DialogueRenderingSkill:
    id = "dialogue_rendering"
    scopes = ("page_render",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return any(panel.dialogue for panel in context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        dialogues = [panel.dialogue or "" for panel in context.panels if panel.dialogue]
        total_length = sum(len(item) for item in dialogues)
        constraints.dialogue_mode = "render_text" if len(dialogues) == 1 and total_length <= 40 else "hybrid"
        if constraints.dialogue_mode == "render_text":
            constraints.add_positive("Render short dialogue in clean speech bubbles near the correct speaker.")
        else:
            constraints.add_positive("Use hybrid dialogue rendering: clean speech bubbles, reserved lettering space, and best-effort short readable text.")
```

Replace `panel_fidelity.py`:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class PanelFidelitySkill:
    id = "panel_fidelity"
    scopes = ("page_render",)
    priority = 40
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        constraints.add_panel_constraint("Current page panels override previous page context.")
        constraints.add_panel_constraint("Focus only on the panels described for this page.")
```

Replace `layout_discipline.py`:

```python
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class LayoutDisciplineSkill:
    id = "layout_discipline"
    scopes = ("page_render",)
    priority = 50
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return context.layout is not None

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        panel_count = len(context.panels)
        aspect_ratio = context.layout.aspect_ratio if context.layout else None
        constraints.add_layout_constraint(f"Preserve exactly {panel_count} panel(s).")
        constraints.add_layout_constraint("Use clear panel boundaries, gutters, and manga reading order.")
        if aspect_ratio:
            constraints.add_layout_constraint(f"Target aspect ratio: {aspect_ratio}.")
```

- [ ] **Step 4: Implement page prompt renderer**

Create `mangasuperb/services/generation_skills/page_render.py`:

```python
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
        f"Task: Render page {context.page_number} of manga \"{context.comic_title}\".",
    ]

    if resolved.positive_constraints:
        sections.append("Positive constraints:\n" + "\n".join(resolved.positive_constraints))
    if resolved.character_locks:
        sections.append("Character locks:\n" + "\n".join(resolved.character_locks))
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
        sections.append("Previous page continuity:\n" + "\n".join(context.previous_context_lines))
    if resolved.negative_constraints:
        sections.append("Negative constraints:\n" + "\n".join(resolved.negative_constraints))

    metadata = dict(resolved.metadata)
    metadata["visual_mode"] = resolved.visual_mode
    metadata["dialogue_mode"] = resolved.dialogue_mode
    return "\n\n".join(section for section in sections if section), metadata
```

- [ ] **Step 5: Run the page render tests**

Run: `.venv/bin/python -m pytest tests/test_generation_page_render.py -v`

Expected: PASS with 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add mangasuperb/services/generation_skills/page_render.py mangasuperb/services/generation_skills/skills/visual_mode.py mangasuperb/services/generation_skills/skills/character_consistency.py mangasuperb/services/generation_skills/skills/dialogue_rendering.py mangasuperb/services/generation_skills/skills/panel_fidelity.py mangasuperb/services/generation_skills/skills/layout_discipline.py tests/test_generation_page_render.py
git commit -m "feat: add page render generation skills"
```

## Task 5: Job Integration With Optimizer Disabled By Default

**Files:**
- Modify: `mangasuperb/services/jobs.py`
- Modify: `tests/test_jobs_workflow.py`

- [ ] **Step 1: Write failing integration assertions**

In `tests/test_jobs_workflow.py`, add this assertion to `test_sequential_workflow_generates_resources()` after `assert len(prompts) == 1`:

```python
        assert "Panel-by-panel content:" in prompts[0]
        assert "Layout constraints:" in prompts[0]
        assert "Character locks:" not in prompts[0]
```

Add this test near `test_shot_stage_recovers_dialogue_from_summary()`:

```python
def test_default_workflow_does_not_call_text_optimizer(app, comic: Comic, monkeypatch):
    calls: list[str] = []

    def fail_text_provider():
        raise AssertionError("text optimizer should be disabled by default")

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        fail_text_provider,
    )

    with app.app_context():
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        result = jobs.process_shot_stage(comic.id)

        assert result["status"] == "completed"
        assert calls == []
```

- [ ] **Step 2: Run targeted integration tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_jobs_workflow.py::test_sequential_workflow_generates_resources tests/test_jobs_workflow.py::test_default_workflow_does_not_call_text_optimizer -v`

Expected: FAIL because `process_page_render_stage()` still uses the old prompt builder.

- [ ] **Step 3: Add job adapters inside `jobs.py`**

In `mangasuperb/services/jobs.py`, import the new helpers:

```python
from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.page_render import render_page_prompt
from mangasuperb.services.generation_skills.prompt_optimizer import optimize_text_if_enabled
from mangasuperb.services.generation_skills.shot_split import resolve_shot_drafts
```

Add helper functions above `process_outline_stage()`:

```python
def _build_shot_split_context(
    comic: Comic,
    script_data: dict[str, Any],
    outline_sections: Sequence[ComicOutlineSection],
) -> GenerationContext:
    panels = tuple(
        PanelContext(
            panel_number=None,
            sequence_index=idx,
            description=section.summary or "",
            dialogue=None,
            camera_notes=None,
            style_notes=None,
            source_title=section.title,
        )
        for idx, section in enumerate(outline_sections, start=1)
    )
    story = ""
    story_value = script_data.get("story")
    if isinstance(story_value, str):
        story = story_value
    return GenerationContext(
        task_type="shot_split",
        comic_id=comic.id,
        comic_title=comic.title or "Untitled",
        page_number=None,
        story=story,
        style_notes=script_data.get("style_notes") or comic.style_description or "",
        script_data=script_data,
        panels=panels,
        layout=None,
        characters=(),
        visual_preferences={},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


def _build_page_render_context(
    comic: Comic,
    script_data: dict[str, Any],
    page_number: int,
    layout_instruction: str,
    layout_key: str,
    layout_notes: str | None,
    panels: Sequence[ComicPanelShot],
    normalized_color: str,
    normalized_aspect_ratio: str,
    ref_lines: Sequence[str],
    previous_context_lines: Sequence[str],
) -> GenerationContext:
    panel_contexts = tuple(
        PanelContext(
            panel_number=panel.panel_number,
            sequence_index=panel.sequence_index,
            description=panel.description or "Scene description missing",
            dialogue=panel.dialogue,
            camera_notes=panel.camera_notes,
            style_notes=panel.style_notes,
            source_title=None,
        )
        for panel in panels
    )
    characters = tuple(
        CharacterContext(
            name=link.character.name,
            role=link.role,
            description=link.character.description,
            optimized_description=link.character.optimized_description,
            style_prompt=link.character.style_prompt,
            reference_note=None,
        )
        for link in comic.character_links
        if link.character
    )
    return GenerationContext(
        task_type="page_render",
        comic_id=comic.id,
        comic_title=script_data.get("title") or comic.title or "Untitled",
        page_number=page_number,
        story=str(script_data.get("story") or ""),
        style_notes=script_data.get("style_notes") or comic.style_description or "",
        script_data=script_data,
        panels=panel_contexts,
        layout=LayoutContext(
            layout_key=layout_key,
            instruction=layout_instruction,
            notes=layout_notes,
            aspect_ratio=normalized_aspect_ratio,
        ),
        characters=characters,
        visual_preferences={"color_mode": normalized_color},
        reference_notes=tuple(ref_lines),
        previous_context_lines=tuple(previous_context_lines),
        text_options={},
    )
```

- [ ] **Step 4: Route `process_shot_stage()` through shot drafts**

Inside `process_shot_stage()`, after `page_panel_map` is initialized and before the panel creation loop, add:

```python
            shot_context = _build_shot_split_context(comic, script_data, outline_sections)
            shot_drafts, shot_metadata = resolve_shot_drafts(
                shot_context,
                panels_per_page=PANELS_PER_PAGE,
            )
            logger.info(
                "Generation skills task_type=shot_split skills=%s prompt_optimizer_enabled=%s text_model_call_count=%s panel_count=%s skipped_skills=%s",
                ",".join(shot_metadata.get("applied_skills", [])),
                False,
                0,
                shot_metadata.get("panel_count", 0),
                ",".join(shot_metadata.get("skipped_skills", [])),
            )
```

Replace the loop `for idx in range(1, total_sections + 1):` through the assignment of `panel_number` with a loop over `shot_drafts`:

```python
            for draft in shot_drafts:
                idx = draft.sequence_index
                section = outline_sections[idx - 1]
                description = draft.description
                dialogue_text = draft.dialogue
                camera_notes = draft.camera_notes
                style_notes = draft.style_notes
                page_number = draft.page_number
                panel_number = draft.panel_number
```

Keep the existing create/update/delete database logic after those local variables unchanged.

- [ ] **Step 5: Route `process_page_render_stage()` through page render skills**

In `process_page_render_stage()`, keep `panel_lines` creation until no tests depend on the old helper, but replace the call to `build_page_render_prompt` with:

```python
            page_context = _build_page_render_context(
                comic,
                script_data,
                page_number,
                layout_instruction,
                layout.layout_key,
                layout.notes,
                panels,
                normalized_color,
                normalized_aspect_ratio,
                ref_lines,
                previous_context_lines,
            )
            prompt, prompt_metadata = render_page_prompt(page_context)
            optimization = optimize_text_if_enabled(
                scope="page_render",
                source_text=prompt,
                metadata=prompt_metadata,
                required_phrases=tuple(
                    f"Panel {panel.panel_number or panel.sequence_index}"
                    for panel in panels
                ),
            )
            prompt = optimization.text
            logger.info(
                "Generation skills task_type=page_render skills=%s prompt_optimizer_enabled=%s text_model_call_count=%s visual_mode=%s dialogue_mode=%s skipped_skills=%s",
                ",".join(prompt_metadata.get("applied_skills", [])),
                optimization.enabled,
                1 if optimization.called else 0,
                prompt_metadata.get("visual_mode"),
                prompt_metadata.get("dialogue_mode"),
                ",".join(prompt_metadata.get("skipped_skills", [])),
            )
```

- [ ] **Step 6: Run targeted integration tests**

Run: `.venv/bin/python -m pytest tests/test_jobs_workflow.py::test_sequential_workflow_generates_resources tests/test_jobs_workflow.py::test_render_prompt_includes_character_roster tests/test_jobs_workflow.py::test_shot_stage_recovers_dialogue_from_summary tests/test_jobs_workflow.py::test_default_workflow_does_not_call_text_optimizer -v`

Expected: PASS with 4 tests passing.

- [ ] **Step 7: Commit**

```bash
git add mangasuperb/services/jobs.py tests/test_jobs_workflow.py
git commit -m "feat: route generation jobs through skills"
```

## Task 6: Enabled Model-Backed Optimization Integration

**Files:**
- Modify: `mangasuperb/services/generation_skills/shot_split.py`
- Modify: `mangasuperb/services/jobs.py`
- Modify: `tests/test_generation_shot_split.py`
- Modify: `tests/test_jobs_workflow.py`

- [ ] **Step 1: Write failing enabled-optimizer tests**

Add to `tests/test_jobs_workflow.py`:

```python
class FakeOptimizerProvider:
    def __init__(self, calls: list[str], response: str) -> None:
        self.calls = calls
        self.response = response

    def generate_text(self, prompt: str) -> str:
        self.calls.append(prompt)
        return self.response


def test_render_optimizer_runs_once_when_enabled(app, comic: Comic, dummy_storage, monkeypatch):
    image_prompts: list[str] = []
    optimizer_calls: list[str] = []
    _patch_genai(monkeypatch, image_prompts)

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(
            optimizer_calls,
            "Optimized render prompt\nPanel 1: Scene 1\nPanel 2: Scene 2\nPanel 3: Scene 3\nPanel 4: Scene 4",
        ),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "page_render"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)
        result = jobs.process_page_render_stage(comic.id, page_number=1, image_model="test-model")

        assert result["status"] == "processing"
        assert len(optimizer_calls) == 1
        assert image_prompts[0].startswith("Optimized render prompt")


def test_render_optimizer_fallback_when_required_panel_is_dropped(app, comic: Comic, monkeypatch):
    image_prompts: list[str] = []
    optimizer_calls: list[str] = []
    _patch_genai(monkeypatch, image_prompts)

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(optimizer_calls, "Optimized prompt without panel labels"),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "page_render"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)
        jobs.process_page_render_stage(comic.id, page_number=1, image_model="test-model")

        assert len(optimizer_calls) == 1
        assert "Panel-by-panel content:" in image_prompts[0]
```

- [ ] **Step 2: Run tests to verify they fail or expose missing behavior**

Run: `.venv/bin/python -m pytest tests/test_jobs_workflow.py::test_render_optimizer_runs_once_when_enabled tests/test_jobs_workflow.py::test_render_optimizer_fallback_when_required_panel_is_dropped -v`

Expected: first test PASS if Task 5 already wired page-render optimizer; second test PASS if required phrase guard works. If either fails, continue to Step 3.

- [ ] **Step 3: Add shot-split optimizer advisory support**

In `mangasuperb/services/generation_skills/shot_split.py`, add:

```python
import json

from mangasuperb.services.generation_skills.prompt_optimizer import optimize_text_if_enabled


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
```

Then, at the start of `resolve_shot_drafts()`, before running `SkillPipeline`, add:

```python
    optimization = optimize_text_if_enabled(
        scope="shot_split",
        source_text=_drafts_to_json_text(context),
        metadata={"comic_id": context.comic_id, "panel_count": len(context.panels)},
        required_phrases=('"sequence_index"',),
    )
    metadata_prefix = {
        "prompt_optimizer_enabled": optimization.enabled,
        "text_model_call_count": 1 if optimization.called else 0,
        "prompt_optimizer_error": optimization.error,
    }
```

After `metadata = dict(constraints.metadata)`, add:

```python
    metadata.update(metadata_prefix)
```

- [ ] **Step 4: Log shot optimizer metadata from jobs**

In `process_shot_stage()`, update the shot-split structured log arguments:

```python
                shot_metadata.get("prompt_optimizer_enabled", False),
                shot_metadata.get("text_model_call_count", 0),
```

- [ ] **Step 5: Add and run shot optimizer enabled test**

Add to `tests/test_jobs_workflow.py`:

```python
def test_shot_optimizer_runs_once_when_enabled(app, comic: Comic, monkeypatch):
    optimizer_calls: list[str] = []

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(optimizer_calls, "[]"),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "shot_split"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        result = jobs.process_shot_stage(comic.id)

        assert result["status"] == "completed"
        assert len(optimizer_calls) == 1
        assert ComicPanelShot.query.filter_by(comic_id=comic.id).count() == PANELS_PER_PAGE
```

Add this test after it:

```python
def test_shot_optimizer_advisory_updates_structured_fields(app, comic: Comic, monkeypatch):
    optimizer_calls: list[str] = []
    advisory = json.dumps(
        [
            {
                "sequence_index": 1,
                "description": "Model-refined opening action.",
                "dialogue": "Stay close.",
                "camera_notes": "wide shot",
                "style_notes": "speed lines",
            },
            {
                "sequence_index": 99,
                "description": "This extra panel must be ignored.",
            },
        ]
    )

    monkeypatch.setattr(
        "mangasuperb.services.generation_skills.prompt_optimizer.get_text_provider",
        lambda: FakeOptimizerProvider(optimizer_calls, advisory),
    )

    with app.app_context():
        app.config["GENERATION_PROMPT_OPTIMIZATION_ENABLED"] = True
        app.config["GENERATION_PROMPT_OPTIMIZATION_SCOPES"] = "shot_split"
        comic_row = db.session.get(Comic, comic.id)
        jobs.bootstrap_comic_workflow(comic_row)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        result = jobs.process_shot_stage(comic.id)

        assert result["status"] == "completed"
        panels = (
            ComicPanelShot.query.filter_by(comic_id=comic.id)
            .order_by(ComicPanelShot.sequence_index)
            .all()
        )
        assert len(panels) == PANELS_PER_PAGE
        assert panels[0].description == "Model-refined opening action."
        assert panels[0].dialogue == "Stay close."
        assert panels[0].camera_notes == "wide shot"
        assert panels[0].style_notes == "speed lines"
        assert all(panel.sequence_index != 99 for panel in panels)
```

Run: `.venv/bin/python -m pytest tests/test_jobs_workflow.py::test_shot_optimizer_runs_once_when_enabled tests/test_jobs_workflow.py::test_shot_optimizer_advisory_updates_structured_fields tests/test_jobs_workflow.py::test_render_optimizer_runs_once_when_enabled tests/test_jobs_workflow.py::test_render_optimizer_fallback_when_required_panel_is_dropped -v`

Expected: FAIL until `shot_split.py` parses and merges model advisory fields.

- [ ] **Step 6: Parse shot-split advisory JSON without adding panels**

In `mangasuperb/services/generation_skills/shot_split.py`, add:

```python
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

    return GenerationContext(
        task_type=context.task_type,
        comic_id=context.comic_id,
        comic_title=context.comic_title,
        page_number=context.page_number,
        story=context.story,
        style_notes=context.style_notes,
        script_data=context.script_data,
        panels=tuple(merged_panels),
        layout=context.layout,
        characters=context.characters,
        visual_preferences=context.visual_preferences,
        reference_notes=context.reference_notes,
        previous_context_lines=context.previous_context_lines,
        text_options=context.text_options,
    )
```

Then, after creating `metadata_prefix`, add:

```python
    if optimization.called and optimization.error is None:
        context = _merge_shot_advisory(context, optimization.text)
```

Use `required_phrases=('"sequence_index"',)` for the shot-split optimizer call so valid advisory JSON can refine descriptions without being rejected for not repeating the entire source text.

- [ ] **Step 7: Run enabled optimizer integration tests**

Run: `.venv/bin/python -m pytest tests/test_jobs_workflow.py::test_shot_optimizer_runs_once_when_enabled tests/test_jobs_workflow.py::test_shot_optimizer_advisory_updates_structured_fields tests/test_jobs_workflow.py::test_render_optimizer_runs_once_when_enabled tests/test_jobs_workflow.py::test_render_optimizer_fallback_when_required_panel_is_dropped -v`

Expected: PASS with 4 tests passing.

- [ ] **Step 8: Commit**

```bash
git add mangasuperb/services/generation_skills/shot_split.py mangasuperb/services/jobs.py tests/test_jobs_workflow.py
git commit -m "feat: enable scoped generation prompt optimization"
```

## Task 7: Regression Checks And Local Full Flow

**Files:**
- Modify: `docs/generation-skills-authoring.md` if it exists after the older plan is executed
- Modify: `README.md`
- Test: backend and frontend checks

- [ ] **Step 1: Document the backend gate in README**

In `README.md`, in the AI provider configuration section, add:

```markdown
- 生成阶段 Prompt Optimization 默认关闭。若要在后台启用额外文本模型优化，可设置：
  - `GENERATION_PROMPT_OPTIMIZATION_ENABLED=true`
  - `GENERATION_PROMPT_OPTIMIZATION_SCOPES=shot_split,page_render`
  启用后，`shot_split` 每个漫画流程最多多一次文本模型调用，`page_render` 每页最多多一次文本模型调用。
```

- [ ] **Step 2: Run backend targeted tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_generation_prompt_optimizer.py tests/test_generation_skills_pipeline.py tests/test_generation_shot_split.py tests/test_generation_page_render.py tests/test_jobs_workflow.py -v
```

Expected: PASS for all selected tests.

- [ ] **Step 3: Run full backend tests**

Run: `.venv/bin/python -m pytest -q`

Expected: PASS. If a failure appears in unrelated existing tests, capture the failing test names and error messages before changing code.

- [ ] **Step 4: Run backend lint check**

Run: `.venv/bin/python -m ruff check .`

Expected: Existing repository lint findings may still fail. Do not fix unrelated files in this task. Fix only findings introduced in `mangasuperb/services/generation_skills`, `mangasuperb/services/jobs.py`, `config.py`, and the tests touched by this plan.

- [ ] **Step 5: Run frontend quality checks**

Run:

```bash
cd frontend
npm run test -- --run
npm run build
npm run lint
```

Expected: frontend tests and build pass. Lint may show existing warnings, but no new frontend files are part of this feature.

- [ ] **Step 6: Run local full-flow check with test database and test R2 bucket**

Use the existing local full-flow script if it is still available at `/private/tmp/mangasuperb_full_flow_check.py`. Run it with test R2 credentials supplied through environment variables outside the repository:

```bash
R2_DEV_ACCESS_KEY_ID="$R2_DEV_ACCESS_KEY_ID" R2_DEV_SECRET_ACCESS_KEY="$R2_DEV_SECRET_ACCESS_KEY" .venv/bin/python /private/tmp/mangasuperb_full_flow_check.py --storage r2
```

Expected:

```text
comic_status=completed
workflow_status=completed
stage outline=completed
stage shots=completed
stage render=completed
stage export=completed
r2_objects_verified=true
```

Do not write R2 credentials to `.env`, test files, logs, commits, or docs.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: document generation prompt optimization gate"
```

## Self-Review Checklist

- Spec coverage: Task 1 covers `.env` gate and default-off behavior. Task 3 covers deterministic shot splitting. Task 4 covers deterministic page-render constraints. Task 5 covers disabled-by-default job integration. Task 6 covers enabled scoped text-model calls and fallback. Task 7 covers quality checks and local test R2 flow.
- Story enhance boundary: no task calls `/api/stories/enhance`, no task changes `StoryEditor`, and no task rewrites `Script.content["story"]`.
- Cost control: Task 1 and Task 6 enforce scope checks. The plan allows at most one `shot_split` optimizer call per workflow and at most one `page_render` optimizer call per page job.
- Provider boundary: image provider calls remain `generate_image(prompt, ref_parts, normalized_aspect_ratio)`. Text optimization uses the existing `get_text_provider().generate_text()` call shape.
