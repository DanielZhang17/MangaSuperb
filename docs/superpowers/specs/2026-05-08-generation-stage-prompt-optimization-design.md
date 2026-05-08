# Generation Stage Prompt Optimization

**Date:** 2026-05-08
**Status:** Ready for review

## Overview

Constrain prompt optimization to the generation pipeline stages that directly
shape manga output: shot splitting and page image rendering. The user-authored
story remains the source text. It is not automatically rewritten when the user
clicks through the wizard.

This spec supplements the existing Generation Skills Platform design. It
changes the near-term scope from page rendering only to two backend task types:
`shot_split` and `page_render`.

## Goals

- Improve downstream generation quality without changing user intent.
- Keep story enhancement user-controlled and separate from the automatic
  workflow.
- Make shot splitting produce more stable panel descriptions, dialogue fields,
  camera notes, style notes, and page assignments.
- Make page-render prompts more explicit about character consistency, panel
  fidelity, layout, dialogue rendering, aspect ratio, and visual mode.
- Reuse the generation-skills architecture instead of adding ad hoc prompt text
  to individual job functions.

## Non-Goals

- No automatic call to `/api/stories/enhance` during wizard navigation or comic
  workflow execution.
- No automatic rewrite of `Script.content["story"]`.
- No new frontend prompt optimization UI in this scope.
- No user-facing skill picker.
- No provider API changes.
- No cover-generation or character-image prompt migration in this phase.
- No extra text-model pass for shot splitting in the first implementation
  unless a later design explicitly introduces AI-backed shot planning.

## Story Enhance Boundary

`story enhance` remains an explicit user action. The existing
`/api/stories/enhance` endpoint may still be used by a user-triggered control,
but it is not part of `enqueue_comic_workflow()`, `process_outline_stage()`,
`process_shot_stage()`, or `process_page_render_stage()`.

When the automatic workflow runs, it reads the current story as submitted. Any
optimization happens after that point as generation-stage constraints, not as a
replacement for the user's story.

## Architecture

Extend `mangasuperb.services.generation_skills` with scoped contexts and
renderers for both task types:

```text
mangasuperb/services/generation_skills/
  context.py
  constraints.py
  pipeline.py
  registry.py
  renderers.py
  shot_split.py
  page_render.py
  skills/
    shot_boundary.py
    dialogue_extraction.py
    camera_style_enrichment.py
    visual_mode.py
    character_consistency.py
    dialogue_rendering.py
    panel_fidelity.py
    layout_discipline.py
```

The package remains provider-agnostic. It does not call text models, image
models, storage, queues, or the database. Job code gathers data from models,
builds a structured context, runs the pipeline, and applies the resolved result.

## Shot Split Scope

`process_shot_stage()` becomes the integration point for `task_type="shot_split"`.

The stage still loads the script payload, outline sections, existing panel
shots, and layout rows as it does today. Instead of relying only on inline field
mapping, it builds a shot-split context and lets skills produce resolved panel
drafts.

The first shot-split skills are deterministic:

- `Shot Boundary Skill`: preserves the story and outline order, normalizes one
  panel draft per section, and prevents merging or inventing major beats.
- `Dialogue Extraction Skill`: moves detected dialogue into the panel dialogue
  field while keeping surrounding action in the description.
- `Camera Style Enrichment Skill`: derives conservative camera and style notes
  from structured panel payloads, script style notes, and comic style settings.
- `Panel Assignment Skill`: assigns page and panel numbers using the existing
  `PANELS_PER_PAGE` policy and layout defaults.

The resolved panel drafts are then written to `ComicPanelShot` and
`ComicPageLayout` using the existing database flow.

## Page Render Scope

`process_page_render_stage()` remains the integration point for
`task_type="page_render"`.

It gathers comic metadata, script payload, panels for the page, layout
instruction, previous-page context, character assignments, reference-image
notes, color mode, and aspect ratio. The page-render skills then resolve
constraints and produce the final image prompt.

The page-render skills are the ones from the existing Generation Skills
Platform design:

- `Visual Mode Resolver`
- `Character Consistency Skill`
- `Dialogue Rendering Skill`
- `Panel Fidelity Skill`
- `Layout Discipline Skill`

The existing image provider call remains unchanged:

```python
get_image_provider().generate_image(prompt, ref_parts, normalized_aspect_ratio)
```

## Conflict Rules

Conflict resolution happens before final prompt rendering.

Priority order:

```text
explicit UI selections
> validated comic settings
> reference images
> optimized character descriptions
> script and panel structured fields
> generic defaults
```

For shot splitting, current outline section order wins over inferred scene
changes. For page rendering, current page panel content wins over previous-page
continuity. For visual mode conflicts, validated `color_mode` wins over style
phrases that imply the opposite output mode.

The final prompt should not include both the winning and defeated sides of a
resolved conflict.

## Error Handling

- Required skill failure fails the current job with a clear stage error.
- Non-required skill failure logs a warning, records the skipped skill id in
  metadata, and falls back to the existing deterministic behavior where
  possible.
- Shot-split fallback preserves current `_build_outline_sections()` and
  `_resolve_panel_fields()` behavior.
- Page-render fallback preserves enough existing prompt behavior to avoid
  blocking rendering when a non-required skill fails.
- Provider errors and R2 upload errors remain handled by the current job paths.

## Observability

Add structured logs at both stages:

```text
task_type=shot_split
skills=shot_boundary,dialogue_extraction,camera_style_enrichment,panel_assignment
panel_count=<integer>
skipped_skills=<comma-separated skill ids or empty>

task_type=page_render
skills=visual_mode,character_consistency,dialogue_rendering,panel_fidelity,layout_discipline
visual_mode=<black-white|color>
dialogue_mode=<render_text|hybrid|blank_bubbles>
skipped_skills=<comma-separated skill ids or empty>
```

Full prompt bodies remain gated behind existing prompt logging controls.

## Testing

Unit tests:

- Shot boundary preserves section order and panel count.
- Dialogue extraction separates dialogue from action text.
- Camera/style enrichment does not override explicit panel fields.
- Visual mode conflict resolution removes defeated color-mode language.
- Dialogue rendering selects a controlled mode for multi-panel text.
- Layout discipline includes panel count, gutters, reading order, and aspect
  ratio.

Integration tests:

- `process_shot_stage()` writes resolved `ComicPanelShot` fields and page
  layouts through the skills pipeline.
- `process_page_render_stage()` uses the skills pipeline and still calls the
  existing image provider interface.
- Full workflow passes against the local test database and test R2 bucket,
  covering outline, shots, render, export, cover, and publish behavior.

## Acceptance Criteria

- The user story is not automatically changed by the workflow.
- `/api/stories/enhance` is only called by explicit user action.
- Shot splitting creates stable, ordered panel shots from the current story and
  outline.
- Page rendering receives a conflict-resolved prompt with explicit panel,
  character, dialogue, layout, visual-mode, and aspect-ratio constraints.
- New and affected tests pass. Known unrelated backend lint findings remain
  separately tracked until that cleanup is scheduled.
