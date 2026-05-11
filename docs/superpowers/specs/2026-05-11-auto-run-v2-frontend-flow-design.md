# Auto Run V2 Frontend Flow And Progress Shelf

**Date:** 2026-05-11
**Status:** Approved design; pending implementation planning

## Overview

Auto Mode V2 turns the current assisted Auto lane into a true one-click manga
generation flow. A user uploads or pastes a novel, clicks one primary action,
and the app creates the manga, prepares characters, generates panels, applies
automatic layout, renders all pages, and lands on a preview-first result view.

The current detailed workflow remains Pro Mode. Auto hides advanced options
unless the user explicitly switches to Pro. During an active Auto run, returning
to the same comic in Auto Mode shows a full-page progress view rather than an
editor. In Pro Mode, the user may continue editing the draft, but edits do not
mutate the active Auto run; the run uses the story snapshot captured at start.

The progress shelf also becomes more reactive: its collapsed state is a
draggable circular button that snaps to the nearest viewport edge and may
half-hide when docked. It expands into the existing detailed progress panel and
remains available on authenticated app pages except `/auth`.

## Goals

- Make Auto Mode a one-click path from story to full-book rendering.
- Persist Auto run state on the backend so reloads, navigation, and returns to
  the same comic recover correctly.
- Keep Auto users focused on progress and preview, not configuration.
- Keep Pro users able to edit during a run without implying edits affect the
  in-flight run.
- Show Auto runs, render runs, character image jobs, and optimization jobs in
  the global progress shelf.
- Make the shelf draggable, edge-snapping, compact, and less likely to cover
  page controls.
- Improve React performance around polling, preview rendering, and shelf
  re-renders.

## Non-Goals

- No public publishing without an explicit user action.
- No Auto pause before rendering on the happy path.
- No automatic restart when the user edits the story in Pro during an active
  Auto run.
- No replacement of Pro Mode controls.
- No cross-tab synchronization beyond backend-backed status hydration.
- No visual quality scoring or automatic visual critique loop in this phase.

## Product Decisions

The selected architecture is a backend-persisted Auto run:

- The frontend starts one Auto run.
- The backend owns the stage progression.
- The frontend renders run state and recovery actions.
- The run continues in the background.
- The shelf deep-links back to the run.

The selected active-run editing policy is split by mode:

- Auto Mode locks into a progress page while the run is active. It does not show
  story editing for that comic.
- Pro Mode remains editable. Any edits are draft edits for future actions and
  do not alter the active run snapshot.

The selected shelf behavior is:

- collapsed circular button
- draggable by pointer or touch
- viewport-edge snap
- half-hidden edge peek when docked and idle
- click or keyboard activation expands the detailed panel

## Auto Run Backend Model

Add a persistent `ComicAutoRun` model, or equivalent table, scoped by user and
comic.

Suggested fields:

- `id`
- `comic_id`
- `user_id`
- `status`: `draft`, `queued`, `running`, `needs_review`, `completed`,
  `failed`, `aborted`
- `current_stage`: `story`, `characters`, `panels`, `layout`, `render`,
  `preview`
- `story_snapshot`
- `title_snapshot`
- `preferences_snapshot_json`
- `character_review_json`
- `selected_character_ids_json`
- `render_run_id`
- `abort_requested`
- `error_message`
- `created_at`
- `started_at`
- `completed_at`
- `updated_at`

The snapshot fields are important. They make the run reproducible and prevent
Pro edits from silently changing the work already in progress.

Only one active Auto run should exist per comic. Starting a new Auto run for the
same comic while one is active should return a conflict response with the active
run payload, not create a duplicate. After completion, users may regenerate all
pages or remaining pages through a new run or through the render-run controls.

## Auto Run Orchestration

The backend orchestrates this path:

1. Validate story and title.
2. Capture story, title, and resolved preference snapshots.
3. Create or update the draft comic.
4. Extract characters.
5. Reuse matching characters and create missing characters.
6. Pause only if conflicts or unrecoverable character preparation failures need
   user input.
7. Store accepted character assignments.
8. Generate or refresh script/outline.
9. Split panels and assign page numbers.
10. Apply automatic layout for every page.
11. Start all-page rendering through the existing render-run machinery.
12. Mark the Auto run completed after the render run completes.

The happy path should not require a render-before-confirmation stop. The system
only pauses for conflict, missing required information, provider failure,
configuration failure, or explicit abort.

Abort should propagate from the Auto run to any active render run. Completed
pages remain stored.

## API Surface

Suggested endpoints:

- `POST /api/auto/runs`
  - Starts a run from story, title, and optional user-facing Auto preferences.
  - Returns `{ auto_run, comic }`.
- `GET /api/auto/runs/<id>`
  - Returns current run status, comic summary, character review data, render
    progress, and recoverable actions.
- `GET /api/auto/runs/active?comic_id=<id>`
  - Returns the active run for a comic when present.
- `POST /api/auto/runs/<id>/resolve`
  - Resolves conflicts or review-required states.
- `POST /api/auto/runs/<id>/abort`
  - Requests abort and returns updated run status.
- `POST /api/auto/runs/<id>/retry`
  - Retries a failed recoverable stage.

`GET /api/jobs/active` should include active Auto runs or expose enough metadata
for the frontend to merge Auto runs with existing active jobs. The shelf should
not need to know implementation details of each backend job.

## Auto Mode State Machine

Auto Mode renders one of four surfaces for the selected comic.

### Draft

The draft surface contains:

- story upload or paste using the existing editor/import behavior
- title
- optional high-level style preference
- one primary action: `Generate manga`

It should not show Pro controls, model selectors, layout selectors, font
controls, or render buttons.

### Running

The running surface takes over the whole Auto page:

- current stage
- stage list
- page progress when rendering starts
- active worker or queued hints when available
- abort action
- link to switch to Pro
- no story editor

If the user returns to the same comic in Auto Mode while a run is active, this
surface appears immediately after hydration.

### Needs Review

This surface is only for conflicts or recoverable failures:

- character name/description conflicts
- failed missing-character creation
- provider/configuration failures that need user action

It should reuse the current character edit/create popup for first iteration
conflict handling. Once resolved, the run resumes from the blocked stage.

### Completed

The completed surface is preview-first:

- large page preview or page gallery
- right-side actions: export, regenerate current page, regenerate remaining
  pages, regenerate all pages
- toggle between `Preview` and `Story`
- explicit `Switch to Pro` for advanced controls

Auto completed view does not show other Pro options by default.

## Pro Mode During Active Auto Runs

When the current comic has an active Auto run and the user switches to Pro:

- Pro tabs remain usable.
- Editing is allowed.
- A compact banner explains that the active Auto run is using a saved story
  snapshot.
- The banner should offer a route back to Auto progress.
- Current edits apply only to future regenerate/new run actions.

This keeps Pro powerful without creating a misleading live-edit contract.

## Progress Shelf V2

The shelf has two visual states.

Collapsed state:

- circular button
- badge count for active jobs
- progress ring or small status indicator when useful
- draggable with pointer and touch input
- keyboard focusable
- remembers position in local storage
- snaps to nearest viewport edge on drag end
- clamps within viewport on resize
- half-hides when docked to an edge and idle
- fully reveals on hover, focus, drag, or active job status change

Expanded state:

- opens near the docked edge
- shows grouped job rows as today
- includes Auto runs, render runs, character image jobs, character optimization
  jobs, export, cover, and publish jobs
- supports abort for active Auto/render runs
- deep-links Auto runs to the Auto running page
- deep-links Pro jobs to the relevant Pro tab

It remains mounted in `dashboard-layout.tsx` and must not render on `/auth`.

## Frontend Architecture

Suggested new or changed units:

- `frontend/src/apis/auto.ts`
  - add Auto run endpoints
- `frontend/src/hooks/use-auto-run.ts`
  - fetch, poll, and normalize current Auto run status
- `frontend/src/pages/comics/auto/auto-mode-tab.tsx`
  - become a state router instead of a single prepare-character panel
- `frontend/src/pages/comics/auto/auto-draft.tsx`
  - story/title input and one-click start
- `frontend/src/pages/comics/auto/auto-run-progress.tsx`
  - full-page active-run progress
- `frontend/src/pages/comics/auto/auto-run-review.tsx`
  - conflict/recovery surface
- `frontend/src/pages/comics/auto/auto-preview.tsx`
  - preview-first completed view
- `frontend/src/components/progress-shelf/shelf-orb.tsx`
  - draggable collapsed state
- `frontend/src/components/progress-shelf/use-shelf-position.ts`
  - localStorage, snap, clamp, half-hidden state
- `frontend/src/components/progress-shelf/progress-shelf.tsx`
  - shell coordinating orb and panel

The existing `ImageGeneration` page remains the Pro image-generation surface.
Auto preview can reuse smaller presentational pieces, but should avoid mounting
the full Pro property panel.

## React And Performance Guidelines

Apply the React best-practice constraints most relevant to this work:

- Keep polling centralized and deduped. Avoid each Auto subcomponent firing its
  own status request.
- Use visibility-aware polling cadence and backoff for run status.
- Subscribe components to derived state, such as active run status and progress
  counts, instead of broad raw comic objects when possible.
- Use stable primitive dependencies for effects.
- Use functional state updates for drag state and polling state.
- Store transient drag coordinates in refs and commit position only on drag end
  or animation frame boundaries.
- Split shelf orb, shelf panel, Auto progress, and Auto preview into separate
  components to reduce re-renders.
- Do not define child components inside render-heavy parent components.
- Give previews, thumbnails, and shelf controls stable dimensions to avoid
  layout shift.
- Memoize derived page lists and character/run summaries.
- Use direct imports rather than barrel imports for new heavy components.

## I18n Requirements

Add missing strings for all supported locales:

- Auto run statuses and stages
- `Generate manga`
- active run snapshot banner
- run blocked/review labels
- preview/story toggle
- regenerate current page
- regenerate all pages
- regenerate remaining pages
- draggable shelf labels
- docked shelf open/close labels
- abort Auto run labels

Tests should assert visible user-facing strings through i18n keys or localized
text where existing tests already do so.

## Error Handling

- Story/title validation errors stay on the draft surface.
- Character conflicts move the run to `needs_review`.
- Failed missing-character creation appears in `needs_review` with edit/create
  options.
- Provider failures show the failed stage, message, retry when recoverable, and
  switch-to-Pro as an escape hatch.
- Abort keeps completed pages and returns the run to an aborted progress state.
- Render-run completion refreshes Auto preview data without requiring a manual
  reload.
- If the shelf cannot hydrate a job detail, it keeps the last known row and
  shows reconnecting after repeated failures.

## Testing

Backend tests:

- starting an Auto run creates a run and stores story/preference snapshots
- duplicate active run for the same comic is rejected or returns the active run
- happy path progresses without a manual review pause
- character conflict moves the run to `needs_review`
- resolving review resumes the run
- abort marks the Auto run and active render run aborted
- completed render run marks Auto run completed
- active jobs endpoint includes Auto runs

Frontend tests:

- Auto draft shows one primary generation action and hides Pro controls
- active Auto run shows full-page progress and no story editor
- returning to a comic with an active Auto run hydrates the running surface
- completed Auto run shows preview-first UI and preview/story toggle
- Pro mode during active Auto run shows snapshot banner and allows editing
- render completion refreshes preview pages automatically
- shelf orb drags, snaps, persists position, and half-hides near edges
- shelf deep-links Auto runs to Auto progress
- shelf remains unavailable on `/auth`

Browser QA:

- run against `http://localhost:5001`
- log in with the local test account documented in `AGENT.md`
- start or seed an Auto run
- verify running Auto page has no editor
- verify Pro can edit while the snapshot banner is visible
- verify shelf opens, drags, snaps, half-hides, and deep-links back
- verify completed run refreshes into preview without a manual reload
- verify desktop and mobile viewports have no overlap or clipped controls
- verify console errors and framework overlays are absent

## Implementation Boundary

This is a single implementation phase because the backend Auto run is the
source of truth for the new Auto UX and the progress shelf depends on the same
run state. The work can still be split across independent agents by write scope:

- backend Auto run model/routes/services
- frontend Auto state machine and preview surfaces
- progress shelf draggable/snap behavior
- i18n/tests/browser QA

Each slice must integrate through typed API contracts rather than duplicating
run-state logic.
