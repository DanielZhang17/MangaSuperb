# Generation Skills Authoring Guide

## Purpose

A Runtime Generation Skill is a small, deterministic rule package that converts structured generation context into constraints for the final prompt renderer. Skills do not call text models, image models, storage, queues, or the database.

## Authoring Rules

Operational summary: required skills fail the job; non-required skills log and skip; reference images outrank text descriptions; dialogue text uses a controlled policy.

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

This section captures official provider guidance for the first page-render skills:

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
