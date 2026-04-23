# Creator-UX Roadmap & Design: In-Wizard Live Progress Shelf

- **Date:** 2026-04-24
- **Status:** Draft for review
- **Audience this roadmap serves:** Creators (people making comics)
- **Optimization target:** Fewer abandoned drafts mid-wizard
- **Engineering constraint:** New infra is acceptable when justified; minimize otherwise

## Context

MangaSuperb today exposes a 4-step wizard (`story → characters → panels → image-generation`) that depends on multi-minute Redis RQ jobs against the Gemini API. The synchronous UI gives almost no signal during these waits: users either keep the comics tab open and watch atoms update, or open dev tools to poll `/api/jobs/<id>`. Navigating away from the comics tab — to `/ideas`, `/me`, or by closing the tab — visibly hides any indication that work is running. Anecdotally and structurally, the silence during async work is the dominant abandonment driver for AI-generation products. Reuse libraries and starter templates only compound *retention* once a creator finishes their first comic; trust during the wait determines whether they get there at all.

This document presents a 7→8 small-ship roadmap (each ~1–3 days) framed by a trust-first ranking, then a full design for the #1 item.

## Roadmap (8 small ships)

Each item is individually shippable. Ordering matters: trust wins ship before reuse and onboarding compound on top.

### Trust tier
1. **In-wizard live progress shelf** — *designed in this document.* Persistent app-wide shelf showing every active job for the current user, with stage-aware progress, deep-links into the originating wizard tab, and rehydration on reload.
2. **Job completion notifications** — Web Push (when granted) plus an in-app bell/toast on job finish/fail. Reassures users it's safe to close the tab; pulls them back when work is ready.
3. **Failure recovery UX** — when a stage fails, surface `comic_workflow_stages.error_message` in the shelf row and offer a "retry this stage" button hitting the existing `/api/jobs` dispatcher. Removes the dead-end where a failed job today silently halts the wizard.

### Instrumentation foundation
4. **Lightweight funnel events** — emit structured backend events on wizard-stage entry/exit and job lifecycle transitions; add a tiny aggregate endpoint (counts by stage and outcome over a date range). The next iteration of this roadmap should be data-driven, not vibes-driven.

### Quality tier
5. **Generation-context optimization** — tighten the context passed to the image-generation model so each panel/page render receives the right inputs: resolved character descriptions (with reference image URLs and any optimized prompt fragments), the comic's `style_description` and `aspect_ratio`, adjacent-panel continuity hints (a short summary of the previous panel for visual consistency), plus the current panel's `description`, `dialogue`, and `camera_notes`. Touches `mangasuperb/services/generation.py` and `services/jobs.py`. Adds a `build_panel_render_context()` helper that centralizes what is currently scattered across the render code path. Trust dividend: abandonment from "the image doesn't match the characters / style / scene" drops.

### Reuse tier
6. **"Continue where you left off" shelf** — persistent strip on `/` and `/ideas` showing in-progress comics with deep-links into the exact wizard tab. Backend: extend `GET /api/comics` to include `last_active_stage` and sort by `updated_at`.
7. **Character reuse picker** — improved character picker inside the Characters tab: grouped (mine / public / recently used), searchable, multi-select with thumbnails. Backend: add a small public-characters list endpoint.

### Onboarding tier
8. **Starter templates** — 4–6 curated tiles on the Ideas page, each bundling a prompt + style + layout + suggested characters. One click seeds the wizard via prefilled atoms. Implementable as a static JSON bundled with the frontend.

---

## Feature #1 design: In-Wizard Live Progress Shelf

### Problem

A creator triggers `comic_generation`, `publish`, or per-page `render` and then waits minutes. The only feedback today is silent atom updates inside the comics tab and manual polling. Navigating to characters/ideas/me, or closing the tab, removes all signal that anything is in progress. Abandonment happens in the silence, not in the latency. The fix is a persistent, app-wide indicator that survives navigation and reload, with stage-level granularity and a one-click route back to the work.

### Scope

**In scope.** A global dashboard-mounted progress shelf showing every active job for the signed-in user, broken down by stage, sourced from `/api/jobs/<job_id>` and `comic_workflow_stages`. Click-through deep-link to the originating comic's wizard tab. Rehydration on page reload via a new lightweight endpoint plus localStorage.

**Out of scope (deliberate).** Cross-tab synchronization. Web Push or background notifications (covered by roadmap #2). Failure-retry UX (covered by roadmap #3). Any change to RQ job logic or how jobs are enqueued.

### Architecture

Four pieces, four clean boundaries:

**Backend — one new endpoint.** `GET /api/jobs/active` returns the list of in-flight jobs (status ∈ queued/started/deferred) owned by the current user, joined with `comic_id` and `stage` via `comic_workflow_stages.job_id`. Lets the shelf rehydrate after page reload without depending solely on localStorage. Roughly 30 lines, reuses the existing `WorkflowStage` model and login decorator.

**Frontend state — one Jotai atom.** `activeJobsAtom` keyed by `job_id`, each entry carrying `{ comic_id, stage, status, started_at, title }`. Writes happen from three places:
- API client wrappers append on successful job dispatch (`ComicsApi.publish`, `JobsApi.create`, `PanelsApi.renderPage`).
- The poller updates `status` and `stage` per tick.
- Terminal transitions (`finished` / `failed`) schedule removal after a 5s "completed" flash.

Persisted to localStorage; on mount the shelf calls `GET /api/jobs/active` and merges that with localStorage so reloads converge to truth.

**Frontend poller — one hook.** `useActiveJobsPolling` runs a single `setInterval`. Cadence is 2s while `document.visibilityState === 'visible'`, 10s while hidden. No-ops when the atom is empty. Coalesces per-comic detail fetches (`GET /api/comics/<id>`) to once per comic per 5s for stage-level data and per-page render counts.

**Frontend component.** `<ProgressShelf />` mounted once in `dashboard-layout.tsx`, docked bottom-right. Collapsed-by-default chip ("2 jobs running ▾") expands to a panel of rows. Each row groups by `comic_id` so a creator sees one row per comic with stage sub-progress, not three rows for three RQ jobs.

Each unit is testable in isolation: endpoint via SQL-join unit test, atom + poller via mocked axios under fake timers, component via render tests over atom shapes.

### Data flow

```
Job dispatch  (POST /api/jobs, /publish, /pages/<n>/render)
  └─ response includes job_id(s) + comic_id
        └─ API client appends entries to activeJobsAtom
              └─ useActiveJobsPolling picks them up next tick
                    └─ batched GET /api/jobs/<id>  (2s visible / 10s hidden)
                          └─ atom updated with rq_status (+ stage from coalesced comic fetch)
                                └─ <ProgressShelf /> re-renders rows
                                      └─ terminal state: 5s "done" flash → remove from atom
                                      └─ click row → navigate('/comics?comic_id=…&tab=<stage>')

On fresh page load / reload:
  ProgressShelf mounts → GET /api/jobs/active → merge into atom → poller resumes
```

**Progress granularity.** `/api/jobs/<id>` only exposes `rq_status` (queued/started/finished/failed). Stage-level granularity comes from coalesced `GET /api/comics/<id>` calls that read `workflow_stages[*]` and map them into the shelf's stage pills. For the render stage specifically, per-page progress is computed by counting `comic_pages` with non-null `image_url` against the expected total. No new RQ instrumentation required.

**Concurrency.** A single comic with three stage jobs (outline/shots/render) groups into one shelf row. Two unrelated comics generating in parallel show as two rows.

### Components & interfaces

Four units:

**1. `mangasuperb/routes/jobs.py` — `GET /api/jobs/active`**
- Input: none (auth from session).
- Output: `{ active: [{ job_id, comic_id, stage, status, title, started_at }] }`.
- Filters: `status ∈ {queued, started, deferred}`; user-scoped.
- `comic_id` may be `null` if the underlying comic was deleted while the job was queued.

**2. `frontend/src/apis/jobs.ts` — `listActiveJobs()`**
- Thin client wrapper for the endpoint above.
- Used by `<ProgressShelf />` on mount and on visibility-regained.

**3. `frontend/src/hooks/use-active-jobs.ts` — state + polling**
- Owns the read/write contract for `activeJobsAtom`.
- Exposes `{ jobs, appendJob(entry), removeJob(jobId) }`.
- Single `setInterval`, cadence flips on `document.visibilityState` change; listener registered/cleaned on mount/unmount.
- Coalesces per-comic detail fetches at 5s minimum spacing per `comic_id`.
- Standard exponential backoff on the batch poll: 2s → 4s → 8s → 16s → 32s → cap 60s, reset to 2s on the first successful tick after failures.
- After 3 consecutive batch failures, marks affected rows with a "reconnecting…" hint (cleared on recovery).
- On terminal state (`finished` / `failed`), schedules removal at +5s.

**4. `frontend/src/components/progress-shelf/`**
- `<ProgressShelf />` — docked bottom-right container; chip ↔ panel toggle; renders nothing when `jobs` is empty.
- `<ProgressRow comic={…} />` — one row per comic. Title, current-stage pill (outline/shots/render/export), `<StageBar />`, click target.
- `<StageBar stages={…} current={…} />` — one segment per stage in the active workflow flow (`comic_generation`: outline → shots → render; `publish`: cover → export → publish), fills as stages complete. Pure component.

**API-client touchpoints (existing files, tiny edits):** wherever a job is dispatched today (`ComicsApi.publish`, `JobsApi.create`, `PanelsApi.renderPage`) append to `activeJobsAtom` on success. Two-or-three-line additions; no global event bus needed.

Each boundary holds: the endpoint knows nothing about UI; the hook knows nothing about rendering; the component knows nothing about endpoints or polling.

### Error handling & edge cases

- **Job lookup 404 (RQ result TTL expired).** Treat as terminal-finished, remove quietly, log once. Common after a tab is left open overnight.
- **Network flap during poll.** Single failed tick does not drop state. Standard exponential backoff on the batch (2s → 4s → 8s → 16s → 32s → 60s cap, reset to 2s on first success). After 3 consecutive failures, rows display a "reconnecting…" hint that clears on recovery.
- **Worker down.** `worker_snapshot.active === 0` (already in `/api/jobs/<id>` response) triggers a one-time, dismissible banner inside the shelf: "No workers running — jobs may be delayed." Not per-row.
- **Stale localStorage on reload.** Hydrated job IDs not present in `GET /api/jobs/active` are dropped. Handles the case where a job finished while the tab was closed.
- **Multiple tabs.** Out of scope. Each tab polls independently — duplicate work, correct behavior.
- **Comic-detail fetch fails.** Row falls back to last known stage and shows raw `rq_status`. Never blocks the primary `/api/jobs/<id>` poll.
- **Job belongs to a deleted comic.** Endpoint returns `comic_id: null`. Shelf renders a generic row showing only the stage; clicking deep-links to `/me`.
- **User logs out mid-job.** On logout, clear the atom and stop the poller. Endpoint is `@login_required`; a stale poll after logout is a safe 401.
- **Auth 401 mid-session.** Poller catches 401, stops the interval, clears state, does not redirect (avoids stealing navigation). Next app-level auth check handles the redirect.

### Testing

**Backend (`tests/test_jobs_routes.py` addition).** One test for `GET /api/jobs/active` covering:
- user A sees only their own in-flight jobs; user B's are excluded
- `comic_id` and `stage` come from `comic_workflow_stages` joins
- `finished` / `failed` stages are filtered out
- `comic_id: null` when the originating comic was deleted

**Frontend.** Vitest with `vi.useFakeTimers`:
- `use-active-jobs` hook: append → poll fires → atom updates; visibility change flips cadence; 3 failures → "reconnecting" hint; backoff sequence 2 → 4 → 8 → 16 → 32 → 60 → 60; recovery resets to 2; terminal state schedules removal at 5s; empty atom → no interval.
- `<StageBar>`: snapshot + a handful of prop permutations (pure component).
- `<ProgressShelf>`: render test for chip↔panel toggle, empty-state non-render, click-through calls `navigate` with the right query string.

**Manual smoke (documented in the spec, executed before merge).**
- Kick off a `comic_generation`, navigate away to `/ideas`, confirm the shelf persists and continues to update.
- Reload mid-render, confirm hydration via `GET /api/jobs/active` works.
- Stop the RQ worker, confirm the "no workers" banner appears.
- Force a job failure, confirm the row shows failed state and disappears after 5s.

No integration test against real Redis — the existing `tests/conftest.py` already stubs RQ.

## Open questions

None at this time. Cross-tab synchronization, push notifications, and stage retry are intentionally deferred to roadmap items #2 and #3.
