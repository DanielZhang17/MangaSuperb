# Auto Mode Manga Generation

**Date:** 2026-05-10
**Status:** Approved for implementation planning

## Overview

Add a full Auto Mode for users who want one-click manga generation after
uploading or pasting a novel. The existing detailed comics workflow becomes Pro
Mode, but Auto is not limited to the simplified lane: Pro controls also default
to Auto unless the user has valid manual preferences or overrides a field for
the current comic.

The first iteration should fit the current UX. Users can upload a story, keep
clicking through the workflow, review automatically detected characters before
rendering, and then generate the first page, all pages, or remaining pages. The
agent/model handles scripting, character detection, missing character creation,
shot splitting, auto paneling, layout, style, color, aspect ratio, font, and
speech bubble defaults.

## Goals

- Make Auto the default path for new users.
- Preserve the current workflow as Pro Mode for users who want detailed control.
- Default Pro selections to Auto or valid user preferences.
- Let users override individual Pro settings without leaving the workflow.
- Extract story characters, reuse matching existing characters, create missing
  characters, and ask the user only when a name/description conflict exists.
- Require a character review checkpoint before any page rendering spends image
  generation cost.
- Support page-by-page generation and full-book generation.
- Allow full-book runs to continue in the background with a retractable status
  panel and an Abort action.
- Keep completed pages when a full-book run is aborted or partially failed.

## Non-Goals

- No separate Auto product area in the first iteration.
- No replacement of the existing story, character, panels, or image-generation
  pages.
- No fully autonomous publish-to-public step without user confirmation.
- No silent reuse of conflicting characters.
- No requirement that character images finish before the user can continue with
  text-only character prompts.
- No cross-tab job synchronization beyond the existing active-job polling model.

## User Experience

The comics page gets a top-level mode choice:

- `Auto`: simplified lane for upload, minimal preferences, character review, and
  generation actions.
- `Pro`: the current four-step workflow, with Auto available as the default for
  each configurable selection.

Auto Mode collects:

- novel/story text by upload or paste
- title
- optional style preference text
- optional color preference
- generation action: generate first page, all pages, or remaining pages when
  applicable

Pro Mode keeps its existing tabs:

- story/settings
- characters
- panels/layout
- image generation/export

The difference is that Pro controls default to Auto. Each control can be
switched from Auto to a manual value for the current comic. Manual overrides win
over Auto for that comic until the user switches the field back to Auto.

Rendering actions are available in both modes:

- `Generate first page`
- `Generate all pages`
- `Generate remaining pages`, shown when at least one page is rendered and
  unrendered pages remain
- `Abort`, shown while a multi-page render run is active

## Preferences And Defaults

The settings system must be realigned with the choices available in the current
workflow. New users default to Auto for every creative or workflow setting.

Each configurable preference should normalize to this shape:

```ts
type AutoPreference<T> =
  | { mode: 'auto'; value?: never }
  | { mode: 'manual'; value: T }
```

Fields:

- `character_detection`
- `style`
- `color_mode`
- `aspect_ratio`
- `page_layout`
- `font_family`
- `font_size`
- `bubble_shape`
- `bubble_tail`
- `text_provider`
- `image_provider`

Normalization rules:

- New users get `mode: 'auto'` for every field.
- Existing valid legacy settings become manual preferences.
- Existing invalid or missing values normalize back to Auto.
- If available UI selections change and a stored manual value no longer matches,
  that field normalizes back to Auto.
- Workflow defaults use a stored manual preference only when that preference
  exists and still matches the current available selections. Otherwise the
  workflow uses Auto inference for that field.
- Frontend controls render Auto as the selected default in Pro.

## Character Auto Prep

Auto character prep runs before rendering and before final character selection.
It accepts story text, optional user style preferences, text/image provider
choices, and the current user's accessible character library.

It returns a review payload:

- `reused`: existing user/public characters that confidently match by name and
  compatible description
- `created`: missing characters that were auto-created
- `conflicts`: characters with same/similar names but incompatible descriptions
- `failed`: characters that could not be created
- `suggested_roles`: protagonist/supporting/antagonist/cameo where inferable

Matching policy:

- Obvious name and description matches are reused.
- Missing characters are created automatically.
- Same/similar name with conflicting description is never guessed silently.
- Conflicts pause the Auto flow for user review.
- The existing `CharacterUpsertDialog` is reused for editing in the first
  iteration.

Character image behavior:

- New characters enqueue image generation through the existing character image
  job path.
- The review screen shows pending, completed, and failed image states.
- Users may wait, retry/edit, or continue with text-only character prompts if
  image generation is pending or failed.

## Pipeline

Auto and Pro share the same backend generation stages where possible.

1. User uploads or pastes the story.
2. Preferences and current-comic overrides resolve to concrete generation
   choices or Auto instructions.
3. Auto character prep extracts, matches, creates, and returns review data.
4. User reviews characters and resolves conflicts.
5. Comic creation/upsert stores story, title, style, aspect ratio, color mode,
   and character assignments.
6. Outline/script preparation runs.
7. Shot splitting runs.
8. Page assignment and page layout run. Layout can be a manual value, a valid
   preference, or per-page Auto.
9. Rendering runs for one page, all pages, or remaining pages.
10. Export/publish remains user-triggered.

Auto defaults should be resolved as late as practical so Pro overrides and
updated preferences are honored at the point each stage runs.

## Backend Architecture

Add an auto-prep backend capability rather than a separate Auto app.

Suggested units:

- `mangasuperb/services/auto_prep.py`
  - extracts cast candidates from story text
  - matches candidates against accessible characters
  - creates missing characters
  - builds the review payload
- `mangasuperb/routes/auto.py`
  - exposes Auto prep endpoints
  - validates providers and story payloads
- preference normalization helpers in `models.py` or a focused preferences
  service
- render-run orchestration helpers in `mangasuperb/services/jobs.py`

The model-backed extraction should request structured JSON with:

- name
- aliases
- short description
- sex if inferable
- visual traits
- story role
- confidence

The extraction result is advisory. Backend validation decides what can be
reused, created, or marked as conflict.

## Render Runs And Abort

Full-book and remaining-page generation need a run-level concept so Abort is
reliable.

Suggested data model:

- `ComicRenderRun`
  - `id`
  - `comic_id`
  - `user_id`
  - `mode`: `first_page`, `all_pages`, `remaining_pages`
  - `status`: `queued`, `running`, `completed`, `failed`, `aborted`
  - `current_page_number`
  - `requested_pages_json`
  - `completed_pages_json`
  - `failed_pages_json`
  - `abort_requested`
  - timestamps

Behavior:

- `Generate first page` schedules only page 1.
- `Generate all pages` schedules all page numbers produced by shot splitting.
- `Generate remaining pages` schedules only pages without rendered images.
- Page renders run sequentially by default to reduce provider pressure and keep
  continuity predictable.
- Each page render checks whether the run has `abort_requested=true` before
  rendering and before enqueueing the next page.
- Abort does not delete completed pages.
- Abort marks unstarted pages as skipped by the run, not as failed pages.
- If a page fails in a multi-page run, stop scheduling later pages unless the
  user explicitly retries or continues.

## Background Status Panel

Long-running work should continue in the background and surface through the
existing retractable progress shelf pattern.

Behavior:

- Any Auto or Pro long-running job appears in the global status panel.
- The panel collapses into a floating chip and expands into detailed rows.
- Rows group by comic/book, not raw RQ job id.
- Stages include character prep, character image generation, outline/script,
  panels, render, export, and publish.
- Full-book render rows show page progress: rendered pages / total pages.
- Rows deep-link back into the relevant comics step.
- Reload rehydrates active jobs/runs from the backend.
- Active multi-page render rows expose Abort.
- Completed, failed, and aborted rows remain briefly, then disappear.

Implementation should extend existing `ProgressShelf`, `useActiveJobs`, and
`GET /api/jobs/active` behavior rather than replacing them.

## Error Handling

- Character extraction failure keeps the story/settings and lets the user retry
  or switch to Pro.
- Conflicting character matches go to review instead of being guessed.
- Missing character creation failure appears in review with retry/edit/manual
  selection options.
- Pending character images do not block the user from continuing with text-only
  prompts.
- Panel generation failure keeps the comic draft and exposes retry from panels
  and the status panel.
- Page render failure during a multi-page run stops future pages until the user
  retries or continues.
- Abort keeps completed pages, suppresses future page renders, and marks the run
  aborted.
- Invalid saved preferences normalize back to Auto.
- Manual current-comic overrides always win over Auto.

## Testing

Backend tests:

- New users normalize to Auto preferences.
- Existing valid legacy preferences are preserved as manual preferences.
- Invalid or unavailable preference values normalize to Auto.
- Character matching covers obvious reuse, missing creation, and conflict on
  same/similar name with incompatible description.
- Auto prep returns `reused`, `created`, `conflicts`, `failed`, and roles.
- Full-book render enqueues all pages in order.
- Remaining-pages render skips already rendered pages.
- Abort prevents future pages from rendering and preserves completed pages.

Frontend tests:

- Auto/Pro mode switch preserves the existing Pro workflow.
- Pro controls default to Auto and can be manually overridden.
- Invalid preferences display as Auto.
- Character review renders reused, created, conflict, and failed states.
- Existing character edit dialog opens from the review surface.
- Render buttons show first/all/remaining according to page state.
- Progress shelf shows background Auto jobs, page progress, and Abort.

Manual smoke:

- New user uploads a story, sees Auto defaults, reviews characters, generates
  all pages, and aborts mid-run.
- Existing user with old settings keeps valid preferences and invalid settings
  reset to Auto.
- Pro user overrides layout/style/color and generates remaining pages.

## First Iteration Scope

Ship the first iteration as an Auto layer over the current UX:

- mode switch
- preference normalization to Auto/manual
- Auto defaults in Pro controls
- story upload/paste using existing editor behavior
- character extraction/matching/creation with review
- generate first/all/remaining pages
- render-run abort
- status shelf extensions

Defer a fully separate Auto workspace, advanced conflict-resolution UI, publish
automation, cross-tab coordination, and push notifications.
