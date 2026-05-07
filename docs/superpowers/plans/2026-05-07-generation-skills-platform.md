# Generation Skills Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runtime Generation Skills Platform and enable it first for page rendering so prompts are composed from deterministic constraints instead of ad hoc string concatenation.

**Architecture:** Add a provider-agnostic `mangasuperb.services.generation_skills` package. Job code gathers domain data, skills convert it into structured constraints, a pipeline resolves defaults and skill failures, and a deterministic renderer builds the final prompt that the existing image provider API receives unchanged.

**Tech Stack:** Python dataclasses, Flask application context, SQLAlchemy model objects, pytest, existing Gemini and third-party image provider abstractions.

---

## Research And Skill Authoring Inputs

Use these sources while implementing prompt rules:

- OpenAI image generation docs, limitations section: GPT Image can still struggle with precise text placement, recurring-character consistency, and layout-sensitive composition, so tests must verify our prompts reduce ambiguity without promising exact visual control. Source: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI GPT Image prompting guide, dated April 21, 2026: `gpt-image-2` is positioned for text-heavy images, identity-sensitive edits, and multi-panel compositions; dense in-image text benefits from higher quality settings, but this phase keeps provider API unchanged. Source: https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- Google Gemini image generation docs: reference images help preserve critical details; character consistency improves when previous images are included; prompts should be specific and include context. Source: https://ai.google.dev/gemini-api/docs/image-generation
- `skill-creator` principles applied to runtime generation skills: keep each skill concise, set the right degree of freedom, include concrete trigger conditions, and validate every skill with focused examples.

## File Structure

- Create `docs/generation-skills-authoring.md`: internal guide for adding runtime Generation Skills without duplicating prompt text across jobs.
- Create `mangasuperb/services/generation_skills/__init__.py`: public imports for the new package.
- Create `mangasuperb/services/generation_skills/context.py`: immutable input dataclasses normalized from jobs and models.
- Create `mangasuperb/services/generation_skills/constraints.py`: mutable constraint accumulation and resolved-context dataclasses.
- Create `mangasuperb/services/generation_skills/pipeline.py`: skill protocol, execution order, error handling, and final default resolution.
- Create `mangasuperb/services/generation_skills/registry.py`: built-in skill registry for `page_render`.
- Create `mangasuperb/services/generation_skills/page_render.py`: adapter from current `Comic`, `ComicPageLayout`, and `ComicPanelShot` objects into `GenerationContext`.
- Create `mangasuperb/services/generation_skills/renderer.py`: deterministic page prompt renderer with ordered sections and phrase suppression.
- Create `mangasuperb/services/generation_skills/skills/__init__.py`: built-in skill exports.
- Create `mangasuperb/services/generation_skills/skills/visual_mode.py`: required visual mode resolver.
- Create `mangasuperb/services/generation_skills/skills/character_consistency.py`: character locks and reference priority.
- Create `mangasuperb/services/generation_skills/skills/dialogue_rendering.py`: short-text rendering and hybrid dialogue policy.
- Create `mangasuperb/services/generation_skills/skills/panel_fidelity.py`: panel scoping and previous-context priority rules.
- Create `mangasuperb/services/generation_skills/skills/layout_discipline.py`: panel count, gutters, reading order, and aspect-ratio constraints.
- Modify `mangasuperb/services/__init__.py`: include `generation_skills` in exported service modules.
- Modify `mangasuperb/services/jobs.py`: route page render prompt construction through the new pipeline and log resolved skill metadata.
- Create `tests/test_generation_skills_authoring.py`: doc guard for the authoring guide.
- Create `tests/test_generation_skills_pipeline.py`: base pipeline behavior and failure handling.
- Create `tests/test_generation_skills_visual_mode.py`: conflict resolution for black-white and color modes.
- Create `tests/test_generation_skills_dialogue.py`: dialogue policy selection and text preservation.
- Create `tests/test_generation_skills_character_layout.py`: character locks, reference priority, panel fidelity, and layout discipline.
- Create `tests/test_generation_skills_renderer.py`: ordered prompt sections and conflict phrase suppression.
- Modify `tests/test_jobs_workflow.py`: integration coverage proving page render uses the skills pipeline and still calls `generate_image(prompt, ref_parts, aspect_ratio)`.

### Task 1: Runtime Skill Authoring Guide

**Files:**
- Create: `docs/generation-skills-authoring.md`
- Create: `tests/test_generation_skills_authoring.py`

- [ ] **Step 1: Write the failing doc guard**

```python
# tests/test_generation_skills_authoring.py
from __future__ import annotations

from pathlib import Path


def test_generation_skill_authoring_guide_captures_operational_rules() -> None:
    guide = Path("docs/generation-skills-authoring.md").read_text(encoding="utf-8")

    required_phrases = [
        "Runtime Generation Skill",
        "provider-agnostic",
        "required skills fail the job",
        "non-required skills log and skip",
        "reference images outrank text descriptions",
        "dialogue text uses a controlled policy",
        "official provider guidance",
    ]

    for phrase in required_phrases:
        assert phrase in guide
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_authoring.py -v`

Expected: FAIL with `FileNotFoundError` for `docs/generation-skills-authoring.md`.

- [ ] **Step 3: Add the authoring guide**

```markdown
# Generation Skills Authoring Guide

## Purpose

A Runtime Generation Skill is a small, deterministic rule package that converts structured generation context into constraints for the final prompt renderer. Skills do not call text models, image models, storage, queues, or the database.

## Authoring Rules

- Keep every skill provider-agnostic. The output is structured constraints, not provider-specific request parameters.
- Put trigger logic in `scopes` and `should_apply(context)`.
- Make the skill's priority explicit. Lower numbers run earlier.
- Required skills fail the job when they raise an error.
- Non-required skills log and skip when they raise an error.
- Prefer structured fields over prompt prose. Add prompt text only through `ConstraintSet` methods.
- Resolve conflicts before rendering. The final prompt must not contain both the winning and losing sides of a conflict.
- Reference images outrank text descriptions when character appearance conflicts.
- Dialogue text uses a controlled policy: direct rendering for short text, hybrid bubbles plus best-effort text for longer or multi-panel dialogue.
- Previous page context preserves continuity but cannot override the current page's panel events.

## Official Provider Guidance

Official provider guidance shapes the first page-render skills:

- OpenAI documents text placement, recurring-character consistency, and layout-sensitive composition as remaining limitations for GPT Image models. The pipeline should reduce ambiguity through explicit constraints and tests.
- OpenAI's GPT Image prompting guide positions `gpt-image-2` for text-heavy images, identity-sensitive edits, and multi-panel compositions. The renderer should keep text and panel instructions structured and readable.
- Google Gemini image generation guidance recommends detailed descriptions for critical identity details, use of reference images for consistency, and specific prompts with context and intent.

## Skill Contract

Each skill implements:

```python
id: str
scopes: tuple[str, ...]
priority: int
required: bool
def should_apply(context: GenerationContext) -> bool: ...
def apply(context: GenerationContext, constraints: ConstraintSet) -> None: ...
```

Skills mutate only the provided `ConstraintSet`. They must not mutate `GenerationContext`.

## Validation Checklist

- Unit tests cover one successful path and one conflict path.
- Renderer tests assert both presence of winning instructions and absence of defeated phrases.
- Integration tests capture the final page prompt before the provider call.
- New skills include at least one metadata field that helps logs explain why the skill ran.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_authoring.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/generation-skills-authoring.md tests/test_generation_skills_authoring.py
git commit -m "docs: add generation skills authoring guide"
```

### Task 2: Core Context And Pipeline

**Files:**
- Create: `mangasuperb/services/generation_skills/__init__.py`
- Create: `mangasuperb/services/generation_skills/context.py`
- Create: `mangasuperb/services/generation_skills/constraints.py`
- Create: `mangasuperb/services/generation_skills/pipeline.py`
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
from mangasuperb.services.generation_skills.pipeline import (
    GenerationSkill,
    SkillPipeline,
    SkillPipelineError,
)


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Test Comic",
        page_number=1,
        style_notes="Classic manga black and white linework.",
        script_data={},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="A hero enters the room.",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid.",
            notes=None,
            aspect_ratio="2:3",
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


class FailingOptionalSkill:
    id = "optional_failure"
    scopes = ("page_render",)
    priority = 5
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        raise RuntimeError("optional exploded")


class FailingRequiredSkill(FailingOptionalSkill):
    id = "required_failure"
    required = True


def test_pipeline_runs_skills_in_priority_order() -> None:
    sink: list[str] = []

    result = SkillPipeline([RecordingSkill(sink), EarlySkill(sink)]).run(_context())

    assert sink == ["early", "recording"]
    assert result.constraints.applied_skills == ["early", "recording"]
    assert result.constraints.positive_constraints == ["recorded"]
    assert result.constraints.visual_mode == "black-white"
    assert result.constraints.dialogue_mode == "hybrid"


def test_pipeline_skips_non_required_skill_failures(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)

    result = SkillPipeline([FailingOptionalSkill(), RecordingSkill([])]).run(_context())

    assert result.constraints.skipped_skills == ["optional_failure"]
    assert result.constraints.applied_skills == ["recording"]
    assert "optional_failure" in caplog.text
    assert "optional exploded" in caplog.text


def test_pipeline_raises_for_required_skill_failures() -> None:
    with pytest.raises(SkillPipelineError) as exc:
        SkillPipeline([FailingRequiredSkill()]).run(_context())

    assert "required_failure" in str(exc.value)
    assert "optional exploded" in str(exc.value)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_pipeline.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'mangasuperb.services.generation_skills'`.

- [ ] **Step 3: Add core dataclasses and pipeline**

```python
# mangasuperb/services/generation_skills/context.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class PanelContext:
    panel_number: int
    sequence_index: int
    description: str
    dialogue: str | None
    camera_notes: str | None
    style_notes: str | None


@dataclass(frozen=True)
class CharacterContext:
    id: int | None
    name: str
    role: str | None
    description: str
    sex: str | None
    style_prompt: str | None
    optimized_description: str | None
    reference_index: int | None = None
    has_reference_image: bool = False


@dataclass(frozen=True)
class LayoutContext:
    layout_key: str
    instruction: str
    notes: str | None
    aspect_ratio: str


@dataclass(frozen=True)
class GenerationContext:
    task_type: str
    comic_title: str
    page_number: int
    style_notes: str
    script_data: Mapping[str, Any]
    panels: tuple[PanelContext, ...]
    layout: LayoutContext
    characters: tuple[CharacterContext, ...]
    visual_preferences: Mapping[str, Any]
    reference_notes: tuple[str, ...]
    previous_context_lines: tuple[str, ...]
    text_options: Mapping[str, Any]
```

```python
# mangasuperb/services/generation_skills/constraints.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from mangasuperb.services.generation_skills.context import GenerationContext


@dataclass(frozen=True)
class CharacterLock:
    name: str
    role: str | None
    description: str
    sex: str | None
    reference_index: int | None
    has_reference_image: bool


@dataclass(frozen=True)
class DialogueLine:
    panel_number: int
    text: str


@dataclass
class ConstraintSet:
    visual_mode: str | None = None
    visual_mode_source: str | None = None
    dialogue_mode: str | None = None
    character_locks: list[CharacterLock] = field(default_factory=list)
    dialogue_lines: list[DialogueLine] = field(default_factory=list)
    layout_constraints: list[str] = field(default_factory=list)
    panel_constraints: list[str] = field(default_factory=list)
    positive_constraints: list[str] = field(default_factory=list)
    negative_constraints: list[str] = field(default_factory=list)
    suppressed_phrases: list[str] = field(default_factory=list)
    applied_skills: list[str] = field(default_factory=list)
    skipped_skills: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def add_positive(self, text: str) -> None:
        _append_unique(self.positive_constraints, text)

    def add_negative(self, text: str) -> None:
        _append_unique(self.negative_constraints, text)

    def add_suppressed_phrase(self, text: str) -> None:
        _append_unique(self.suppressed_phrases, text)


@dataclass(frozen=True)
class ResolvedGenerationContext:
    context: GenerationContext
    constraints: ConstraintSet


def _append_unique(items: list[str], text: str) -> None:
    normalized = text.strip()
    if normalized and normalized not in items:
        items.append(normalized)
```

```python
# mangasuperb/services/generation_skills/pipeline.py
from __future__ import annotations

import logging
from typing import Protocol

from mangasuperb.services.generation_skills.constraints import (
    ConstraintSet,
    ResolvedGenerationContext,
)
from mangasuperb.services.generation_skills.context import GenerationContext

logger = logging.getLogger(__name__)


class GenerationSkill(Protocol):
    id: str
    scopes: tuple[str, ...]
    priority: int
    required: bool

    def should_apply(self, context: GenerationContext) -> bool:
        ...

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        ...


class SkillPipelineError(RuntimeError):
    pass


class SkillPipeline:
    def __init__(self, skills: list[GenerationSkill] | tuple[GenerationSkill, ...]) -> None:
        self._skills = tuple(sorted(skills, key=lambda skill: (skill.priority, skill.id)))

    def run(self, context: GenerationContext) -> ResolvedGenerationContext:
        constraints = ConstraintSet()

        for skill in self._skills:
            if context.task_type not in skill.scopes:
                continue
            if not skill.should_apply(context):
                continue

            try:
                skill.apply(context, constraints)
            except Exception as exc:
                if skill.required:
                    raise SkillPipelineError(f"{skill.id} failed: {exc}") from exc
                constraints.skipped_skills.append(skill.id)
                constraints.warnings.append(f"{skill.id}: {exc}")
                logger.warning("Generation skill skipped skill_id=%s error=%s", skill.id, exc)
                continue

            constraints.applied_skills.append(skill.id)

        self._resolve_defaults(context, constraints)
        return ResolvedGenerationContext(context=context, constraints=constraints)

    def _resolve_defaults(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        if constraints.visual_mode is None:
            candidate = str(context.visual_preferences.get("color_mode") or "black-white")
            constraints.visual_mode = "color" if candidate == "color" else "black-white"
            constraints.visual_mode_source = "pipeline-default"
        if constraints.dialogue_mode is None:
            constraints.dialogue_mode = "hybrid"
```

```python
# mangasuperb/services/generation_skills/__init__.py
from mangasuperb.services.generation_skills.constraints import (
    CharacterLock,
    ConstraintSet,
    DialogueLine,
    ResolvedGenerationContext,
)
from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import (
    GenerationSkill,
    SkillPipeline,
    SkillPipelineError,
)

__all__ = [
    "CharacterContext",
    "CharacterLock",
    "ConstraintSet",
    "DialogueLine",
    "GenerationContext",
    "GenerationSkill",
    "LayoutContext",
    "PanelContext",
    "ResolvedGenerationContext",
    "SkillPipeline",
    "SkillPipelineError",
]
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_pipeline.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mangasuperb/services/__init__.py mangasuperb/services/generation_skills tests/test_generation_skills_pipeline.py
git commit -m "feat: add generation skills pipeline core"
```

### Task 3: Visual Mode Resolver

**Files:**
- Create: `mangasuperb/services/generation_skills/skills/__init__.py`
- Create: `mangasuperb/services/generation_skills/skills/visual_mode.py`
- Create: `tests/test_generation_skills_visual_mode.py`

- [ ] **Step 1: Write failing visual-mode tests**

```python
# tests/test_generation_skills_visual_mode.py
from __future__ import annotations

from mangasuperb.services.generation_skills.context import GenerationContext, LayoutContext, PanelContext
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.skills.visual_mode import VisualModeSkill


def _context(color_mode: str, style_notes: str, panel_style: str | None = None) -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Visual Test",
        page_number=1,
        style_notes=style_notes,
        script_data={"color_mode": "color", "style_notes": style_notes},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="The hero runs across a rooftop.",
                dialogue=None,
                camera_notes=None,
                style_notes=panel_style,
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid.",
            notes=None,
            aspect_ratio="2:3",
        ),
        characters=(),
        visual_preferences={"color_mode": color_mode},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


def test_black_white_mode_suppresses_full_color_language() -> None:
    result = SkillPipeline([VisualModeSkill()]).run(
        _context(
            "black-white",
            "Classic manga black and white linework with vibrant full color watercolor color wash.",
            "Use rich chromatic lighting and gradients.",
        )
    )

    constraints = result.constraints

    assert constraints.visual_mode == "black-white"
    assert constraints.visual_mode_source == "explicit"
    assert any("black-and-white manga linework" in text for text in constraints.positive_constraints)
    assert "vibrant full color" in constraints.suppressed_phrases
    assert "watercolor color wash" in constraints.suppressed_phrases
    assert any("Avoid full-color rendering" in text for text in constraints.negative_constraints)


def test_color_mode_suppresses_black_white_only_language() -> None:
    result = SkillPipeline([VisualModeSkill()]).run(
        _context(
            "color",
            "Colorful shounen art with monochrome only and black-and-white only notes.",
        )
    )

    constraints = result.constraints

    assert constraints.visual_mode == "color"
    assert "monochrome only" in constraints.suppressed_phrases
    assert "black-and-white only" in constraints.suppressed_phrases
    assert any("controlled full color" in text for text in constraints.positive_constraints)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_visual_mode.py -v`

Expected: FAIL with `ModuleNotFoundError` for `skills.visual_mode`.

- [ ] **Step 3: Add visual mode skill**

```python
# mangasuperb/services/generation_skills/skills/visual_mode.py
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext

FULL_COLOR_PHRASES = (
    "vibrant full color",
    "full-color",
    "watercolor color wash",
    "rich chromatic lighting",
    "rich lighting",
    "color gradients",
    "gradients",
    "dynamic highlights",
)

BLACK_WHITE_ONLY_PHRASES = (
    "monochrome only",
    "black-and-white only",
    "black and white only",
    "grayscale only",
)


class VisualModeSkill:
    id = "visual_mode"
    scopes = ("page_render",)
    priority = 10
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        mode, source = self._resolve_mode(context)
        constraints.visual_mode = mode
        constraints.visual_mode_source = source
        constraints.metadata["visual_mode"] = mode
        constraints.metadata["visual_mode_source"] = source

        if mode == "black-white":
            constraints.add_positive(
                "Render as high-contrast black-and-white manga linework with ink, screentone, grayscale shading, and clean silhouette separation."
            )
            constraints.add_negative(
                "Avoid full-color rendering, colorful gradients, watercolor color washes, and chromatic lighting."
            )
            for phrase in FULL_COLOR_PHRASES:
                if self._contains_phrase(context, phrase):
                    constraints.add_suppressed_phrase(phrase)
            return

        constraints.add_positive(
            "Render in controlled full color while preserving clean manga linework, readable shapes, and consistent lighting."
        )
        constraints.add_negative(
            "Avoid monochrome-only instructions that contradict the selected full-color output."
        )
        for phrase in BLACK_WHITE_ONLY_PHRASES:
            if self._contains_phrase(context, phrase):
                constraints.add_suppressed_phrase(phrase)

    def _resolve_mode(self, context: GenerationContext) -> tuple[str, str]:
        explicit = context.visual_preferences.get("color_mode")
        if isinstance(explicit, str) and explicit.replace("_", "-").strip().lower() in {"black-white", "color"}:
            return explicit.replace("_", "-").strip().lower(), "explicit"

        script_value = context.script_data.get("color_mode")
        if isinstance(script_value, str) and script_value.replace("_", "-").strip().lower() in {"black-white", "color"}:
            return script_value.replace("_", "-").strip().lower(), "script"

        return "black-white", "default"

    def _contains_phrase(self, context: GenerationContext, phrase: str) -> bool:
        haystack = " ".join(
            [
                context.style_notes,
                str(context.script_data.get("style_notes") or ""),
                " ".join(panel.style_notes or "" for panel in context.panels),
                context.layout.instruction,
                context.layout.notes or "",
            ]
        ).lower()
        return phrase.lower() in haystack
```

```python
# mangasuperb/services/generation_skills/skills/__init__.py
from mangasuperb.services.generation_skills.skills.visual_mode import VisualModeSkill

__all__ = ["VisualModeSkill"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_visual_mode.py tests/test_generation_skills_pipeline.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mangasuperb/services/generation_skills/skills tests/test_generation_skills_visual_mode.py
git commit -m "feat: resolve generation visual mode conflicts"
```

### Task 4: Dialogue Rendering Skill

**Files:**
- Create: `mangasuperb/services/generation_skills/skills/dialogue_rendering.py`
- Modify: `mangasuperb/services/generation_skills/skills/__init__.py`
- Create: `tests/test_generation_skills_dialogue.py`

- [ ] **Step 1: Write failing dialogue tests**

```python
# tests/test_generation_skills_dialogue.py
from __future__ import annotations

from mangasuperb.services.generation_skills.context import GenerationContext, LayoutContext, PanelContext
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.skills.dialogue_rendering import DialogueRenderingSkill


def _context(dialogues: list[str | None]) -> GenerationContext:
    panels = tuple(
        PanelContext(
            panel_number=index,
            sequence_index=index,
            description=f"Panel {index} action.",
            dialogue=dialogue,
            camera_notes=None,
            style_notes=None,
        )
        for index, dialogue in enumerate(dialogues, start=1)
    )
    return GenerationContext(
        task_type="page_render",
        comic_title="Dialogue Test",
        page_number=1,
        style_notes="Classic manga black and white linework.",
        script_data={},
        panels=panels,
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid.",
            notes=None,
            aspect_ratio="2:3",
        ),
        characters=(),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=(),
        previous_context_lines=(),
        text_options={},
    )


def test_short_single_dialogue_uses_render_text_mode() -> None:
    result = SkillPipeline([DialogueRenderingSkill()]).run(_context(["Go now!"]))

    assert result.constraints.dialogue_mode == "render_text"
    assert [(line.panel_number, line.text) for line in result.constraints.dialogue_lines] == [(1, "Go now!")]
    assert any("render the exact short dialogue text" in text for text in result.constraints.positive_constraints)


def test_long_or_multi_panel_dialogue_uses_hybrid_mode_and_preserves_text() -> None:
    result = SkillPipeline([DialogueRenderingSkill()]).run(
        _context(
            [
                "I know the city remembers every promise we broke tonight.",
                "Then we make one promise it cannot erase.",
            ]
        )
    )

    assert result.constraints.dialogue_mode == "hybrid"
    assert [line.text for line in result.constraints.dialogue_lines] == [
        "I know the city remembers every promise we broke tonight.",
        "Then we make one promise it cannot erase.",
    ]
    assert any("best-effort attempt" in text for text in result.constraints.positive_constraints)
    assert any("clean readable balloon space" in text for text in result.constraints.positive_constraints)


def test_no_dialogue_leaves_default_hybrid_policy() -> None:
    result = SkillPipeline([DialogueRenderingSkill()]).run(_context([None, ""]))

    assert result.constraints.dialogue_mode == "hybrid"
    assert result.constraints.dialogue_lines == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_dialogue.py -v`

Expected: FAIL with `ModuleNotFoundError` for `skills.dialogue_rendering`.

- [ ] **Step 3: Add dialogue rendering skill**

```python
# mangasuperb/services/generation_skills/skills/dialogue_rendering.py
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet, DialogueLine
from mangasuperb.services.generation_skills.context import GenerationContext

SHORT_DIALOGUE_LIMIT = 28


class DialogueRenderingSkill:
    id = "dialogue_rendering"
    scopes = ("page_render",)
    priority = 30
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        lines = [
            DialogueLine(panel.panel_number, panel.dialogue.strip())
            for panel in context.panels
            if isinstance(panel.dialogue, str) and panel.dialogue.strip()
        ]
        constraints.dialogue_lines.extend(lines)

        if not lines:
            constraints.dialogue_mode = "hybrid"
            constraints.metadata["dialogue_mode"] = "hybrid"
            constraints.metadata["dialogue_line_count"] = 0
            return

        if len(lines) == 1 and len(lines[0].text) <= SHORT_DIALOGUE_LIMIT:
            constraints.dialogue_mode = "render_text"
            constraints.add_positive(
                "Draw clean speech balloons and render the exact short dialogue text inside the correct balloon."
            )
        else:
            constraints.dialogue_mode = "hybrid"
            constraints.add_positive(
                "Draw clean speech balloons near the correct speakers, reserve enough lettering space, and make a best-effort attempt to render short dialogue."
            )
            constraints.add_positive(
                "If exact text cannot be rendered cleanly, prioritize clean readable balloon space over distorted or invented lettering."
            )
            constraints.add_negative("Avoid garbled, extra, or invented dialogue text.")

        constraints.metadata["dialogue_mode"] = constraints.dialogue_mode
        constraints.metadata["dialogue_line_count"] = len(lines)
```

Update `mangasuperb/services/generation_skills/skills/__init__.py`:

```python
from mangasuperb.services.generation_skills.skills.dialogue_rendering import DialogueRenderingSkill
from mangasuperb.services.generation_skills.skills.visual_mode import VisualModeSkill

__all__ = ["DialogueRenderingSkill", "VisualModeSkill"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_dialogue.py tests/test_generation_skills_pipeline.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mangasuperb/services/generation_skills/skills tests/test_generation_skills_dialogue.py
git commit -m "feat: add dialogue rendering skill"
```

### Task 5: Character, Layout, And Panel Skills

**Files:**
- Create: `mangasuperb/services/generation_skills/skills/character_consistency.py`
- Create: `mangasuperb/services/generation_skills/skills/layout_discipline.py`
- Create: `mangasuperb/services/generation_skills/skills/panel_fidelity.py`
- Modify: `mangasuperb/services/generation_skills/skills/__init__.py`
- Create: `tests/test_generation_skills_character_layout.py`

- [ ] **Step 1: Write failing character, layout, and panel tests**

```python
# tests/test_generation_skills_character_layout.py
from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.skills.character_consistency import CharacterConsistencySkill
from mangasuperb.services.generation_skills.skills.layout_discipline import LayoutDisciplineSkill
from mangasuperb.services.generation_skills.skills.panel_fidelity import PanelFidelitySkill


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Skill Test",
        page_number=2,
        style_notes="Classic manga black and white linework.",
        script_data={},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=5,
                description="Aya enters the hangar.",
                dialogue="We fly at dawn.",
                camera_notes="Low angle",
                style_notes="Strong silhouette",
            ),
            PanelContext(
                panel_number=2,
                sequence_index=6,
                description="Ben checks the engine.",
                dialogue=None,
                camera_notes=None,
                style_notes=None,
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid, reading right-to-left.",
            notes="Do not make a poster.",
            aspect_ratio="2:3",
        ),
        characters=(
            CharacterContext(
                id=1,
                name="Aya",
                role="Protagonist",
                description="A daring pilot with a signature flight jacket.",
                sex="female",
                style_prompt="windswept hair",
                optimized_description="Confident ace pilot with windswept hair and a battered bomber jacket.",
                reference_index=1,
                has_reference_image=True,
            ),
        ),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=("Ref 1: Aya. Next inline image corresponds to this character.",),
        previous_context_lines=("Page 1 Panel 1: Aya finds the old aircraft.",),
        text_options={},
    )


def test_character_consistency_creates_reference_prioritized_locks() -> None:
    result = SkillPipeline([CharacterConsistencySkill()]).run(_context())

    assert len(result.constraints.character_locks) == 1
    lock = result.constraints.character_locks[0]
    assert lock.name == "Aya"
    assert lock.role == "Protagonist"
    assert lock.reference_index == 1
    assert lock.has_reference_image is True
    assert "battered bomber jacket" in lock.description
    assert any("Reference images outrank text descriptions" in text for text in result.constraints.positive_constraints)


def test_layout_discipline_emits_page_layout_constraints() -> None:
    result = SkillPipeline([LayoutDisciplineSkill()]).run(_context())

    assert any("panel count: 2" in text for text in result.constraints.layout_constraints)
    assert any("aspect ratio: 2:3" in text for text in result.constraints.layout_constraints)
    assert any("grid-2x2" in text for text in result.constraints.layout_constraints)
    assert any("gutter" in text.lower() for text in result.constraints.layout_constraints)


def test_panel_fidelity_scopes_current_page_and_previous_context() -> None:
    result = SkillPipeline([PanelFidelitySkill()]).run(_context())

    assert any("current page 2" in text for text in result.constraints.panel_constraints)
    assert any("Panel 1" in text for text in result.constraints.panel_constraints)
    assert any("Previous page context is continuity only" in text for text in result.constraints.positive_constraints)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_character_layout.py -v`

Expected: FAIL with `ModuleNotFoundError` for one of the new skill modules.

- [ ] **Step 3: Add the three skills**

```python
# mangasuperb/services/generation_skills/skills/character_consistency.py
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import CharacterLock, ConstraintSet
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
            description = (
                character.optimized_description
                or character.description
                or character.style_prompt
                or "No character description supplied."
            ).strip()
            constraints.character_locks.append(
                CharacterLock(
                    name=character.name,
                    role=character.role,
                    description=description,
                    sex=character.sex,
                    reference_index=character.reference_index,
                    has_reference_image=character.has_reference_image,
                )
            )

        constraints.add_positive(
            "Reference images outrank text descriptions for character identity, face, hairstyle, body type, clothing identity, age, and sex presentation."
        )
        constraints.add_positive(
            "Keep recurring characters visually consistent across all panels on this page."
        )
        constraints.add_negative(
            "Do not invent extra primary characters unless the current panel description requires them."
        )
        constraints.metadata["character_lock_count"] = len(constraints.character_locks)
        constraints.metadata["reference_note_count"] = len(context.reference_notes)
```

```python
# mangasuperb/services/generation_skills/skills/layout_discipline.py
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class LayoutDisciplineSkill:
    id = "layout_discipline"
    scopes = ("page_render",)
    priority = 40
    required = True

    def should_apply(self, context: GenerationContext) -> bool:
        return True

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        panel_count = len(context.panels)
        constraints.layout_constraints.extend(
            [
                f"Preserve panel count: {panel_count}.",
                f"Preserve page aspect ratio: {context.layout.aspect_ratio}.",
                f"Use layout key: {context.layout.layout_key}.",
                "Keep clear panel boundaries, consistent gutters, and manga reading order.",
                context.layout.instruction,
            ]
        )
        if context.layout.notes:
            constraints.layout_constraints.append(f"Layout notes: {context.layout.notes}")
        constraints.add_negative("Avoid collapsing the page into a single poster-style image.")
        constraints.metadata["layout_key"] = context.layout.layout_key
        constraints.metadata["panel_count"] = panel_count
```

```python
# mangasuperb/services/generation_skills/skills/panel_fidelity.py
from __future__ import annotations

from mangasuperb.services.generation_skills.constraints import ConstraintSet
from mangasuperb.services.generation_skills.context import GenerationContext


class PanelFidelitySkill:
    id = "panel_fidelity"
    scopes = ("page_render",)
    priority = 50
    required = False

    def should_apply(self, context: GenerationContext) -> bool:
        return bool(context.panels)

    def apply(self, context: GenerationContext, constraints: ConstraintSet) -> None:
        constraints.panel_constraints.append(
            f"Focus only on current page {context.page_number}; render the panels listed for this page."
        )
        for panel in context.panels:
            constraints.panel_constraints.append(
                f"Panel {panel.panel_number}: keep this panel scoped to sequence {panel.sequence_index}."
            )
        if context.previous_context_lines:
            constraints.add_positive(
                "Previous page context is continuity only and must not override current panel descriptions, dialogue, camera notes, or layout."
            )
        constraints.metadata["panel_fidelity_panel_count"] = len(context.panels)
```

Update `mangasuperb/services/generation_skills/skills/__init__.py`:

```python
from mangasuperb.services.generation_skills.skills.character_consistency import CharacterConsistencySkill
from mangasuperb.services.generation_skills.skills.dialogue_rendering import DialogueRenderingSkill
from mangasuperb.services.generation_skills.skills.layout_discipline import LayoutDisciplineSkill
from mangasuperb.services.generation_skills.skills.panel_fidelity import PanelFidelitySkill
from mangasuperb.services.generation_skills.skills.visual_mode import VisualModeSkill

__all__ = [
    "CharacterConsistencySkill",
    "DialogueRenderingSkill",
    "LayoutDisciplineSkill",
    "PanelFidelitySkill",
    "VisualModeSkill",
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_character_layout.py tests/test_generation_skills_dialogue.py tests/test_generation_skills_visual_mode.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mangasuperb/services/generation_skills/skills tests/test_generation_skills_character_layout.py
git commit -m "feat: add page render generation skills"
```

### Task 6: Registry And Prompt Renderer

**Files:**
- Create: `mangasuperb/services/generation_skills/registry.py`
- Create: `mangasuperb/services/generation_skills/renderer.py`
- Modify: `mangasuperb/services/generation_skills/__init__.py`
- Create: `tests/test_generation_skills_renderer.py`

- [ ] **Step 1: Write failing renderer tests**

```python
# tests/test_generation_skills_renderer.py
from __future__ import annotations

from mangasuperb.services.generation_skills.context import (
    CharacterContext,
    GenerationContext,
    LayoutContext,
    PanelContext,
)
from mangasuperb.services.generation_skills.pipeline import SkillPipeline
from mangasuperb.services.generation_skills.registry import page_render_skills
from mangasuperb.services.generation_skills.renderer import PromptRenderer


def _context() -> GenerationContext:
    return GenerationContext(
        task_type="page_render",
        comic_title="Renderer Test",
        page_number=1,
        style_notes="Classic manga black and white linework with vibrant full color watercolor color wash.",
        script_data={"title": "Renderer Test"},
        panels=(
            PanelContext(
                panel_number=1,
                sequence_index=1,
                description="Aya points toward the runway.",
                dialogue="Go now!",
                camera_notes="Low angle",
                style_notes="Use rich chromatic lighting.",
            ),
        ),
        layout=LayoutContext(
            layout_key="grid-2x2",
            instruction="Arrange panels in a 2x2 grid.",
            notes=None,
            aspect_ratio="2:3",
        ),
        characters=(
            CharacterContext(
                id=1,
                name="Aya",
                role="Protagonist",
                description="A daring pilot.",
                sex="female",
                style_prompt=None,
                optimized_description="Confident pilot with windswept hair.",
                reference_index=1,
                has_reference_image=True,
            ),
        ),
        visual_preferences={"color_mode": "black-white"},
        reference_notes=("Ref 1: Aya. Next inline image corresponds to this character.",),
        previous_context_lines=("Page 0 Panel 1: Aya finds the aircraft.",),
        text_options={"bubble_shape": "round", "bubble_tail": True},
    )


def test_renderer_outputs_ordered_sections_and_suppresses_defeated_phrases() -> None:
    resolved = SkillPipeline(page_render_skills()).run(_context())

    prompt = PromptRenderer().render_page_prompt(resolved)

    expected_order = [
        "Task Intent",
        "Resolved Visual Mode",
        "Character Locks",
        "Layout Discipline",
        "Panel-by-Panel Content",
        "Dialogue Policy",
        "Continuity Context",
        "Hard Constraints",
        "Negative Constraints",
    ]
    positions = [prompt.index(section) for section in expected_order]

    assert positions == sorted(positions)
    assert "black-and-white manga linework" in prompt
    assert "Aya" in prompt
    assert "Go now!" in prompt
    assert "vibrant full color" not in prompt
    assert "watercolor color wash" not in prompt
    assert "rich chromatic lighting" not in prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_renderer.py -v`

Expected: FAIL with `ModuleNotFoundError` for `generation_skills.registry` or `generation_skills.renderer`.

- [ ] **Step 3: Add registry and renderer**

```python
# mangasuperb/services/generation_skills/registry.py
from __future__ import annotations

from mangasuperb.services.generation_skills.pipeline import GenerationSkill
from mangasuperb.services.generation_skills.skills import (
    CharacterConsistencySkill,
    DialogueRenderingSkill,
    LayoutDisciplineSkill,
    PanelFidelitySkill,
    VisualModeSkill,
)


def page_render_skills() -> tuple[GenerationSkill, ...]:
    return (
        VisualModeSkill(),
        CharacterConsistencySkill(),
        DialogueRenderingSkill(),
        LayoutDisciplineSkill(),
        PanelFidelitySkill(),
    )
```

```python
# mangasuperb/services/generation_skills/renderer.py
from __future__ import annotations

import re

from mangasuperb.services.generation_skills.constraints import ResolvedGenerationContext


class PromptRenderer:
    def render_page_prompt(self, resolved: ResolvedGenerationContext) -> str:
        context = resolved.context
        constraints = resolved.constraints

        sections = [
            self._section(
                "Task Intent",
                [
                    f'Render page {context.page_number} of the manga "{context.comic_title}".',
                    "Output a finished manga page, not a concept sheet or poster.",
                    f"Overall style: {self._sanitize(context.style_notes, constraints.suppressed_phrases)}",
                ],
            ),
            self._section(
                "Resolved Visual Mode",
                [
                    f"Visual mode: {constraints.visual_mode}",
                    f"Source: {constraints.visual_mode_source}",
                ],
            ),
            self._section(
                "Character Locks",
                self._character_lines(resolved),
            ),
            self._section(
                "Layout Discipline",
                constraints.layout_constraints,
            ),
            self._section(
                "Panel-by-Panel Content",
                self._panel_lines(resolved),
            ),
            self._section(
                "Dialogue Policy",
                self._dialogue_lines(resolved),
            ),
            self._section(
                "Continuity Context",
                list(context.previous_context_lines) or ["No previous page context."],
            ),
            self._section(
                "Hard Constraints",
                constraints.positive_constraints + constraints.panel_constraints,
            ),
            self._section(
                "Negative Constraints",
                constraints.negative_constraints or ["No additional negative constraints."],
            ),
        ]

        if context.reference_notes:
            sections.append(
                self._section(
                    "Character Image References",
                    list(context.reference_notes),
                )
            )

        return "\n\n".join(section for section in sections if section.strip())

    def _section(self, title: str, lines: list[str]) -> str:
        body = "\n".join(f"- {line}" for line in lines if line)
        return f"{title}:\n{body}"

    def _character_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        if not resolved.constraints.character_locks:
            return ["No named character locks supplied."]
        lines: list[str] = []
        for lock in resolved.constraints.character_locks:
            ref = f" Ref {lock.reference_index}." if lock.reference_index else ""
            role = f" ({lock.role})" if lock.role else ""
            sex = f" Sex or age cue: {lock.sex}." if lock.sex else ""
            lines.append(f"{lock.name}{role}:{ref} {lock.description}.{sex}".strip())
        return lines

    def _panel_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        suppressed = resolved.constraints.suppressed_phrases
        lines: list[str] = []
        for panel in resolved.context.panels:
            parts = [
                f"Panel {panel.panel_number}: {self._sanitize(panel.description, suppressed)}",
            ]
            if panel.dialogue:
                parts.append(f'Dialogue: "{panel.dialogue.strip()}"')
            if panel.camera_notes:
                parts.append(f"Camera: {self._sanitize(panel.camera_notes, suppressed)}")
            if panel.style_notes:
                parts.append(f"Style: {self._sanitize(panel.style_notes, suppressed)}")
            lines.append(" ".join(parts))
        return lines

    def _dialogue_lines(self, resolved: ResolvedGenerationContext) -> list[str]:
        mode = resolved.constraints.dialogue_mode or "hybrid"
        lines = [f"Mode: {mode}"]
        for dialogue in resolved.constraints.dialogue_lines:
            lines.append(f'Panel {dialogue.panel_number}: "{dialogue.text}"')
        if len(lines) == 1:
            lines.append("No dialogue on this page; preserve clean balloon space only when the panel composition calls for it.")
        return lines

    def _sanitize(self, text: str, suppressed_phrases: list[str]) -> str:
        result = text
        for phrase in suppressed_phrases:
            result = re.sub(re.escape(phrase), "", result, flags=re.IGNORECASE)
        result = re.sub(r"\s{2,}", " ", result)
        result = re.sub(r"\s+([.,;:])", r"\1", result)
        return result.strip()
```

Update `mangasuperb/services/generation_skills/__init__.py` by adding:

```python
from mangasuperb.services.generation_skills.registry import page_render_skills
from mangasuperb.services.generation_skills.renderer import PromptRenderer
```

and include `"PromptRenderer"` and `"page_render_skills"` in `__all__`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_renderer.py tests/test_generation_skills_visual_mode.py tests/test_generation_skills_character_layout.py tests/test_generation_skills_dialogue.py tests/test_generation_skills_pipeline.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mangasuperb/services/generation_skills tests/test_generation_skills_renderer.py
git commit -m "feat: render page prompts from generation skills"
```

### Task 7: Page Render Context Adapter

**Files:**
- Create: `mangasuperb/services/generation_skills/page_render.py`
- Modify: `mangasuperb/services/generation_skills/__init__.py`
- Create: `tests/test_generation_skills_page_render.py`

- [ ] **Step 1: Write failing context adapter tests**

```python
# tests/test_generation_skills_page_render.py
from __future__ import annotations

from types import SimpleNamespace

from mangasuperb.services.generation_skills.page_render import build_page_generation_context


def test_build_page_generation_context_normalizes_model_objects() -> None:
    character = SimpleNamespace(
        id=10,
        name="Aya",
        description="A daring pilot.",
        sex="female",
        style_prompt="windswept hair",
        optimized_description="Confident pilot.",
        image_url="characters/aya.png",
    )
    link = SimpleNamespace(character=character, role="Protagonist", order_index=1)
    comic = SimpleNamespace(
        title="Adapter Test",
        style_description="Classic manga black and white linework.",
        character_links=[link],
    )
    panel = SimpleNamespace(
        panel_number=1,
        sequence_index=1,
        description="Aya enters the hangar.",
        dialogue="Ready.",
        camera_notes="Low angle",
        style_notes="Strong silhouette",
    )

    context = build_page_generation_context(
        comic=comic,
        script_data={"title": "Script Title", "style_notes": "Script style"},
        page_number=3,
        layout_key="grid-2x2",
        layout_instruction="Arrange panels in a 2x2 grid.",
        layout_notes="Keep gutters clear.",
        panels=[panel],
        color_mode="black-white",
        aspect_ratio="2:3",
        reference_notes=["Ref 1: Aya. Next inline image corresponds to this character."],
        previous_context_lines=["Page 2 Panel 1: Aya starts the engine."],
        text_options={"bubble_shape": "round"},
    )

    assert context.comic_title == "Script Title"
    assert context.page_number == 3
    assert context.layout.layout_key == "grid-2x2"
    assert context.panels[0].dialogue == "Ready."
    assert context.characters[0].name == "Aya"
    assert context.characters[0].reference_index == 1
    assert context.characters[0].has_reference_image is True
    assert context.reference_notes == ("Ref 1: Aya. Next inline image corresponds to this character.",)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_page_render.py -v`

Expected: FAIL with `ModuleNotFoundError` for `generation_skills.page_render`.

- [ ] **Step 3: Add context adapter**

```python
# mangasuperb/services/generation_skills/page_render.py
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
    title = _clean_text(script_data.get("title")) or _clean_text(getattr(comic, "title", None)) or "Untitled"
    style_notes = (
        _clean_text(script_data.get("style_notes"))
        or _clean_text(getattr(comic, "style_description", None))
        or "Classic manga black and white linework."
    )

    return GenerationContext(
        task_type="page_render",
        comic_title=title,
        page_number=page_number,
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


def _panel_context(panel: Any) -> PanelContext:
    panel_number = getattr(panel, "panel_number", None) or getattr(panel, "sequence_index", 1)
    sequence_index = getattr(panel, "sequence_index", None) or panel_number
    return PanelContext(
        panel_number=int(panel_number),
        sequence_index=int(sequence_index),
        description=_clean_text(getattr(panel, "description", None)) or "Scene description missing",
        dialogue=_clean_text(getattr(panel, "dialogue", None)),
        camera_notes=_clean_text(getattr(panel, "camera_notes", None)),
        style_notes=_clean_text(getattr(panel, "style_notes", None)),
    )


def _character_contexts(comic: Any, reference_notes: Sequence[str]) -> list[CharacterContext]:
    contexts: list[CharacterContext] = []
    for index, link in enumerate(getattr(comic, "character_links", []) or [], start=1):
        character = getattr(link, "character", None)
        if not character:
            continue
        name = _clean_text(getattr(character, "name", None)) or f"Character {getattr(character, 'id', index)}"
        reference_index = _reference_index_for_name(name, reference_notes)
        has_reference_image = bool(reference_index or getattr(character, "image_url", None))
        contexts.append(
            CharacterContext(
                id=getattr(character, "id", None),
                name=name,
                role=_clean_text(getattr(link, "role", None)),
                description=_clean_text(getattr(character, "description", None)) or "",
                sex=_clean_text(getattr(character, "sex", None)),
                style_prompt=_clean_text(getattr(character, "style_prompt", None)),
                optimized_description=_clean_text(getattr(character, "optimized_description", None)),
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
```

Update `mangasuperb/services/generation_skills/__init__.py` by adding:

```python
from mangasuperb.services.generation_skills.page_render import build_page_generation_context
```

and include `"build_page_generation_context"` in `__all__`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_page_render.py tests/test_generation_skills_renderer.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mangasuperb/services/generation_skills tests/test_generation_skills_page_render.py
git commit -m "feat: adapt page render data for generation skills"
```

### Task 8: Page Render Job Integration

**Files:**
- Modify: `mangasuperb/services/jobs.py`
- Modify: `tests/test_jobs_workflow.py`

- [ ] **Step 1: Add failing integration assertions**

In `tests/test_jobs_workflow.py`, update `test_render_prompt_includes_character_roster` to assert the new structured sections:

```python
        assert prompts, "Expected image generation prompt to be captured"
        assert "Character Locks:" in prompts[0]
        assert "Task Intent:" in prompts[0]
        assert "Dialogue Policy:" in prompts[0]
        assert "Layout Discipline:" in prompts[0]
        assert "Aya" in prompts[0]
        assert "Protagonist" in prompts[0]
```

Add this test to the same file:

```python
def test_render_stage_uses_generation_skills_to_suppress_conflicting_color_prompt(
    app,
    user: User,
    dummy_storage,
    monkeypatch,
):
    prompts: list[str] = []
    _patch_genai(monkeypatch, prompts)

    script_payload = {
        "title": "Color Conflict",
        "story": "A hero crosses the city.",
        "style_notes": "Classic manga black and white linework with vibrant full color watercolor color wash.",
        "color_mode": "black-white",
        "panels": [
            {
                "panel_number": 1,
                "scene": "Aya crosses a rain-slick street.",
                "dialogue": "Move.",
                "visual_notes": "Use rich chromatic lighting and gradients.",
            }
        ],
    }

    with app.app_context():
        script = Script(
            user_id=user.id,
            title=script_payload["title"],
            content=json.dumps(script_payload),
        )
        comic = Comic(
            user_id=user.id,
            script=script,
            title=script_payload["title"],
            style_description=script_payload["style_notes"],
            aspect_ratio="2:3",
        )
        db.session.add_all([script, comic])
        db.session.commit()

        jobs.bootstrap_comic_workflow(comic)
        db.session.commit()

        jobs.process_outline_stage(comic.id)
        jobs.process_shot_stage(comic.id)
        result = jobs.process_page_render_stage(
            comic.id,
            page_number=1,
            image_model="test-model",
            color_mode="black-white",
        )

        assert result["status"] == "processing"
        assert prompts
        assert "Resolved Visual Mode:" in prompts[0]
        assert "Visual mode: black-white" in prompts[0]
        assert "black-and-white manga linework" in prompts[0]
        assert "vibrant full color" not in prompts[0]
        assert "watercolor color wash" not in prompts[0]
        assert "rich chromatic lighting" not in prompts[0]
```

- [ ] **Step 2: Run integration tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_jobs_workflow.py::test_render_prompt_includes_character_roster tests/test_jobs_workflow.py::test_render_stage_uses_generation_skills_to_suppress_conflicting_color_prompt -v`

Expected: FAIL because the current prompt still uses `Character roster:` and ad hoc requirements.

- [ ] **Step 3: Route page render through the skills pipeline**

Modify imports in `mangasuperb/services/jobs.py`:

```python
from mangasuperb.services.generation_skills import (
    PromptRenderer,
    SkillPipeline,
    build_page_generation_context,
    page_render_skills,
)
```

Replace the `prompt = build_page_render_prompt(...)` block inside `process_page_render_stage()` with:

```python
            generation_context = build_page_generation_context(
                comic=comic,
                script_data=script_data,
                page_number=page_number,
                layout_key=layout.layout_key,
                layout_instruction=layout_instruction,
                layout_notes=layout.notes,
                panels=panels,
                color_mode=normalized_color,
                aspect_ratio=normalized_aspect_ratio,
                reference_notes=ref_lines,
                previous_context_lines=previous_context_lines,
                text_options={
                    "font_family": font_family,
                    "font_size": font_size,
                    "bubble_shape": bubble_shape,
                    "bubble_tail": bubble_tail,
                },
            )
            resolved_generation = SkillPipeline(page_render_skills()).run(generation_context)
            prompt = PromptRenderer().render_page_prompt(resolved_generation)
            logger.info(
                "Generation skills resolved task_type=%s skills=%s visual_mode=%s dialogue_mode=%s skipped_skills=%s",
                generation_context.task_type,
                ",".join(resolved_generation.constraints.applied_skills),
                resolved_generation.constraints.visual_mode,
                resolved_generation.constraints.dialogue_mode,
                ",".join(resolved_generation.constraints.skipped_skills),
            )
```

Keep `build_page_render_prompt()` in `jobs.py` for compatibility until no internal callers remain.

- [ ] **Step 4: Run integration tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_jobs_workflow.py::test_render_prompt_includes_character_roster tests/test_jobs_workflow.py::test_render_stage_uses_generation_skills_to_suppress_conflicting_color_prompt -v`

Expected: PASS.

- [ ] **Step 5: Run focused workflow coverage**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_authoring.py tests/test_generation_skills_pipeline.py tests/test_generation_skills_visual_mode.py tests/test_generation_skills_dialogue.py tests/test_generation_skills_character_layout.py tests/test_generation_skills_renderer.py tests/test_generation_skills_page_render.py tests/test_jobs_workflow.py -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mangasuperb/services/jobs.py tests/test_jobs_workflow.py
git commit -m "feat: use generation skills for page rendering"
```

### Task 9: Final Verification And Cleanup

**Files:**
- Review all files changed in Tasks 1-8.

- [ ] **Step 1: Run the full relevant test set**

Run: `.venv/bin/python -m pytest tests/test_generation_skills_authoring.py tests/test_generation_skills_pipeline.py tests/test_generation_skills_visual_mode.py tests/test_generation_skills_dialogue.py tests/test_generation_skills_character_layout.py tests/test_generation_skills_renderer.py tests/test_generation_skills_page_render.py tests/test_jobs_workflow.py tests/test_comic_publish.py tests/test_generation_logging.py tests/test_ai_provider.py -v`

Expected: PASS.

- [ ] **Step 2: Run diff hygiene checks**

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: only intentional tracked changes if a previous task has not been committed.

- [ ] **Step 3: Inspect final prompt surface manually**

Run: `rg -n "Generation skills resolved|build_page_generation_context|Character Locks|Resolved Visual Mode|Dialogue Policy" mangasuperb/services tests`

Expected: output includes `mangasuperb/services/jobs.py`, `mangasuperb/services/generation_skills/renderer.py`, and relevant tests.

- [ ] **Step 4: Commit any cleanup**

If Step 2 shows intentional tracked cleanup changes, commit them:

```bash
git add mangasuperb/services tests docs
git commit -m "test: verify generation skills page render path"
```

If Step 2 shows no tracked changes, record no cleanup commit.

## Self-Review Notes

- Spec coverage: page-render-only MVP is covered by Tasks 2-8. Character consistency, dialogue rendering, panel fidelity, layout discipline, visual conflict resolution, deterministic renderer, non-required skill skipping, required skill failure, and structured logging are each covered by tests.
- Provider API stability: Task 8 keeps `get_image_provider().generate_image(prompt, ref_parts, normalized_aspect_ratio)` unchanged.
- Future extension: the package boundaries allow story, cover, character-image, shot-planning, and agent-backed skills to register later without changing provider classes.
- User priority: visual conflict resolution and character/dialogue accuracy are implemented before integration.
