# In-Wizard Live Progress Shelf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, app-wide progress shelf so creators can see — and click back to — every active RQ job (comic generation, story optimization, page render, publish) regardless of which page they're on.

**Architecture:** One new `@login_required` Flask endpoint exposes the user's in-flight jobs joined with their workflow stage. A single Jotai atom holds those jobs in the React app, hydrated from the endpoint on mount + persisted to localStorage. One polling hook drives all updates with visibility-aware cadence and standard exponential backoff. A small set of components renders the shelf, mounted once in the dashboard layout.

**Tech Stack:** Flask 3 + SQLAlchemy 3.1 + flask-login (backend) · React 19 + Jotai + Vite + Tailwind (frontend) · pytest (backend tests) · Vitest 1.x + jsdom (new — frontend hook tests only).

**Reference spec:** `docs/superpowers/specs/2026-04-24-in-wizard-progress-shelf-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `mangasuperb/routes/jobs.py` | modify | Add `GET /api/jobs/active` route. |
| `tests/test_job_routes.py` | modify | Add tests for `GET /api/jobs/active`. |
| `frontend/src/apis/jobs.ts` | modify | Add `listActiveJobs()` client + `ActiveJob` type. |
| `frontend/src/atoms.ts` | modify | Export `activeJobsAtom` + `appendActiveJob` / `removeActiveJob` setters. |
| `frontend/src/hooks/use-active-jobs.ts` | create | Hook owning polling, cadence, backoff, terminal-state cleanup, hydration. |
| `frontend/src/components/progress-shelf/stage-bar.tsx` | create | Pure component rendering stage segments. |
| `frontend/src/components/progress-shelf/progress-row.tsx` | create | One-comic row inside the shelf. |
| `frontend/src/components/progress-shelf/index.tsx` | create | Docked shelf container with chip↔panel toggle. |
| `frontend/src/pages/dashboard-layout.tsx` | modify | Mount `<ProgressShelf />` once. |
| `frontend/src/apis/comics.ts` | modify | Append on dispatch (publish, startImages). |
| `frontend/src/apis/panels.ts` | modify | Append on dispatch (renderPage). |
| `frontend/src/apis/jobs.ts` | modify (already created above) | Append on dispatch (createComic). |
| `frontend/vitest.config.ts` | create | Minimal Vitest config (jsdom env). |
| `frontend/src/test/setup.ts` | create | Vitest setup file (jsdom + atom reset). |
| `frontend/src/hooks/__tests__/use-active-jobs.test.ts` | create | Hook tests with `vi.useFakeTimers`. |
| `frontend/package.json` | modify | Add `test` script + Vitest dev deps. |

---

## Task 1 — Backend: `GET /api/jobs/active`

**Files:**
- Modify: `mangasuperb/routes/jobs.py` (append at end before final newline)
- Modify: `tests/test_job_routes.py`

- [ ] **Step 1.1: Read the existing test file structure**

Run: `head -40 tests/test_job_routes.py`
Confirm the imports look like other test files (uses `auth_client`, `db`, model factories). If the file does not yet exist, use `tests/test_jobs_workflow.py` as a template instead and create `tests/test_job_routes.py` with the same imports.

- [ ] **Step 1.2: Write the failing test (active jobs endpoint, owner-scoped)**

Append to `tests/test_job_routes.py`:

```python
from datetime import datetime

from mangasuperb.extensions import db
from models import Comic, ComicWorkflowStage, User


def _create_comic(user_id: int, *, title: str = "Test Comic") -> Comic:
    comic = Comic(
        user_id=user_id,
        title=title,
        status="processing",
        workflow_stage="render",
        workflow_status="in_progress",
    )
    db.session.add(comic)
    db.session.commit()
    return comic


def _create_stage(comic_id: int, stage: str, status: str, job_id: str | None) -> ComicWorkflowStage:
    row = ComicWorkflowStage(
        comic_id=comic_id,
        stage=stage,
        status=status,
        job_id=job_id,
        started_at=datetime.utcnow(),
    )
    db.session.add(row)
    db.session.commit()
    return row


def test_active_jobs_returns_only_in_flight_for_current_user(app, auth_client, user):
    with app.app_context():
        owned = _create_comic(user.id, title="Mine")
        _create_stage(owned.id, "render", "in_progress", "job-mine-1")
        _create_stage(owned.id, "outline", "completed", "job-mine-old")

        other = User(username="other", email="other@example.com", password_hash="x")
        db.session.add(other)
        db.session.commit()
        other_comic = _create_comic(other.id, title="Theirs")
        _create_stage(other_comic.id, "render", "in_progress", "job-theirs-1")

    res = auth_client.get("/api/jobs/active")
    assert res.status_code == 200
    body = res.get_json()
    assert "active" in body
    job_ids = sorted(entry["job_id"] for entry in body["active"])
    assert job_ids == ["job-mine-1"]
    entry = body["active"][0]
    assert entry["comic_id"] == owned.id
    assert entry["stage"] == "render"
    assert entry["title"] == "Mine"
    assert entry["status"] == "in_progress"
    assert entry["started_at"] is not None


def test_active_jobs_handles_orphan_when_comic_deleted(app, auth_client, user):
    with app.app_context():
        comic = _create_comic(user.id, title="Soon-Gone")
        _create_stage(comic.id, "render", "in_progress", "job-orphan")
        db.session.delete(comic)
        db.session.commit()

    res = auth_client.get("/api/jobs/active")
    assert res.status_code == 200
    assert res.get_json()["active"] == []  # cascade delete cleared the stage row
```

> The cascade delete on `comic_workflow_stages.comic_id` already wipes orphan stages, so an "orphan" never reaches the response. The test pins that behavior.

- [ ] **Step 1.3: Run tests to verify they fail**

Run: `source .venv/bin/activate && python -m pytest tests/test_job_routes.py -k active_jobs -v`
Expected: FAIL with `404 Not Found` (route doesn't exist yet).

- [ ] **Step 1.4: Implement the endpoint**

In `mangasuperb/routes/jobs.py`, add this near the bottom (after `get_job_status`):

```python
@bp.get("/active")
@login_required
def list_active_jobs() -> Any:
    """Return in-flight workflow stages owned by the current user."""
    rows = (
        db.session.query(ComicWorkflowStage, Comic)
        .join(Comic, ComicWorkflowStage.comic_id == Comic.id)
        .filter(Comic.user_id == current_user.id)
        .filter(ComicWorkflowStage.status.in_(("pending", "in_progress")))
        .filter(ComicWorkflowStage.job_id.isnot(None))
        .order_by(ComicWorkflowStage.started_at.asc())
        .all()
    )

    active = [
        {
            "job_id": stage.job_id,
            "comic_id": comic.id,
            "stage": stage.stage,
            "status": stage.status,
            "title": comic.title,
            "started_at": stage.started_at.isoformat() if stage.started_at else None,
        }
        for stage, comic in rows
    ]
    return jsonify({"active": active}), 200
```

Imports already present (`current_user`, `Comic`, `db`); `ComicWorkflowStage` is not yet imported — add it to the existing `from models import …` line:

```python
from models import Character, Comic, ComicWorkflowStage, Script
```

- [ ] **Step 1.5: Run tests to verify they pass**

Run: `python -m pytest tests/test_job_routes.py -k active_jobs -v`
Expected: PASS (both tests).

- [ ] **Step 1.6: Run full test suite to confirm no regression**

Run: `python -m pytest`
Expected: all green.

- [ ] **Step 1.7: Commit**

```bash
git add mangasuperb/routes/jobs.py tests/test_job_routes.py
git commit -m "jobs: add GET /api/jobs/active for in-flight workflow stages"
```

---

## Task 2 — Frontend: `listActiveJobs()` API client

**Files:**
- Modify: `frontend/src/apis/jobs.ts`

- [ ] **Step 2.1: Add the `ActiveJob` type and client method**

In `frontend/src/apis/jobs.ts`, add to the existing exports:

```typescript
export interface ActiveJob {
  job_id: string
  comic_id: number | null
  stage: string
  status: 'pending' | 'in_progress'
  title: string
  started_at: string | null
}

export interface ListActiveJobsResponse {
  active: ActiveJob[]
}
```

In the `JobsApi` object, add:

```typescript
  // List in-flight jobs owned by the current user
  listActive() {
    return request<void, ListActiveJobsResponse>({
      url: '/api/jobs/active',
      method: 'GET',
    })
  },
```

- [ ] **Step 2.2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add frontend/src/apis/jobs.ts
git commit -m "frontend: add listActive() job API client"
```

---

## Task 3 — Frontend: `activeJobsAtom` with localStorage persistence

**Files:**
- Modify: `frontend/src/atoms.ts`

- [ ] **Step 3.1: Replace the file content**

Replace `frontend/src/atoms.ts` with:

```typescript
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

import type { IUser } from '@/service/types'

// Global user session atom
export const userAtom = atom<IUser | null>(null)

// === Active jobs (progress shelf) ===

export interface ActiveJobEntry {
  job_id: string
  comic_id: number | null
  stage: string
  status: 'pending' | 'in_progress' | 'queued' | 'started' | 'deferred' | 'finished' | 'failed'
  title: string
  started_at: string | null
}

export type ActiveJobsState = Record<string, ActiveJobEntry>

// Persisted across reloads. jotai/utils is already a transitive dep of jotai 2.x.
export const activeJobsAtom = atomWithStorage<ActiveJobsState>('mangasuperb:active-jobs', {})

// Derived setter: append (or replace) one entry by job_id
export const appendActiveJobAtom = atom(null, (get, set, entry: ActiveJobEntry) => {
  const current = get(activeJobsAtom)
  set(activeJobsAtom, { ...current, [entry.job_id]: entry })
})

// Derived setter: remove by job_id
export const removeActiveJobAtom = atom(null, (get, set, jobId: string) => {
  const { [jobId]: _gone, ...rest } = get(activeJobsAtom)
  set(activeJobsAtom, rest)
})
```

- [ ] **Step 3.2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If `jotai/utils` is not resolvable, add it explicitly: `npm install jotai@^2.12.5` re-resolves the subpath.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/atoms.ts
git commit -m "frontend: add activeJobsAtom with localStorage persistence"
```

---

## Task 4 — Frontend: `<StageBar>` pure component

**Files:**
- Create: `frontend/src/components/progress-shelf/stage-bar.tsx`

- [ ] **Step 4.1: Create the file**

```typescript
import { cn } from '@/lib/utils'

// Maps a workflow flow to its ordered stage list.
// Keep these in sync with backend stage names emitted by services/jobs.py.
export const STAGE_FLOWS: Record<string, string[]> = {
  comic_generation: ['outline', 'shots', 'render'],
  story_optimization: ['outline', 'shots'],
  publish: ['cover', 'export', 'publish'],
  page_render: ['render'],
  character_optimization: ['character'],
}

export function inferFlow(stage: string): string[] {
  for (const flow of Object.values(STAGE_FLOWS)) {
    if (flow.includes(stage)) return flow
  }
  return [stage]
}

interface StageBarProps {
  stages: string[]
  current: string
  className?: string
}

export function StageBar({ stages, current, className }: StageBarProps) {
  const currentIndex = Math.max(0, stages.indexOf(current))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={stages.length}
      aria-valuenow={currentIndex + 1}
      className={cn('flex w-full items-center gap-1', className)}
    >
      {stages.map((stage, idx) => (
        <div
          key={stage}
          aria-label={stage}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            idx < currentIndex && 'bg-emerald-500',
            idx === currentIndex && 'bg-primary animate-pulse',
            idx > currentIndex && 'bg-muted',
          )}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4.2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/src/components/progress-shelf/stage-bar.tsx
git commit -m "frontend: add StageBar pure component for progress shelf"
```

---

## Task 5 — Frontend: bootstrap Vitest (hook tests only)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`

- [ ] **Step 5.1: Install Vitest + jsdom**

Run:
```bash
cd frontend
npm install --save-dev vitest@^1.6.0 jsdom@^24.0.0 @vitest/ui@^1.6.0
```

- [ ] **Step 5.2: Add `test` script**

In `frontend/package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5.3: Create `frontend/vitest.config.ts`**

```typescript
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 5.4: Create `frontend/src/test/setup.ts`**

```typescript
// Reset localStorage between tests so atomWithStorage starts clean.
import { afterEach, beforeEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})
```

- [ ] **Step 5.5: Sanity-run Vitest with no tests yet**

Run: `cd frontend && npm test`
Expected: exit 0 with "No test files found" (Vitest treats this as success in `run` mode when zero matches; if it fails, add `--passWithNoTests` to the script).

If it fails with "No test files", change the script to: `"test": "vitest run --passWithNoTests"` and re-run.

- [ ] **Step 5.6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test/setup.ts
git commit -m "frontend: bootstrap Vitest with jsdom for hook tests"
```

---

## Task 6 — Frontend: `useActiveJobsPolling` hook

**Files:**
- Create: `frontend/src/hooks/use-active-jobs.ts`
- Create: `frontend/src/hooks/__tests__/use-active-jobs.test.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `frontend/src/hooks/__tests__/use-active-jobs.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useActiveJobs } from '../use-active-jobs'

const mockJobsGet = vi.fn()
const mockListActive = vi.fn()
const mockComicGet = vi.fn()

vi.mock('@/apis/jobs', () => ({
  default: {
    get: (id: string) => mockJobsGet(id),
    listActive: () => mockListActive(),
  },
  JobsApi: {
    get: (id: string) => mockJobsGet(id),
    listActive: () => mockListActive(),
  },
}))

vi.mock('@/apis/comics', () => ({
  ComicsApi: {
    get: (id: number) => mockComicGet(id),
  },
}))

describe('useActiveJobs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockJobsGet.mockReset()
    mockListActive.mockReset()
    mockComicGet.mockReset()
    mockListActive.mockResolvedValue({ active: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not poll when atom is empty', () => {
    renderHook(() => useActiveJobs())
    vi.advanceTimersByTime(5000)
    expect(mockJobsGet).not.toHaveBeenCalled()
  })

  it('polls every 2s when visible after a job is appended', async () => {
    mockJobsGet.mockResolvedValue({ id: 'j1', rq_status: 'started' })

    const { result } = renderHook(() => useActiveJobs())
    act(() => {
      result.current.appendJob({
        job_id: 'j1', comic_id: 1, stage: 'render',
        status: 'in_progress', title: 'Test', started_at: null,
      })
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockJobsGet).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockJobsGet).toHaveBeenCalledTimes(2)
  })

  it('removes finished jobs after 5s', async () => {
    mockJobsGet.mockResolvedValue({ id: 'j1', rq_status: 'finished' })

    const { result } = renderHook(() => useActiveJobs())
    act(() => {
      result.current.appendJob({
        job_id: 'j1', comic_id: 1, stage: 'render',
        status: 'in_progress', title: 'T', started_at: null,
      })
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(result.current.jobs['j1']?.status).toBe('finished')

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.current.jobs['j1']).toBeUndefined()
  })

  it('uses exponential backoff on failures and resets on recovery', async () => {
    mockJobsGet.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useActiveJobs())
    act(() => {
      result.current.appendJob({
        job_id: 'j1', comic_id: 1, stage: 'render',
        status: 'in_progress', title: 'T', started_at: null,
      })
    })

    // tick 1 at 2s → fails (1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockJobsGet).toHaveBeenCalledTimes(1)

    // backoff to 4s → tick 2 at 6s → fails (2)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(mockJobsGet).toHaveBeenCalledTimes(2)

    // backoff to 8s → tick 3 at 14s → fails (3, sets reconnecting)
    await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
    expect(mockJobsGet).toHaveBeenCalledTimes(3)
    expect(result.current.reconnecting).toBe(true)

    // recovery → resets to 2s cadence
    mockJobsGet.mockResolvedValue({ id: 'j1', rq_status: 'started' })
    await act(async () => { await vi.advanceTimersByTimeAsync(16000) })
    expect(mockJobsGet).toHaveBeenCalledTimes(4)
    expect(result.current.reconnecting).toBe(false)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockJobsGet).toHaveBeenCalledTimes(5)
  })
})
```

Install React Testing Library: `cd frontend && npm install --save-dev @testing-library/react@^16.0.0 @testing-library/dom@^10.0.0`.

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL with "Cannot find module '../use-active-jobs'".

- [ ] **Step 6.3: Implement the hook**

Create `frontend/src/hooks/use-active-jobs.ts`:

```typescript
import { useAtom, useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'

import JobsApi from '@/apis/jobs'
import {
  type ActiveJobEntry,
  activeJobsAtom,
  appendActiveJobAtom,
  removeActiveJobAtom,
} from '@/atoms'

const VISIBLE_CADENCE_MS = 2000
const HIDDEN_CADENCE_MS = 10000
const TERMINAL_REMOVAL_MS = 5000
const BACKOFF_SEQUENCE_MS = [2000, 4000, 8000, 16000, 32000, 60000]
const RECONNECTING_THRESHOLD = 3

const TERMINAL_STATES = new Set(['finished', 'failed'])

export function useActiveJobs() {
  const [jobs] = useAtom(activeJobsAtom)
  const appendJob = useSetAtom(appendActiveJobAtom)
  const removeJob = useSetAtom(removeActiveJobAtom)
  const [reconnecting, setReconnecting] = useState(false)

  const failureCountRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibleRef = useRef<boolean>(typeof document === 'undefined' ? true : !document.hidden)
  // Stable snapshot of the latest atom for the timer closure.
  const jobsRef = useRef(jobs)
  useEffect(() => { jobsRef.current = jobs }, [jobs])

  // Hydrate from server on mount, then merge into local state.
  useEffect(() => {
    let cancelled = false
    JobsApi.listActive()
      .then((res) => {
        if (cancelled) return
        for (const entry of res.active ?? []) {
          appendJob({ ...entry })
        }
      })
      .catch(() => { /* swallow — poll loop will retry */ })
    return () => { cancelled = true }
  }, [appendJob])

  const tick = useCallback(async () => {
    const current = jobsRef.current
    const ids = Object.keys(current)
    if (ids.length === 0) {
      schedule(VISIBLE_CADENCE_MS)
      return
    }

    try {
      const results = await Promise.all(ids.map((id) => JobsApi.get(id)))
      results.forEach((res, i) => {
        const id = ids[i]
        const entry = current[id]
        if (!entry) return
        const nextStatus = (res?.rq_status ?? entry.status) as ActiveJobEntry['status']
        if (nextStatus !== entry.status) {
          appendJob({ ...entry, status: nextStatus })
        }
        if (TERMINAL_STATES.has(nextStatus)) {
          setTimeout(() => removeJob(id), TERMINAL_REMOVAL_MS)
        }
      })
      failureCountRef.current = 0
      setReconnecting(false)
      schedule(visibleRef.current ? VISIBLE_CADENCE_MS : HIDDEN_CADENCE_MS)
    } catch {
      failureCountRef.current += 1
      if (failureCountRef.current >= RECONNECTING_THRESHOLD) setReconnecting(true)
      const idx = Math.min(failureCountRef.current, BACKOFF_SEQUENCE_MS.length - 1)
      schedule(BACKOFF_SEQUENCE_MS[idx])
    }
  }, [appendJob, removeJob])

  const tickRef = useRef(tick)
  useEffect(() => { tickRef.current = tick }, [tick])

  const schedule = (delayMs: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => tickRef.current(), delayMs)
  }

  // Boot the loop once.
  useEffect(() => {
    schedule(VISIBLE_CADENCE_MS)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Visibility-aware cadence flip.
  useEffect(() => {
    const onVisibility = () => {
      visibleRef.current = !document.hidden
      // Re-schedule next tick at the new cadence.
      schedule(visibleRef.current ? VISIBLE_CADENCE_MS : HIDDEN_CADENCE_MS)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { jobs, appendJob, removeJob, reconnecting }
}

export type { ActiveJobEntry }
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all 4 tests PASS.

If the backoff test fails with off-by-one timing, double-check that the first `setTimeout(2000)` from the boot effect runs before `appendJob`; if not, add a manual `act` flush after `renderHook` and before `appendJob`.

- [ ] **Step 6.5: Commit**

```bash
git add frontend/src/hooks/use-active-jobs.ts \
        frontend/src/hooks/__tests__/use-active-jobs.test.ts \
        frontend/package.json frontend/package-lock.json
git commit -m "frontend: add useActiveJobs polling hook with backoff and tests"
```

---

## Task 7 — Frontend: `<ProgressRow>` and `<ProgressShelf>`

**Files:**
- Create: `frontend/src/components/progress-shelf/progress-row.tsx`
- Create: `frontend/src/components/progress-shelf/index.tsx`

- [ ] **Step 7.1: Create `progress-row.tsx`**

```typescript
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Card } from '@/components/ui/card'
import type { ActiveJobEntry } from '@/atoms'

import { inferFlow, StageBar } from './stage-bar'

interface ProgressRowProps {
  entry: ActiveJobEntry
  reconnecting?: boolean
}

const STAGE_TO_TAB: Record<string, string> = {
  outline: 'story',
  shots: 'panels',
  render: 'image-generation',
  cover: 'image-generation',
  export: 'image-generation',
  publish: 'image-generation',
}

export function ProgressRow({ entry, reconnecting = false }: ProgressRowProps) {
  const navigate = useNavigate()
  const flow = inferFlow(entry.stage)
  const tab = STAGE_TO_TAB[entry.stage] ?? 'story'

  const onClick = () => {
    if (entry.comic_id == null) {
      navigate('/me')
      return
    }
    navigate(`/comics?comic_id=${entry.comic_id}&tab=${tab}`)
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className="flex cursor-pointer flex-col gap-2 p-3 hover:bg-accent"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{entry.title || `Job ${entry.job_id.slice(0, 8)}`}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          {entry.stage}
        </span>
      </div>
      <StageBar stages={flow} current={entry.stage} />
      {reconnecting && (
        <span className="text-xs text-muted-foreground">reconnecting…</span>
      )}
    </Card>
  )
}
```

- [ ] **Step 7.2: Create `index.tsx`**

```typescript
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { ProgressRow } from './progress-row'
import { useActiveJobs } from '@/hooks/use-active-jobs'

export function ProgressShelf() {
  const { jobs, reconnecting } = useActiveJobs()
  const [expanded, setExpanded] = useState(false)

  const entries = Object.values(jobs)
  if (entries.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <Button
        variant="secondary"
        className="flex w-full items-center justify-between rounded-xl shadow-lg"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="text-sm">{entries.length} job{entries.length === 1 ? '' : 's'} running</span>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </Button>
      {expanded && (
        <div className="mt-2 max-h-96 space-y-2 overflow-y-auto rounded-xl bg-background p-2 shadow-lg ring-1 ring-border">
          {entries.map((entry) => (
            <ProgressRow key={entry.job_id} entry={entry} reconnecting={reconnecting} />
          ))}
        </div>
      )}
    </div>
  )
}

export default ProgressShelf
```

- [ ] **Step 7.3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7.4: Commit**

```bash
git add frontend/src/components/progress-shelf/
git commit -m "frontend: add ProgressShelf and ProgressRow components"
```

---

## Task 8 — Frontend: mount shelf + dispatch hooks at all job-creating sites

**Files:**
- Modify: `frontend/src/pages/dashboard-layout.tsx`
- Modify: `frontend/src/apis/comics.ts`
- Modify: `frontend/src/apis/panels.ts`
- Modify: `frontend/src/apis/jobs.ts`

Append-on-dispatch is wrapped at the API layer so every callsite picks it up automatically.

- [ ] **Step 8.1: Mount the shelf in dashboard layout**

In `frontend/src/pages/dashboard-layout.tsx`, add the import:

```typescript
import { ProgressShelf } from '@/components/progress-shelf'
```

And add `<ProgressShelf />` as the last child inside the outermost `<div className="flex h-screen bg-background">` (after the closing `</div>` of the right-side panel, before the closing root `</div>`).

- [ ] **Step 8.2: Add `appendActiveJob` helper in atoms re-exporter**

Easiest path: read/write atoms can't be used outside React. Instead, expose a Jotai store import. In `frontend/src/main.tsx` (or wherever `createStore` is called — verify with `grep -rn createStore frontend/src`), export the store:

If a store is not yet created, create one:

In `frontend/src/atoms.ts`, append:

```typescript
import { createStore } from 'jotai'

// Singleton store for non-component append/remove operations
export const jobsStore = createStore()

export function appendActiveJob(entry: ActiveJobEntry) {
  jobsStore.set(appendActiveJobAtom, entry)
}
```

In `frontend/src/main.tsx`, wrap the app in the Jotai `Provider` using `jobsStore`:

```typescript
import { Provider } from 'jotai'
import { jobsStore } from '@/atoms'

// ... inside the render tree:
<Provider store={jobsStore}>
  <App />
</Provider>
```

If a `Provider` already exists, just pass `store={jobsStore}`.

- [ ] **Step 8.3: Wrap dispatch in `comics.ts`**

In `frontend/src/apis/comics.ts`, add at top:

```typescript
import { appendActiveJob } from '@/atoms'
```

Replace `publish` and `startImages` with versions that append on success:

```typescript
publish(comicId: number, body: { make_public: boolean }) {
  return request<typeof body, PublishComicResponse>({
    url: `/api/comics/${comicId}/publish`,
    method: 'POST',
    data: body,
  }).then((res) => {
    const ids = res?.stage_jobs ?? {}
    Object.entries(ids).forEach(([key, jobId]) => {
      if (!jobId) return
      const stage = key.replace(/_job_id$/, '')
      appendActiveJob({
        job_id: jobId, comic_id: comicId, stage,
        status: 'queued', title: `Comic ${comicId}`, started_at: null,
      })
    })
    return res
  })
},

startImages(comicId: number, body?: Record<string, any>) {
  return request<Record<string, any> | undefined, any>({
    url: `/api/comics/${comicId}/images`,
    method: 'POST',
    data: body ?? {},
    timeout: 60000,
  }).then((res) => {
    if (res?.job_id) {
      appendActiveJob({
        job_id: res.job_id, comic_id: comicId, stage: 'render',
        status: 'queued', title: `Comic ${comicId}`, started_at: null,
      })
    }
    return res
  })
},
```

- [ ] **Step 8.4: Wrap dispatch in `panels.ts`**

In `frontend/src/apis/panels.ts`, add the import and wrap `renderPage`:

```typescript
import { appendActiveJob } from '@/atoms'

// ... inside PanelsApi:
renderPage(comicId: number, pageNumber: number, options?: { /* … */ }) {
  return request<object, { job_id: string }>({
    url: `/api/panels/${comicId}/pages/${pageNumber}/render`,
    method: 'POST',
    data: options || {},
  }).then((res) => {
    if (res?.job_id) {
      appendActiveJob({
        job_id: res.job_id, comic_id: comicId, stage: 'render',
        status: 'queued', title: `Comic ${comicId} p.${pageNumber}`, started_at: null,
      })
    }
    return res
  })
},
```

- [ ] **Step 8.5: Wrap dispatch in `jobs.ts`**

In `frontend/src/apis/jobs.ts`, add the import and wrap `createComic`:

```typescript
import { appendActiveJob } from '@/atoms'

// ... inside JobsApi:
createComic(body: CreateComicJobRequest) {
  return request<CreateComicJobRequest, CreateComicJobResponse>({
    url: '/api/jobs',
    method: 'POST',
    data: body,
    timeout: 60000,
  }).then((res) => {
    const stageIds = res?.stage_jobs ?? {}
    const comicId = res?.comic_id ?? null
    Object.entries(stageIds).forEach(([key, jobId]) => {
      if (!jobId) return
      const stage = key.replace(/_job_id$/, '')
      appendActiveJob({
        job_id: jobId, comic_id: comicId, stage,
        status: 'queued', title: comicId ? `Comic ${comicId}` : 'New comic',
        started_at: null,
      })
    })
    return res
  })
},
```

- [ ] **Step 8.6: Type-check + run frontend test suite**

Run:
```bash
cd frontend && npx tsc --noEmit && npm test
```
Expected: no type errors; all hook tests still pass.

- [ ] **Step 8.7: Build frontend and copy to static**

Per CLAUDE.md, frontend changes must rebuild static.

```bash
cd frontend && npm run build
cd .. && rm -rf mangasuperb/static/assets/* && cp -r frontend/dist/* mangasuperb/static/
```

- [ ] **Step 8.8: Commit (frontend source + built static)**

```bash
git add frontend/src/pages/dashboard-layout.tsx \
        frontend/src/apis/comics.ts \
        frontend/src/apis/panels.ts \
        frontend/src/apis/jobs.ts \
        frontend/src/atoms.ts \
        frontend/src/main.tsx \
        mangasuperb/static/
git commit -m "frontend: mount ProgressShelf and append jobs on dispatch"
```

---

## Task 9 — Manual smoke test

- [ ] **Step 9.1: Start backend, worker, and frontend dev**

In separate terminals:
```bash
source .venv/bin/activate && python app.py
source .venv/bin/activate && python worker.py
cd frontend && npm run dev
```

- [ ] **Step 9.2: Smoke scenarios — execute each and confirm result**

Run through each, ticking only after observed:

- [ ] Trigger a `comic_generation` from `/comics`. Shelf appears bottom-right within 2s with rows for outline + shots + render.
- [ ] Click a row → URL changes to `/comics?comic_id=…&tab=…`.
- [ ] Navigate to `/ideas`. Shelf still visible and updating.
- [ ] Hard-reload the page (Cmd-R). Shelf re-appears within 2s (hydration via `GET /api/jobs/active`).
- [ ] Stop `worker.py`. Within ~10s the shelf row stops advancing; `worker_snapshot.active === 0` is reflected (if you implemented the banner — Step 9.3 is optional).
- [ ] Restart `worker.py`. The job advances, completes, the row flashes "completed", and disappears 5s later.
- [ ] Force a failure (e.g., temporarily unset `GEMINI_API_KEY` and trigger a render). The row goes to `failed` and disappears 5s later.

- [ ] **Step 9.3 (optional follow-up, not on the critical path): worker-down banner**

If observed in Step 9.2 that worker-down silence is confusing, add a one-line check in `<ProgressShelf />`:

```typescript
// At the top of the expanded panel:
{Object.values(jobs).some((j) => /* worker_snapshot present and active=0 logic here */ false) && (
  <div className="rounded-md bg-amber-100 p-2 text-xs text-amber-900">
    No workers running — jobs may be delayed.
  </div>
)}
```

This requires plumbing `worker_snapshot.active` through the hook (the `/api/jobs/<id>` response already has it). Defer to roadmap item #2 if not strictly needed for this ship.

---

## Self-Review

**Spec coverage check:**

| Spec section | Tasks |
|---|---|
| `GET /api/jobs/active` endpoint | 1 |
| `listActiveJobs()` API client | 2 |
| `activeJobsAtom` + localStorage | 3 |
| `<StageBar>` pure component | 4 |
| `useActiveJobsPolling` (cadence, backoff, terminal) | 5 (bootstrap), 6 (impl + tests) |
| `<ProgressRow>` + `<ProgressShelf>` | 7 |
| Mount in dashboard layout | 8.1 |
| Dispatch-site appending | 8.2–8.5 |
| Backend tests (owner-scoped, orphan handling) | 1.2 |
| Frontend hook tests (4 scenarios) | 6.1 |
| Manual smoke (navigate-away, reload, worker-down, failure) | 9.2 |

**Items intentionally deferred (per spec "Out of scope"):**
- Cross-tab sync — not implemented.
- Web Push notifications — roadmap #2.
- Failure retry UX — roadmap #3.
- Worker-down banner — Step 9.3 is optional; full implementation belongs to roadmap #2.

**Type consistency:** `ActiveJobEntry` defined in `atoms.ts` re-exported from the hook; the API response type `ActiveJob` in `apis/jobs.ts` is structurally identical and assignable. `appendActiveJob` is the *function* exported from `atoms.ts`; `appendActiveJobAtom` is the *atom*. Tasks consistently reference `appendActiveJob` from non-React contexts (API wrappers) and `appendActiveJobAtom` from React via `useSetAtom` inside the hook.
