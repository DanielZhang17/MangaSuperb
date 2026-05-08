# Generation Stage Prompt Optimization

**Date:** 2026-05-08
**Status:** Ready for review

## Overview

Constrain prompt optimization to the generation pipeline stages that directly
shape manga output: shot splitting and page image rendering. The user-authored
story remains the source text. It is not automatically rewritten when the user
clicks through the wizard.

Because model-backed optimization adds text-model cost, it is controlled by
backend environment configuration. When the feature is disabled, the workflow
uses the existing deterministic paths and does not make the extra text-model
call.

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
- Allow backend operators to enable or disable model-backed optimization from
  `.env`.
- Bound extra text-model calls so cost is predictable.
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
- No unconditional text-model optimization pass. Extra calls only happen when
  the backend environment enables the feature.
- No requirement that model-backed optimization succeeds before the workflow can
  continue.

## Story Enhance Boundary

`story enhance` remains an explicit user action. The existing
`/api/stories/enhance` endpoint may still be used by a user-triggered control,
but it is not part of `enqueue_comic_workflow()`, `process_outline_stage()`,
`process_shot_stage()`, or `process_page_render_stage()`.

When the automatic workflow runs, it reads the current story as submitted. Any
optimization happens after that point as generation-stage constraints, not as a
replacement for the user's story.

## Backend Configuration

Prompt optimization is disabled by default and enabled through `.env`.

```text
GENERATION_PROMPT_OPTIMIZATION_ENABLED=false
GENERATION_PROMPT_OPTIMIZATION_SCOPES=shot_split,page_render
GENERATION_PROMPT_OPTIMIZATION_MODEL=
GENERATION_PROMPT_OPTIMIZATION_TIMEOUT_SECONDS=30
```

Behavior:

- `GENERATION_PROMPT_OPTIMIZATION_ENABLED=false` means no extra text-model call.
- `GENERATION_PROMPT_OPTIMIZATION_ENABLED=true` allows model-backed optimization
  for the configured scopes.
- `GENERATION_PROMPT_OPTIMIZATION_SCOPES` limits where the extra call can run.
  Operators can enable only `shot_split`, only `page_render`, or both.
- `GENERATION_PROMPT_OPTIMIZATION_MODEL` is optional. If empty, the optimizer
  uses the default text provider model.
- The first implementation treats model-backed optimization as optional. If it
  fails or times out, the job logs the failure and falls back to deterministic
  skills or current behavior.

Call budget:

- `shot_split`: at most one extra text-model call per comic workflow execution.
- `page_render`: at most one extra text-model call per page-render job. Since a
  multi-page comic renders multiple pages, operators can exclude `page_render`
  from `GENERATION_PROMPT_OPTIMIZATION_SCOPES` when cost is more important than
  render-prompt refinement.

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
  prompt_optimizer.py
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

The core skills package remains provider-agnostic. Skills do not call text
models, image models, storage, queues, or the database. Job code gathers data
from models, builds a structured context, runs the pipeline, and applies the
resolved result.

Model-backed optimization lives behind a small service such as
`prompt_optimizer.py`. That service is the only part of the feature allowed to
call `get_text_provider().generate_text()`, and only when the backend
configuration enables it for the current scope.

## Shot Split Scope

`process_shot_stage()` becomes the integration point for `task_type="shot_split"`.

The stage still loads the script payload, outline sections, existing panel
shots, and layout rows as it does today. Instead of relying only on inline field
mapping, it builds a shot-split context and lets skills produce resolved panel
drafts.

The base shot-split skills are deterministic:

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

When model-backed optimization is enabled for `shot_split`, the stage may first
ask the text provider for a structured shot-split optimization result. The
result must be parsed as JSON and treated as advisory panel guidance. It cannot
replace the user story, change comic settings, or skip the deterministic
validation skills. If the model result is invalid, the stage falls back to the
deterministic shot-split path.

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

When model-backed optimization is enabled for `page_render`, the stage may send
the resolved deterministic prompt plus compact metadata to the text provider for
one final prompt refinement. The optimizer may clarify wording, remove
ambiguity, and tighten conflicting instructions, but it must preserve the
resolved constraints produced by the skills pipeline. If the optimizer fails,
returns empty text, or drops required constraints, the deterministic prompt is
used.

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
- Model-backed optimization failure never fails the job in the first
  implementation. It logs and falls back.
- Provider errors and R2 upload errors remain handled by the current job paths.

## Observability

Add structured logs at both stages:

```text
task_type=shot_split
skills=shot_boundary,dialogue_extraction,camera_style_enrichment,panel_assignment
prompt_optimizer_enabled=<true|false>
text_model_call_count=<0|1>
panel_count=<integer>
skipped_skills=<comma-separated skill ids or empty>

task_type=page_render
skills=visual_mode,character_consistency,dialogue_rendering,panel_fidelity,layout_discipline
prompt_optimizer_enabled=<true|false>
text_model_call_count=<0|1>
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
- Prompt optimization disabled by config does not call the text provider.
- Prompt optimization enabled by config calls the text provider no more than the
  allowed budget for that scope.
- Visual mode conflict resolution removes defeated color-mode language.
- Dialogue rendering selects a controlled mode for multi-panel text.
- Layout discipline includes panel count, gutters, reading order, and aspect
  ratio.

Integration tests:

- `process_shot_stage()` writes resolved `ComicPanelShot` fields and page
  layouts through the skills pipeline.
- `process_shot_stage()` falls back to deterministic panel drafts when
  model-backed shot optimization fails.
- `process_page_render_stage()` uses the skills pipeline and still calls the
  existing image provider interface.
- `process_page_render_stage()` falls back to the deterministic prompt when
  model-backed render prompt optimization fails.
- Full workflow passes against the local test database and test R2 bucket,
  covering outline, shots, render, export, cover, and publish behavior.

## Acceptance Criteria

- The user story is not automatically changed by the workflow.
- `/api/stories/enhance` is only called by explicit user action.
- Extra text-model optimization is disabled unless `.env` enables it.
- Enabled optimization respects scope and call-budget configuration.
- Shot splitting creates stable, ordered panel shots from the current story and
  outline.
- Page rendering receives a conflict-resolved prompt with explicit panel,
  character, dialogue, layout, visual-mode, and aspect-ratio constraints.
- New and affected tests pass. Known unrelated backend lint findings remain
  separately tracked until that cleanup is scheduled.
