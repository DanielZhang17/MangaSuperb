# Generation Skills Platform

**Date:** 2026-05-07
**Status:** Approved for implementation planning

## Overview

Introduce a runtime Generation Skills Platform for MangaSuperb. A skill is a
small, composable rule package that can inspect structured generation context,
add constraints, resolve conflicts, and contribute prompt instructions before a
model call.

The platform is designed for all generation tasks over time: story generation,
shot planning, character images, page rendering, covers, and future agent-based
reviewers. The first implementation phase only enables the platform for page
rendering, because that is where character consistency, dialogue rendering, and
visual-mode conflicts are most visible today.

## Goals

- Make prompt injection systematic instead of relying on ad hoc string
  concatenation.
- Resolve contradictory instructions before they reach the image model, such as
  black-and-white linework combined with full-color rendering language.
- Improve page-render accuracy for character consistency and dialogue handling.
- Keep the user experience automatic: users do not need to understand or select
  skills in the first version.
- Build an architecture that can later support all image generation paths and
  agent-backed skills without rewriting the first phase.

## Non-Goals

- No user-facing skill picker in the first version.
- No visual quality scoring or automatic image-regeneration loop in the first
  version.
- No provider-layer changes. Gemini and third-party providers continue to
  receive a prompt, reference images, and aspect ratio.
- No database persistence of full generation traces in the first version.
- No immediate migration of character-image, cover, story, or shot-planning
  flows into the platform.

## Current System

The current page-render path in `mangasuperb/services/jobs.py` gathers comic,
script, panel, layout, character, and reference-image data. It then calls
`build_page_render_prompt()` to produce a prompt string and sends that string to
`get_image_provider().generate_image(prompt, ref_parts, aspect_ratio)`.

This works, but it creates two structural problems:

- Each concern contributes text directly to the prompt, so conflicts are easy to
  introduce and hard to detect.
- The prompt builder is page-render-specific, so improvements are not naturally
  reusable for character images, covers, story generation, shot planning, or
  future agents.

## Architecture

Add a new generation-skills module, for example:

```text
mangasuperb/services/generation_skills/
  __init__.py
  context.py
  constraints.py
  pipeline.py
  registry.py
  renderer.py
  skills/
    visual_mode.py
    character_consistency.py
    dialogue_rendering.py
    panel_fidelity.py
    layout_discipline.py
```

The module does not call model providers. It only transforms structured
generation inputs into a resolved generation context and a final prompt.

Core concepts:

- `GenerationContext`: normalized task input. It includes `task_type`, `comic`,
  `script_data`, `characters`, `panels`, `layout`, `visual_preferences`,
  `references`, and previous-page context.
- `GenerationSkill`: skill interface with `id`, `scopes`, `priority`,
  `required`, `should_apply(context)`, and `apply(context, constraints)`.
- `ConstraintSet`: structured output accumulated by skills. It includes visual
  mode, character locks, dialogue policy, layout policy, positive constraints,
  negative constraints, and metadata.
- `SkillRegistry`: registers built-in skills and returns the active skills for a
  task type.
- `SkillPipeline`: applies skills in priority order, catches non-required skill
  failures, merges constraints, and resolves conflicts.
- `ResolvedGenerationContext`: final, conflict-resolved context used by the
  renderer.
- `PromptRenderer`: converts a resolved context into the final model prompt.

This separates responsibilities:

- Job code gathers domain data.
- Skills interpret and constrain that data.
- The pipeline resolves conflicts.
- The renderer writes prompt text.
- Providers submit the model request.

## First Phase Scope

Only `task_type="page_render"` is enabled in the first phase.

`process_page_render_stage()` keeps its existing orchestration:

1. Load comic, script, panels, layout, characters, references, and previous-page
   summaries.
2. Build a `GenerationContext(task_type="page_render")`.
3. Run `SkillPipeline`.
4. Render the final page prompt with `PromptRenderer`.
5. Call `get_image_provider().generate_image(prompt, ref_parts, aspect_ratio)`.
6. Store the rendered page as before.

The provider API remains unchanged.

## Built-In Page Render Skills

### Visual Mode Resolver

Required skill. It normalizes visual mode and resolves conflicts between
`color_mode`, `comic.style_description`, script style notes, panel style notes,
and layout notes.

If `color_mode` resolves to `black-white`, the final prompt must clearly target
black-and-white manga linework, ink, screentone, grayscale, and high-contrast
composition. Full-color language such as vibrant color, watercolor color wash,
color gradients, or rich chromatic lighting is removed or moved to negative
constraints.

If `color_mode` resolves to `color`, black-and-white-only instructions are
removed or demoted unless they are generic line-art quality instructions that do
not contradict color output.

### Character Consistency Skill

Enabled when the comic has character assignments or reference images.

It produces character locks:

- character name and role
- stable appearance traits
- sex and age cues when available
- clothing or signature accessories
- optimized character description
- reference-image ordering and priority

Reference images outrank text descriptions. The skill adds hard constraints that
the same character must keep the same face, hairstyle, body type, clothing
identity, and age/sex presentation across panels. It also instructs the model
not to invent extra primary characters when the panel does not call for them.

### Dialogue Rendering Skill

Enabled when any panel on the page has dialogue.

The first version keeps the ability to ask the image model to render text, but
uses a controlled policy instead of one generic instruction. The default mode is
`hybrid`.

Modes:

- `render_text`: ask the model to render the dialogue text directly inside
  speech balloons. Used only for short dialogue.
- `hybrid`: ask the model to draw clean speech balloons, place them near the
  correct speakers, reserve enough lettering space, and make a best-effort
  attempt to render short dialogue. If exact text cannot be rendered cleanly,
  clean readable balloon space is preferred over distorted text.
- `blank_bubbles`: draw balloons and lettering space without text. This is not
  the default for phase one.

Automatic selection:

- Short single-panel dialogue can use `render_text` or a stronger `hybrid`
  instruction.
- Longer dialogue, multiple speakers, or multiple panels use `hybrid`.
- Future user preferences may force `blank_bubbles`, but no UI is added in the
  first version.

### Panel Fidelity Skill

Enabled for page rendering.

It ensures the page prompt focuses on the current page's panels only. Previous
page context may preserve continuity, but it must not override the current page
events. Each panel description, action, camera note, and dialogue line is scoped
to its panel number.

### Layout Discipline Skill

Required skill. It converts `layout_key`, panel count, aspect ratio, and layout
notes into explicit layout constraints.

It instructs the model to preserve:

- panel count
- page aspect ratio
- panel boundaries
- gutters
- reading order
- page layout type such as grid, vertical, or cinematic

The goal is to reduce accidental poster-style single images when the requested
output is a manga page.

## Conflict Resolution

Conflict resolution is part of the pipeline, not an afterthought in prompt text.

Priority order:

```text
explicit UI selections
> validated comic settings
> character reference images
> optimized character descriptions
> script and panel style notes
> generic defaults
```

Examples:

- If `color_mode=black-white` and a panel style says "vibrant full color", the
  resolved context uses black-and-white and moves full-color language to negative
  constraints.
- If a character reference image conflicts with a text description, the
  reference image wins and the text becomes secondary.
- If previous-page context conflicts with current-panel content, current-panel
  content wins.
- If layout notes imply a poster but the layout key is `grid-2x2`, the grid
  layout wins for page rendering.

The final prompt should not contain both sides of a resolved conflict.

## Prompt Rendering

The page prompt renderer emits ordered sections:

1. Task intent and output type.
2. Resolved visual mode.
3. Character locks and reference ordering.
4. Layout discipline.
5. Panel-by-panel content.
6. Dialogue policy.
7. Continuity context.
8. Hard constraints.
9. Negative constraints.

The renderer is deterministic so tests can assert prompt content and absence of
known conflict phrases.

## Error Handling

- Required skill failure fails the page-render job with a clear error.
- Non-required skill failure logs a warning, records the skipped skill id in
  metadata, and continues.
- Invalid or missing optional data produces conservative fallback constraints.
- Conflict resolution must always select one final value for visual mode and
  dialogue mode.
- Provider errors remain handled by the existing provider and job error paths.

## Observability

Add structured job logs without exposing full prompt bodies by default:

```text
task_type=page_render
skills=visual_mode,character_consistency,dialogue_rendering,panel_fidelity,layout_discipline
visual_mode=black-white
dialogue_mode=hybrid
positive_constraints=...
negative_constraints=...
```

Existing prompt logging remains controlled by `LOG_PROMPTS`. If enabled, it may
include truncated final prompt text plus resolved metadata.

No database trace persistence is required in phase one.

## Testing

Unit tests:

- `Visual Mode Resolver` removes or demotes full-color language when
  black-and-white mode wins.
- `Character Consistency Skill` creates character locks and prioritizes
  reference images.
- `Dialogue Rendering Skill` selects `hybrid` for longer or multi-panel
  dialogue and preserves the ability to render short dialogue.
- `Layout Discipline Skill` emits panel count, aspect ratio, reading order, and
  layout constraints.

Pipeline tests:

- Skills run in priority order.
- Non-required skill failure is skipped and logged.
- Required skill failure returns a clear failure.
- Conflict resolution removes losing instructions from final constraints.

Renderer tests:

- Final page prompt includes ordered sections.
- Final page prompt contains selected visual mode and dialogue policy.
- Final page prompt does not contain phrases from defeated visual modes.

Integration tests:

- Page render uses the skills pipeline and still calls the same image provider
  interface.
- Existing dummy provider tests capture the final prompt and verify character,
  dialogue, layout, and visual-mode constraints.

## Future Phases

After page-render validation, the same platform can extend to:

- character-image generation skills
- cover-generation skills
- story-generation skills
- shot-planning and panel-composition skills
- user-visible skill toggles
- agent-backed prompt critics or visual QA reviewers
- automatic retry with revised constraints after visual critique

Agents should be added as skill implementations or pipeline stages, not as a
replacement for the structured context and conflict-resolution layer.
