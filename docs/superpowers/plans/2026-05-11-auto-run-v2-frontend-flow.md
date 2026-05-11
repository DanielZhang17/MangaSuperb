# Auto Run V2 Frontend Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build backend-persisted one-click Auto manga runs, Auto-mode running/preview UX, and a draggable edge-snapping progress shelf.

**Architecture:** Add `ComicAutoRun` as the durable source of truth for Auto Mode V2. Backend routes create and control Auto runs; a focused service snapshots story/preferences, prepares characters, creates/updates the comic, runs outline and shot generation, starts an all-pages render run, and syncs Auto run completion from render-run lifecycle. Frontend Auto Mode becomes a state router over draft, running, review, and completed surfaces; the progress shelf consumes normalized active jobs including Auto runs and renders a draggable circular orb plus expandable panel.

**Tech Stack:** Flask, Flask-SQLAlchemy, Redis RQ-compatible queue interface, pytest, React 19, Vite, Jotai, Vitest, Testing Library, Tailwind CSS, lucide-react.

---

## Worktree And Execution Notes

- Implementation worktree: `/Users/daniel/code/dev/.worktrees/auto-run-v2`
- Branch: `codex/auto-run-v2`
- Main repo remains at `/Users/daniel/code/dev`
- Use `.venv` from the main checkout when needed: `/Users/daniel/code/dev/.venv/bin/pytest`
- The worktree does not include ignored `frontend/node_modules`; create a temporary ignored symlink for frontend verification:

```bash
ln -s /Users/daniel/code/dev/frontend/node_modules frontend/node_modules
```

Remove that symlink before final status checks if it appears as an untracked item:

```bash
unlink frontend/node_modules
```

## Parallelization Map

Use these write scopes to avoid agent conflicts:

- **Backend worker A:** `models.py`, `migrations/*`, `tests/test_auto_runs.py`
- **Backend worker B:** `mangasuperb/services/auto_runs.py`, `mangasuperb/routes/auto.py`, backend route tests
- **Backend worker C:** `mangasuperb/services/jobs.py`, `mangasuperb/routes/jobs.py`, render/active-job tests
- **Frontend worker A:** `frontend/src/apis/auto.ts`, `frontend/src/service/types.ts`, `frontend/src/hooks/use-auto-run.ts`, hook tests
- **Frontend worker B:** `frontend/src/pages/comics/auto/*`, `frontend/src/pages/comics/index.tsx`, Auto page tests
- **Frontend worker C:** `frontend/src/components/progress-shelf/*`, shelf tests
- **I18n/QA worker:** `frontend/src/i18n/index.ts`, browser QA checklist, final build/static sync

Do Task 1 first. After Task 1, Tasks 2 and 3 can proceed in parallel if workers coordinate on the `ComicAutoRun.to_dict()` shape. Tasks 4, 5, and 6 can proceed after the frontend type contract in Task 4 Step 3 exists. Task 7 should run after the UI components and backend contract are merged.

---

## File Structure

### Backend

- Modify `models.py`
  - Add `ComicAutoRun` model with JSON helpers and `to_dict()`.
  - Add relationship from `Comic` to auto runs via backref.
- Create `migrations/2026-05-11-create-comic-auto-runs.sql`
  - Production migration for the new table and indexes.
- Create `mangasuperb/services/auto_runs.py`
  - Own Auto run creation, serialization, conflict-state transitions, abort, and worker processing.
  - Keep route handlers thin.
- Modify `mangasuperb/routes/auto.py`
  - Keep existing `/characters/prepare`.
  - Add `/runs` endpoints.
- Modify `mangasuperb/services/jobs.py`
  - Add a sync hook when a linked render run completes, fails, or aborts.
- Modify `mangasuperb/routes/jobs.py`
  - Include active Auto runs in `/api/jobs/active`.
  - Include `auto_run` details in `/api/jobs/<job_id>` when the job id is an Auto run worker or synthetic `auto-run-<id>`.
- Tests:
  - Create `tests/test_auto_runs.py`.
  - Extend `tests/test_job_routes.py` or `tests/test_render_runs.py` only for active-job integration.

### Frontend

- Modify `frontend/src/service/types.ts`
  - Add `AutoRun`, `AutoRunStatus`, `AutoRunStage`, API payload/response types.
  - Add optional `auto_run_id`, `auto_run`, and `kind: 'auto_run'` active-job fields.
- Modify `frontend/src/apis/auto.ts`
  - Add run endpoints.
- Create `frontend/src/hooks/use-auto-run.ts`
  - Hydrate active run by comic id, poll run detail, start/abort/resolve/retry helpers.
- Modify `frontend/src/hooks/use-active-jobs.ts`
  - Normalize active Auto run jobs and enrich details.
- Modify `frontend/src/pages/comics/atoms.ts`
  - Add selected Auto run atom if needed.
- Replace `frontend/src/pages/comics/auto/auto-mode-tab.tsx`
  - Turn it into a state router.
- Create:
  - `frontend/src/pages/comics/auto/auto-draft.tsx`
  - `frontend/src/pages/comics/auto/auto-run-progress.tsx`
  - `frontend/src/pages/comics/auto/auto-run-review.tsx`
  - `frontend/src/pages/comics/auto/auto-preview.tsx`
  - `frontend/src/pages/comics/auto/auto-run-stage-list.tsx`
- Modify `frontend/src/pages/comics/index.tsx`
  - Add Pro snapshot banner when active Auto run exists.
- Modify `frontend/src/components/progress-shelf/index.tsx`
  - Compose shelf orb and panel.
- Create:
  - `frontend/src/components/progress-shelf/shelf-orb.tsx`
  - `frontend/src/components/progress-shelf/use-shelf-position.ts`
  - `frontend/src/components/progress-shelf/shelf-panel.tsx`
- Modify `frontend/src/i18n/index.ts`
  - Add strings for Simplified Chinese, Traditional Chinese, and English.

---

## Task 1: Backend Auto Run Model And Migration

**Files:**
- Modify: `models.py`
- Create: `migrations/2026-05-11-create-comic-auto-runs.sql`
- Create: `tests/test_auto_runs.py`

- [ ] **Step 1: Write failing model serialization tests**

Create `tests/test_auto_runs.py` with these initial tests:

```python
"""Auto run model and API tests."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from mangasuperb.extensions import db
from models import Comic, ComicAutoRun, Script


def create_comic(user_id: int, title: str = "Auto Draft") -> Comic:
    script = Script(
        user_id=user_id,
        title=title,
        content=json.dumps({
            "story": "A pilot finds a hidden city.",
            "style_description": "Classic manga black and white linework.",
            "aspect_ratio": "16:9",
            "color_mode": "black-white",
        }),
    )
    comic = Comic(
        user_id=user_id,
        script=script,
        title=title,
        status="pending",
        style_description="Classic manga black and white linework.",
        aspect_ratio="16:9",
    )
    db.session.add_all([script, comic])
    db.session.flush()
    return comic


def test_auto_run_serializes_snapshots_and_progress(app: Any, user: Any) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        run = ComicAutoRun.create(
            comic_id=comic.id,
            user_id=user.id,
            story_snapshot="A pilot finds a hidden city.",
            title_snapshot="Auto Draft",
            preferences_snapshot={
                "image_provider": "gemini",
                "text_provider": "gemini",
                "style_description": "Classic manga black and white linework.",
            },
        )
        run.status = "running"
        run.current_stage = "characters"
        run.character_review = {"reused": [], "created": [], "conflicts": [], "failed": []}
        run.selected_character_ids = [11, 12]
        run.started_at = datetime(2026, 5, 11, 10, 0, 0)
        db.session.add(run)
        db.session.commit()

        payload = run.to_dict()

    assert payload["id"] == run.id
    assert payload["comic_id"] == comic.id
    assert payload["user_id"] == user.id
    assert payload["status"] == "running"
    assert payload["current_stage"] == "characters"
    assert payload["story_snapshot"] == "A pilot finds a hidden city."
    assert payload["title_snapshot"] == "Auto Draft"
    assert payload["preferences_snapshot"]["image_provider"] == "gemini"
    assert payload["character_review"]["conflicts"] == []
    assert payload["selected_character_ids"] == [11, 12]
    assert payload["render_progress"] is None
    assert payload["abort_requested"] is False
    assert payload["started_at"].startswith("2026-05-11T10:00:00")


def test_auto_run_json_helpers_tolerate_invalid_json(app: Any, user: Any) -> None:
    with app.app_context():
        comic = create_comic(user.id)
        run = ComicAutoRun(
            comic_id=comic.id,
            user_id=user.id,
            status="queued",
            current_stage="story",
            story_snapshot="Story",
            title_snapshot="Title",
            preferences_snapshot_json="{bad json",
            character_review_json="{bad json",
            selected_character_ids_json="{bad json",
        )
        db.session.add(run)
        db.session.commit()

        payload = run.to_dict()

    assert payload["preferences_snapshot"] == {}
    assert payload["character_review"] is None
    assert payload["selected_character_ids"] == []
```

- [ ] **Step 2: Run the model tests and confirm they fail**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py -q
```

Expected: FAIL with `ImportError` or `AttributeError` because `ComicAutoRun` does not exist.

- [ ] **Step 3: Add `ComicAutoRun` model**

In `models.py`, add the class after `ComicRenderRun` so render-related models stay grouped:

```python
class ComicAutoRun(db.Model):
    """Durable state for one-click Auto Mode generation."""

    __tablename__ = "comic_auto_runs"

    ACTIVE_STATUSES = {"queued", "running", "needs_review"}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(db.Integer, db.ForeignKey("comics.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    status = db.Column(db.String(32), nullable=False, default="queued", index=True)
    current_stage = db.Column(db.String(32), nullable=False, default="story", index=True)
    story_snapshot = db.Column(db.Text, nullable=False)
    title_snapshot = db.Column(db.String(255), nullable=False)
    preferences_snapshot_json = db.Column(db.Text, nullable=False, default="{}")
    character_review_json = db.Column(db.Text, nullable=True)
    selected_character_ids_json = db.Column(db.Text, nullable=False, default="[]")
    render_run_id = db.Column(db.Integer, db.ForeignKey("comic_render_runs.id"), nullable=True, index=True)
    abort_requested = db.Column(db.Boolean, nullable=False, default=False)
    job_id = db.Column(db.String(128), nullable=True, index=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    comic = db.relationship("Comic", backref=db.backref("auto_runs", lazy=True))
    render_run = db.relationship("ComicRenderRun", backref=db.backref("auto_runs", lazy=True))

    @staticmethod
    def _loads_json(raw, fallback):
        if raw is None:
            return fallback
        try:
            return json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return fallback

    @classmethod
    def create(
        cls,
        *,
        comic_id: int,
        user_id: int,
        story_snapshot: str,
        title_snapshot: str,
        preferences_snapshot: dict | None = None,
    ) -> "ComicAutoRun":
        return cls(
            comic_id=comic_id,
            user_id=user_id,
            status="queued",
            current_stage="story",
            story_snapshot=story_snapshot,
            title_snapshot=title_snapshot,
            preferences_snapshot_json=json.dumps(preferences_snapshot or {}, ensure_ascii=False),
            selected_character_ids_json="[]",
        )

    @property
    def preferences_snapshot(self) -> dict:
        value = self._loads_json(self.preferences_snapshot_json, {})
        return value if isinstance(value, dict) else {}

    @preferences_snapshot.setter
    def preferences_snapshot(self, value: dict | None) -> None:
        self.preferences_snapshot_json = json.dumps(value or {}, ensure_ascii=False)

    @property
    def character_review(self) -> dict | None:
        value = self._loads_json(self.character_review_json, None)
        return value if isinstance(value, dict) else None

    @character_review.setter
    def character_review(self, value: dict | None) -> None:
        self.character_review_json = (
            json.dumps(value, ensure_ascii=False) if value is not None else None
        )

    @property
    def selected_character_ids(self) -> list[int]:
        value = self._loads_json(self.selected_character_ids_json, [])
        if not isinstance(value, list):
            return []
        return [int(item) for item in value if isinstance(item, int) or str(item).isdigit()]

    @selected_character_ids.setter
    def selected_character_ids(self, value: list[int] | None) -> None:
        self.selected_character_ids_json = json.dumps(value or [], ensure_ascii=False)

    @property
    def render_progress(self) -> dict | None:
        if not self.render_run:
            return None
        requested = self.render_run.requested_pages
        completed = self.render_run.completed_pages
        failed = self.render_run.failed_pages
        return {
            "completed": len(completed),
            "failed": len(failed),
            "total": len(requested),
            "current_page_number": self.render_run.current_page_number,
        }

    def to_dict(self):
        return {
            "id": self.id,
            "comic_id": self.comic_id,
            "user_id": self.user_id,
            "status": self.status,
            "current_stage": self.current_stage,
            "story_snapshot": self.story_snapshot,
            "title_snapshot": self.title_snapshot,
            "preferences_snapshot": self.preferences_snapshot,
            "character_review": self.character_review,
            "selected_character_ids": self.selected_character_ids,
            "render_run_id": self.render_run_id,
            "render_run": self.render_run.to_dict() if self.render_run else None,
            "render_progress": self.render_progress,
            "abort_requested": self.abort_requested,
            "job_id": self.job_id,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
```

Confirm `json` and `datetime` are already imported at the top of `models.py`; add them only if missing.

- [ ] **Step 4: Add production SQL migration**

Create `migrations/2026-05-11-create-comic-auto-runs.sql`:

```sql
CREATE TABLE IF NOT EXISTS comic_auto_runs (
    id SERIAL PRIMARY KEY,
    comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    current_stage VARCHAR(32) NOT NULL DEFAULT 'story',
    story_snapshot TEXT NOT NULL,
    title_snapshot VARCHAR(255) NOT NULL,
    preferences_snapshot_json TEXT NOT NULL DEFAULT '{}',
    character_review_json TEXT,
    selected_character_ids_json TEXT NOT NULL DEFAULT '[]',
    render_run_id INTEGER REFERENCES comic_render_runs(id) ON DELETE SET NULL,
    abort_requested BOOLEAN NOT NULL DEFAULT FALSE,
    job_id VARCHAR(128),
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITHOUT TIME ZONE,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_comic_auto_runs_comic_id ON comic_auto_runs(comic_id);
CREATE INDEX IF NOT EXISTS ix_comic_auto_runs_user_id ON comic_auto_runs(user_id);
CREATE INDEX IF NOT EXISTS ix_comic_auto_runs_status ON comic_auto_runs(status);
CREATE INDEX IF NOT EXISTS ix_comic_auto_runs_current_stage ON comic_auto_runs(current_stage);
CREATE INDEX IF NOT EXISTS ix_comic_auto_runs_render_run_id ON comic_auto_runs(render_run_id);
CREATE INDEX IF NOT EXISTS ix_comic_auto_runs_job_id ON comic_auto_runs(job_id);
CREATE INDEX IF NOT EXISTS ix_comic_auto_runs_user_active
    ON comic_auto_runs(user_id, comic_id, status)
    WHERE status IN ('queued', 'running', 'needs_review');
```

- [ ] **Step 5: Run model tests**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py -q
```

Expected: PASS for the two model tests.

- [ ] **Step 6: Commit model and migration**

```bash
git add models.py migrations/2026-05-11-create-comic-auto-runs.sql tests/test_auto_runs.py
git commit -m "feat: add auto run model"
```

---

## Task 2: Backend Auto Run Service And Worker

**Files:**
- Create/modify: `mangasuperb/services/auto_runs.py`
- Modify: `mangasuperb/services/jobs.py`
- Modify: `tests/test_auto_runs.py`

- [ ] **Step 1: Add failing service tests for start and duplicate active runs**

Append to `tests/test_auto_runs.py`:

```python
from types import SimpleNamespace

import pytest

from mangasuperb.services.auto_runs import (
    AutoRunConflict,
    create_auto_run,
    get_active_auto_run,
)


def test_create_auto_run_creates_comic_and_snapshots_preferences(app: Any, user: Any) -> None:
    with app.app_context():
        run = create_auto_run(
            user_id=user.id,
            title="Snapshot Book",
            story="A pilot finds a hidden city.",
            preferences={
                "style_description": "Ink manga",
                "aspect_ratio": "3:4",
                "color_mode": "color",
                "image_provider": "gemini",
                "text_provider": "gemini",
            },
        )
        db.session.commit()
        db.session.refresh(run)

        comic = db.session.get(Comic, run.comic_id)

    assert comic is not None
    assert comic.title == "Snapshot Book"
    assert comic.style_description == "Ink manga"
    assert comic.aspect_ratio == "3:4"
    assert run.status == "queued"
    assert run.current_stage == "story"
    assert run.story_snapshot == "A pilot finds a hidden city."
    assert run.preferences_snapshot["color_mode"] == "color"


def test_create_auto_run_rejects_duplicate_active_run(app: Any, user: Any) -> None:
    with app.app_context():
        first = create_auto_run(
            user_id=user.id,
            title="Book",
            story="A pilot finds a hidden city.",
            preferences={"style_description": "Ink manga", "aspect_ratio": "16:9"},
        )
        db.session.commit()

        with pytest.raises(AutoRunConflict) as exc:
            create_auto_run(
                user_id=user.id,
                title="Book",
                story="A changed draft.",
                preferences={"style_description": "Ink manga", "aspect_ratio": "16:9"},
                comic_id=first.comic_id,
            )

    assert exc.value.active_run.id == first.id


def test_get_active_auto_run_filters_terminal_runs(app: Any, user: Any) -> None:
    with app.app_context():
        run = create_auto_run(
            user_id=user.id,
            title="Book",
            story="A pilot finds a hidden city.",
            preferences={"style_description": "Ink manga", "aspect_ratio": "16:9"},
        )
        db.session.commit()
        assert get_active_auto_run(user.id, run.comic_id).id == run.id

        run.status = "completed"
        db.session.commit()

        assert get_active_auto_run(user.id, run.comic_id) is None
```

- [ ] **Step 2: Run service tests and confirm they fail**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py -q
```

Expected: FAIL because `mangasuperb.services.auto_runs` does not exist.

- [ ] **Step 3: Create service shell**

Create `mangasuperb/services/auto_runs.py`:

```python
"""Durable Auto Mode run orchestration."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from flask import current_app

from mangasuperb.extensions import db
from mangasuperb.routes._character_utils import apply_character_assignments
from mangasuperb.services.auto_prep import extract_cast_candidates, prepare_characters_from_candidates
from mangasuperb.services.generation import DEFAULT_COMIC_STYLE, validate_aspect_ratio
from mangasuperb.services.jobs import (
    _application_context,
    bootstrap_comic_workflow,
    enqueue_render_run,
    process_outline_stage,
    process_shot_stage,
)
from models import Comic, ComicAutoRun, ComicCharacter, ComicRenderRun, Script


ACTIVE_AUTO_RUN_STATUSES = {"queued", "running", "needs_review"}
TERMINAL_AUTO_RUN_STATUSES = {"completed", "failed", "aborted"}
DEFAULT_ASPECT_RATIO = "16:9"


class AutoRunConflict(Exception):
    def __init__(self, active_run: ComicAutoRun) -> None:
        super().__init__("An active Auto run already exists for this comic")
        self.active_run = active_run


def get_active_auto_run(user_id: int, comic_id: int | None) -> ComicAutoRun | None:
    if not comic_id:
        return None
    return (
        ComicAutoRun.query.filter_by(user_id=user_id, comic_id=comic_id)
        .filter(ComicAutoRun.status.in_(ACTIVE_AUTO_RUN_STATUSES))
        .order_by(ComicAutoRun.created_at.desc())
        .first()
    )


def _resolve_preferences(raw_preferences: dict[str, Any] | None) -> dict[str, Any]:
    raw = dict(raw_preferences or {})
    style = str(raw.get("style_description") or raw.get("style") or DEFAULT_COMIC_STYLE).strip()
    aspect_ratio = validate_aspect_ratio(raw.get("aspect_ratio") or DEFAULT_ASPECT_RATIO)
    color_mode = str(raw.get("color_mode") or "black-white").replace("_", "-").strip().lower()
    if color_mode not in {"black-white", "color"}:
        color_mode = "black-white"
    return {
        "style_description": style or DEFAULT_COMIC_STYLE,
        "aspect_ratio": aspect_ratio,
        "color_mode": color_mode,
        "image_provider": raw.get("image_provider"),
        "text_provider": raw.get("text_provider"),
        "font_family": raw.get("font_family"),
        "font_size": raw.get("font_size"),
        "bubble_shape": raw.get("bubble_shape"),
        "bubble_tail": raw.get("bubble_tail"),
    }


def _build_script_payload(story: str, preferences: dict[str, Any]) -> dict[str, Any]:
    return {
        "story": story,
        "style_description": preferences["style_description"],
        "aspect_ratio": preferences["aspect_ratio"],
        "color_mode": preferences["color_mode"],
    }


def create_auto_run(
    *,
    user_id: int,
    title: str,
    story: str,
    preferences: dict[str, Any] | None = None,
    comic_id: int | None = None,
) -> ComicAutoRun:
    clean_title = title.strip()
    clean_story = story.strip()
    if not clean_title:
        raise ValueError("Title is required")
    if not clean_story:
        raise ValueError("Story is required")

    if comic_id:
        active = get_active_auto_run(user_id, comic_id)
        if active:
            raise AutoRunConflict(active)

    resolved = _resolve_preferences(preferences)

    comic = db.session.get(Comic, comic_id) if comic_id else None
    if comic and comic.user_id != user_id:
        raise ValueError("Comic not found")

    script_payload = _build_script_payload(clean_story, resolved)
    if comic:
        script = comic.script or Script(user_id=user_id, title=clean_title, content="")
        script.title = clean_title
        script.content = json.dumps(script_payload, ensure_ascii=False)
        comic.script = script
        comic.title = clean_title
        comic.style_description = resolved["style_description"]
        comic.aspect_ratio = resolved["aspect_ratio"]
        comic.status = "pending"
        comic.error_message = None
        db.session.add(script)
    else:
        script = Script(
            user_id=user_id,
            title=clean_title,
            content=json.dumps(script_payload, ensure_ascii=False),
        )
        comic = Comic(
            user_id=user_id,
            script=script,
            title=clean_title,
            status="pending",
            style_description=resolved["style_description"],
            aspect_ratio=resolved["aspect_ratio"],
        )
        db.session.add_all([script, comic])

    db.session.flush()
    bootstrap_comic_workflow(comic)
    run = ComicAutoRun.create(
        comic_id=comic.id,
        user_id=user_id,
        story_snapshot=clean_story,
        title_snapshot=clean_title,
        preferences_snapshot=resolved,
    )
    db.session.add(run)
    db.session.flush()
    return run
```

- [ ] **Step 4: Run service tests**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py -q
```

Expected: PASS for model/start/duplicate tests.

- [ ] **Step 5: Add failing worker tests for conflict and happy path**

Append:

```python
def test_process_auto_run_pauses_on_character_conflicts(app: Any, user: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    from mangasuperb.services import auto_runs

    with app.app_context():
        run = create_auto_run(
            user_id=user.id,
            title="Conflict Book",
            story="Nana meets Ana.",
            preferences={"style_description": "Ink manga", "aspect_ratio": "16:9"},
        )
        db.session.commit()
        run_id = run.id

    monkeypatch.setattr(auto_runs, "extract_cast_candidates", lambda *args, **kwargs: [])
    monkeypatch.setattr(auto_runs, "prepare_characters_from_candidates", lambda **kwargs: {
        "reused": [],
        "created": [],
        "conflicts": [{"candidate": {"name": "Nana"}, "role": "protagonist"}],
        "failed": [],
        "suggested_roles": {},
    })

    result = auto_runs.process_auto_run(run_id)

    with app.app_context():
        persisted = db.session.get(ComicAutoRun, run_id)

    assert result["status"] == "needs_review"
    assert persisted.status == "needs_review"
    assert persisted.current_stage == "characters"
    assert persisted.character_review["conflicts"][0]["candidate"]["name"] == "Nana"


def test_process_auto_run_enqueues_all_pages_render_run(app: Any, user: Any, dummy_queue: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    from mangasuperb.services import auto_runs

    with app.app_context():
        run = create_auto_run(
            user_id=user.id,
            title="Render Book",
            story="One.\n\nTwo.\n\nThree.\n\nFour.",
            preferences={
                "style_description": "Ink manga",
                "aspect_ratio": "16:9",
                "image_provider": "gemini",
                "text_provider": "gemini",
            },
        )
        db.session.commit()
        run_id = run.id

    monkeypatch.setattr(auto_runs, "extract_cast_candidates", lambda *args, **kwargs: [])
    monkeypatch.setattr(auto_runs, "prepare_characters_from_candidates", lambda **kwargs: {
        "reused": [],
        "created": [],
        "conflicts": [],
        "failed": [],
        "suggested_roles": {},
    })

    result = auto_runs.process_auto_run(run_id)

    with app.app_context():
        persisted = db.session.get(ComicAutoRun, run_id)

    assert result["status"] == "running"
    assert persisted.current_stage == "render"
    assert persisted.render_run_id is not None
    assert persisted.render_run.mode == "all_pages"
    assert persisted.render_run.requested_pages
    assert dummy_queue.jobs[-1].kwargs["render_run_id"] == persisted.render_run_id
```

- [ ] **Step 6: Implement `process_auto_run`**

Add to `mangasuperb/services/auto_runs.py`:

```python
def _mark_failed(run: ComicAutoRun, message: str) -> None:
    run.status = "failed"
    run.error_message = message
    run.completed_at = datetime.utcnow()
    db.session.flush()


def _accepted_character_assignments(review: dict[str, Any]) -> list[dict[str, Any]]:
    items = list(review.get("reused") or []) + list(review.get("created") or [])
    assignments: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        character = item.get("character") if isinstance(item, dict) else None
        character_id = character.get("id") if isinstance(character, dict) else None
        if not character_id:
            continue
        assignments.append({
            "id": int(character_id),
            "order_index": index,
            "role": item.get("role") or "supporting",
        })
    return assignments


def _replace_character_assignments(comic: Comic, assignments: list[dict[str, Any]]) -> None:
    ComicCharacter.query.filter_by(comic_id=comic.id).delete(synchronize_session=False)
    db.session.flush()
    if assignments:
        apply_character_assignments(comic, assignments)


def process_auto_run(auto_run_id: int) -> dict[str, Any]:
    with _application_context():
        run = db.session.get(ComicAutoRun, auto_run_id)
        if not run:
            raise ValueError(f"Auto run {auto_run_id} not found")
        if run.abort_requested:
            run.status = "aborted"
            run.completed_at = datetime.utcnow()
            db.session.commit()
            return {"status": "aborted", "auto_run_id": auto_run_id}

        run.status = "running"
        run.started_at = run.started_at or datetime.utcnow()
        run.current_stage = "characters"
        db.session.commit()

        try:
            preferences = run.preferences_snapshot
            candidates = extract_cast_candidates(
                run.story_snapshot,
                style_preference=preferences.get("style_description"),
            )
            review = prepare_characters_from_candidates(
                user_id=run.user_id,
                candidates=candidates,
                image_provider=preferences.get("image_provider"),
            )
            run.character_review = review
            if review.get("conflicts") or review.get("failed"):
                run.status = "needs_review"
                run.current_stage = "characters"
                db.session.commit()
                return {"status": "needs_review", "auto_run_id": auto_run_id}

            assignments = _accepted_character_assignments(review)
            run.selected_character_ids = [item["id"] for item in assignments]
            if run.comic:
                _replace_character_assignments(run.comic, assignments)

            run.current_stage = "panels"
            db.session.commit()

            outline_result = process_outline_stage(
                run.comic_id,
                text_provider=preferences.get("text_provider"),
            )
            if outline_result.get("status") == "failed":
                raise ValueError(outline_result.get("error") or "Outline generation failed")

            shot_result = process_shot_stage(
                run.comic_id,
                text_provider=preferences.get("text_provider"),
            )
            if shot_result.get("status") == "failed":
                raise ValueError(shot_result.get("error") or "Panel generation failed")

            queue = current_app.extensions.get("rq_queue")
            if not queue:
                raise RuntimeError("Background queue is not configured")

            db.session.refresh(run.comic)
            render_run = enqueue_render_run(
                queue,
                run.comic,
                mode="all_pages",
                user_id=run.user_id,
                image_provider=preferences.get("image_provider"),
                text_provider=preferences.get("text_provider"),
                color_mode=preferences.get("color_mode"),
                aspect_ratio=preferences.get("aspect_ratio"),
                font_family=preferences.get("font_family"),
                font_size=preferences.get("font_size"),
                bubble_shape=preferences.get("bubble_shape"),
                bubble_tail=preferences.get("bubble_tail"),
            )
            run.render_run_id = render_run.id
            run.status = "running"
            run.current_stage = "render"
            db.session.commit()
            return {"status": "running", "auto_run_id": auto_run_id, "render_run_id": render_run.id}
        except Exception as exc:
            db.session.rollback()
            run = db.session.get(ComicAutoRun, auto_run_id)
            if run:
                _mark_failed(run, str(exc))
            db.session.commit()
            return {"status": "failed", "auto_run_id": auto_run_id, "error": str(exc)}
```

Use `_application_context()` as the single app-context wrapper for this worker, matching the existing background job helpers. Keep `current_app` imported because the worker reads `current_app.extensions["rq_queue"]` while inside that context.

- [ ] **Step 7: Run worker tests**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py -q
```

Expected: PASS for Auto run model/service/worker tests.

- [ ] **Step 8: Add render-run sync tests**

Append:

```python
def test_sync_auto_run_from_completed_render_run(app: Any, user: Any) -> None:
    from mangasuperb.services.auto_runs import sync_auto_run_from_render_run
    from models import ComicRenderRun

    with app.app_context():
        run = create_auto_run(
            user_id=user.id,
            title="Book",
            story="Story",
            preferences={"style_description": "Ink manga", "aspect_ratio": "16:9"},
        )
        render_run = ComicRenderRun.create(
            comic_id=run.comic_id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        render_run.status = "completed"
        render_run.mark_completed_page(1)
        render_run.mark_completed_page(2)
        db.session.add(render_run)
        db.session.flush()
        run.render_run_id = render_run.id
        run.status = "running"
        run.current_stage = "render"
        db.session.commit()

        sync_auto_run_from_render_run(render_run)
        db.session.refresh(run)

    assert run.status == "completed"
    assert run.current_stage == "preview"
    assert run.completed_at is not None
```

- [ ] **Step 9: Implement render-run sync helper and call it**

Add to `mangasuperb/services/auto_runs.py`:

```python
def sync_auto_run_from_render_run(render_run: ComicRenderRun) -> None:
    auto_runs = ComicAutoRun.query.filter_by(render_run_id=render_run.id).all()
    now = datetime.utcnow()
    for run in auto_runs:
        if run.status not in ACTIVE_AUTO_RUN_STATUSES:
            continue
        if render_run.status == "completed":
            run.status = "completed"
            run.current_stage = "preview"
            run.completed_at = now
            run.error_message = None
        elif render_run.status == "failed":
            run.status = "failed"
            run.current_stage = "render"
            run.completed_at = now
            run.error_message = render_run.error_message
        elif render_run.status == "aborted":
            run.status = "aborted"
            run.current_stage = "render"
            run.abort_requested = True
            run.completed_at = now
```

In `mangasuperb/services/jobs.py`, import inside the function to avoid circular imports and call after setting `render_run.status` to `completed`, `failed`, or `aborted`:

```python
from mangasuperb.services.auto_runs import sync_auto_run_from_render_run
sync_auto_run_from_render_run(render_run)
```

Place the call before `db.session.commit()` in each terminal render-run branch.

- [ ] **Step 10: Run backend focused tests**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py tests/test_render_runs.py -q
```

Expected: PASS.

- [ ] **Step 11: Commit service worker**

```bash
git add mangasuperb/services/auto_runs.py mangasuperb/services/jobs.py tests/test_auto_runs.py
git commit -m "feat: add auto run orchestration"
```

---

## Task 3: Auto Run API Routes And Active Job Integration

**Files:**
- Modify: `mangasuperb/routes/auto.py`
- Modify: `mangasuperb/routes/jobs.py`
- Modify: `tests/test_auto_runs.py`
- Modify: `tests/test_job_routes.py`

- [ ] **Step 1: Add failing route tests**

Append to `tests/test_auto_runs.py`:

```python
def test_start_auto_run_route_enqueues_worker(app: Any, auth_client: Any, dummy_queue: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    response = auth_client.post("/api/auto/runs", json={
        "title": "Route Book",
        "story": "A pilot finds a hidden city.",
        "preferences": {
            "style_description": "Ink manga",
            "aspect_ratio": "16:9",
            "image_provider": "gemini",
            "text_provider": "gemini",
        },
    })

    assert response.status_code == 202
    payload = response.get_json()
    assert payload["auto_run"]["status"] == "queued"
    assert payload["comic"]["title"] == "Route Book"
    assert dummy_queue.jobs[-1].func.__name__ == "process_auto_run"


def test_start_auto_run_route_returns_active_run_conflict(app: Any, auth_client: Any) -> None:
    first = auth_client.post("/api/auto/runs", json={
        "title": "Route Book",
        "story": "A pilot finds a hidden city.",
        "preferences": {"style_description": "Ink manga", "aspect_ratio": "16:9"},
    }).get_json()["auto_run"]

    response = auth_client.post("/api/auto/runs", json={
        "comic_id": first["comic_id"],
        "title": "Route Book",
        "story": "Changed story.",
        "preferences": {"style_description": "Ink manga", "aspect_ratio": "16:9"},
    })

    assert response.status_code == 409
    assert response.get_json()["auto_run"]["id"] == first["id"]


def test_active_auto_run_route_returns_current_run(app: Any, auth_client: Any) -> None:
    started = auth_client.post("/api/auto/runs", json={
        "title": "Route Book",
        "story": "A pilot finds a hidden city.",
        "preferences": {"style_description": "Ink manga", "aspect_ratio": "16:9"},
    }).get_json()["auto_run"]

    response = auth_client.get(f"/api/auto/runs/active?comic_id={started['comic_id']}")

    assert response.status_code == 200
    assert response.get_json()["auto_run"]["id"] == started["id"]
```

- [ ] **Step 2: Add failing abort route test**

Append:

```python
def test_abort_auto_run_route_marks_run_and_render_run(app: Any, auth_client: Any, user: Any) -> None:
    from models import ComicRenderRun

    started = auth_client.post("/api/auto/runs", json={
        "title": "Route Book",
        "story": "A pilot finds a hidden city.",
        "preferences": {"style_description": "Ink manga", "aspect_ratio": "16:9"},
    }).get_json()["auto_run"]

    with app.app_context():
        run = db.session.get(ComicAutoRun, started["id"])
        render_run = ComicRenderRun.create(
            comic_id=run.comic_id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        render_run.status = "running"
        db.session.add(render_run)
        db.session.flush()
        run.render_run_id = render_run.id
        run.status = "running"
        run.current_stage = "render"
        db.session.commit()

    response = auth_client.post(f"/api/auto/runs/{started['id']}/abort")

    assert response.status_code == 200
    payload = response.get_json()["auto_run"]
    assert payload["status"] == "aborted"
    assert payload["abort_requested"] is True
```

- [ ] **Step 3: Implement Auto run routes**

In `mangasuperb/routes/auto.py`, import the service functions:

```python
from mangasuperb.extensions import db
from mangasuperb.services.auto_runs import (
    AutoRunConflict,
    abort_auto_run,
    create_auto_run,
    get_active_auto_run,
    process_auto_run,
)
from models import ComicAutoRun
```

Add routes below `prepare_characters`:

```python
@bp.post("/runs")
@login_required
def start_auto_run() -> Any:
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    if not isinstance(payload, Mapping):
        return jsonify({"error": "JSON body must be an object"}), 400

    title = payload.get("title")
    story = payload.get("story")
    preferences = payload.get("preferences") or {}
    comic_id = payload.get("comic_id")
    if comic_id is not None:
        try:
            comic_id = int(comic_id)
        except (TypeError, ValueError):
            return jsonify({"error": "comic_id must be an integer"}), 400

    try:
        run = create_auto_run(
            user_id=current_user.id,
            title=title if isinstance(title, str) else "",
            story=story if isinstance(story, str) else "",
            preferences=preferences if isinstance(preferences, Mapping) else {},
            comic_id=comic_id,
        )
        queue = current_app.extensions.get("rq_queue")
        if not queue:
            db.session.rollback()
            return jsonify({"error": "Background queue is not configured"}), 503
        db.session.flush()
        job = queue.enqueue(
            process_auto_run,
            run.id,
            job_timeout=current_app.config["RQ_JOB_TIMEOUT"],
            result_ttl=current_app.config["RQ_RESULT_TTL"],
            description=f"Auto run {run.id} for comic {run.comic_id}",
        )
        run.job_id = job.id
        db.session.commit()
        db.session.refresh(run)
        return jsonify({"auto_run": run.to_dict(), "comic": run.comic.to_dict()}), 202
    except AutoRunConflict as exc:
        db.session.rollback()
        return jsonify({"error": "Active Auto run already exists", "auto_run": exc.active_run.to_dict()}), 409
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to start Auto run")
        return jsonify({"error": "Failed to start Auto run"}), 500


@bp.get("/runs/active")
@login_required
def get_active_run() -> Any:
    comic_id = request.args.get("comic_id", type=int)
    run = get_active_auto_run(current_user.id, comic_id)
    return jsonify({"auto_run": run.to_dict() if run else None}), 200


@bp.get("/runs/<int:auto_run_id>")
@login_required
def get_auto_run(auto_run_id: int) -> Any:
    run = ComicAutoRun.query.filter_by(id=auto_run_id, user_id=current_user.id).first()
    if not run:
        return jsonify({"error": "Auto run not found"}), 404
    return jsonify({"auto_run": run.to_dict(), "comic": run.comic.to_dict() if run.comic else None}), 200


@bp.post("/runs/<int:auto_run_id>/abort")
@login_required
def abort_run(auto_run_id: int) -> Any:
    run = ComicAutoRun.query.filter_by(id=auto_run_id, user_id=current_user.id).first()
    if not run:
        return jsonify({"error": "Auto run not found"}), 404
    abort_auto_run(run)
    db.session.commit()
    db.session.refresh(run)
    return jsonify({"auto_run": run.to_dict()}), 200
```

- [ ] **Step 4: Implement `abort_auto_run`**

In `mangasuperb/services/auto_runs.py`:

```python
def abort_auto_run(run: ComicAutoRun) -> ComicAutoRun:
    now = datetime.utcnow()
    run.abort_requested = True
    run.status = "aborted"
    run.completed_at = run.completed_at or now
    if run.render_run:
        run.render_run.abort_requested = True
        if run.render_run.status in {"queued", "running"}:
            run.render_run.status = "aborted"
            run.render_run.completed_at = run.render_run.completed_at or now
    return run
```

- [ ] **Step 5: Run Auto route tests**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py -q
```

Expected: PASS.

- [ ] **Step 6: Add active jobs tests for Auto runs**

Append to `tests/test_job_routes.py`:

```python
def test_active_jobs_includes_active_auto_runs(app, auth_client, user):
    from mangasuperb.extensions import db
    from mangasuperb.services.auto_runs import create_auto_run
    from models import ComicAutoRun

    with app.app_context():
        run = create_auto_run(
            user_id=user.id,
            title="Auto Active",
            story="A pilot finds a hidden city.",
            preferences={"style_description": "Ink manga", "aspect_ratio": "16:9"},
        )
        run.status = "running"
        run.current_stage = "panels"
        run.job_id = "auto-job-1"
        db.session.commit()

    response = auth_client.get("/api/jobs/active")

    assert response.status_code == 200
    active = response.get_json()["active"]
    auto_rows = [item for item in active if item.get("kind") == "auto_run"]
    assert len(auto_rows) == 1
    assert auto_rows[0]["auto_run_id"] == run.id
    assert auto_rows[0]["stage"] == "panels"
    assert auto_rows[0]["job_id"] == "auto-job-1"
```

- [ ] **Step 7: Extend active jobs endpoint**

In `mangasuperb/routes/jobs.py`, import `ComicAutoRun`:

```python
from models import Character, Comic, ComicAutoRun, ComicRenderRun, ComicWorkflowStage, Script
```

In `list_active_jobs()`, query active auto runs after render runs:

```python
auto_runs = (
    ComicAutoRun.query.filter_by(user_id=current_user.id)
    .filter(ComicAutoRun.status.in_(("queued", "running", "needs_review")))
    .order_by(ComicAutoRun.created_at.asc())
    .all()
)
```

Append rows:

```python
for auto_run in auto_runs:
    comic = auto_run.comic
    active.append(
        {
            "job_id": auto_run.job_id or f"auto-run-{auto_run.id}",
            "kind": "auto_run",
            "auto_run_id": auto_run.id,
            "comic_id": auto_run.comic_id,
            "stage": auto_run.current_stage,
            "status": auto_run.status,
            "title": comic.title if comic else auto_run.title_snapshot,
            "started_at": (
                auto_run.started_at.isoformat()
                if auto_run.started_at
                else auto_run.created_at.isoformat()
            ),
            "render_progress": auto_run.render_progress,
        }
    )
```

- [ ] **Step 8: Extend job detail for Auto runs**

In `get_job_status`, before comic workflow lookup, resolve by `auto-run-<id>` or `ComicAutoRun.job_id`:

```python
auto_run = None
if job_id.startswith("auto-run-"):
    try:
        auto_run_id = int(job_id.removeprefix("auto-run-"))
    except ValueError:
        auto_run_id = None
    if auto_run_id is not None:
        auto_run = ComicAutoRun.query.filter_by(id=auto_run_id, user_id=current_user.id).first()
if not auto_run:
    auto_run = ComicAutoRun.query.filter_by(job_id=job_id, user_id=current_user.id).first()
```

Include it in the found-object checks and response:

```python
if not comic and auto_run:
    comic = auto_run.comic
...
if auto_run:
    response["auto_run"] = auto_run.to_dict()
```

For synthetic `auto-run-<id>` ids, set `rq_status = auto_run.status`.

- [ ] **Step 9: Run backend route tests**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest tests/test_auto_runs.py tests/test_job_routes.py tests/test_render_runs.py -q
```

Expected: PASS.

- [ ] **Step 10: Commit API and active jobs**

```bash
git add mangasuperb/routes/auto.py mangasuperb/routes/jobs.py mangasuperb/services/auto_runs.py tests/test_auto_runs.py tests/test_job_routes.py
git commit -m "feat: expose auto run APIs"
```

---

## Task 4: Frontend Auto Run Types, API Client, And Hook

**Files:**
- Modify: `frontend/src/service/types.ts`
- Modify: `frontend/src/apis/auto.ts`
- Create: `frontend/src/hooks/use-auto-run.ts`
- Create: `frontend/src/hooks/__tests__/use-auto-run.test.ts`

- [ ] **Step 1: Add failing hook tests**

Create `frontend/src/hooks/__tests__/use-auto-run.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoApi } from '@/apis/auto'
import { currentComicIdAtom } from '@/pages/comics/atoms'

import { useAutoRun } from '../use-auto-run'

vi.mock('@/apis/auto', () => ({
  AutoApi: {
    getActiveRun: vi.fn(),
    getRun: vi.fn(),
    startRun: vi.fn(),
    abortRun: vi.fn(),
    retryRun: vi.fn(),
    resolveRun: vi.fn(),
  },
}))

const getActiveRunMock = vi.mocked(AutoApi.getActiveRun)
const getRunMock = vi.mocked(AutoApi.getRun)

function wrapperWithComic(comicId: number) {
  const store = createStore()
  store.set(currentComicIdAtom, comicId)
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>
  }
}

describe('useAutoRun', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getActiveRunMock.mockReset()
    getRunMock.mockReset()
  })

  it('hydrates the active Auto run for the current comic', async () => {
    getActiveRunMock.mockResolvedValue({
      auto_run: {
        id: 5,
        comic_id: 7,
        user_id: 1,
        status: 'running',
        current_stage: 'render',
        story_snapshot: 'Story',
        title_snapshot: 'Book',
        preferences_snapshot: {},
        character_review: null,
        selected_character_ids: [],
        render_run_id: null,
        render_run: null,
        render_progress: null,
        abort_requested: false,
        job_id: 'auto-job-5',
        error_message: null,
        created_at: null,
        started_at: null,
        completed_at: null,
        updated_at: null,
      },
    })

    const { result } = renderHook(() => useAutoRun(), { wrapper: wrapperWithComic(7) })

    await waitFor(() => expect(result.current.autoRun?.id).toBe(5))
    expect(getActiveRunMock).toHaveBeenCalledWith(7)
  })

  it('polls active runs and stops polling after completion', async () => {
    getActiveRunMock.mockResolvedValue({
      auto_run: {
        id: 5,
        comic_id: 7,
        user_id: 1,
        status: 'running',
        current_stage: 'render',
        story_snapshot: 'Story',
        title_snapshot: 'Book',
        preferences_snapshot: {},
        character_review: null,
        selected_character_ids: [],
        render_run_id: null,
        render_run: null,
        render_progress: null,
        abort_requested: false,
        job_id: 'auto-job-5',
        error_message: null,
        created_at: null,
        started_at: null,
        completed_at: null,
        updated_at: null,
      },
    })
    getRunMock.mockResolvedValue({
      auto_run: {
        id: 5,
        comic_id: 7,
        user_id: 1,
        status: 'completed',
        current_stage: 'preview',
        story_snapshot: 'Story',
        title_snapshot: 'Book',
        preferences_snapshot: {},
        character_review: null,
        selected_character_ids: [],
        render_run_id: null,
        render_run: null,
        render_progress: { completed: 2, failed: 0, total: 2, current_page_number: 2 },
        abort_requested: false,
        job_id: 'auto-job-5',
        error_message: null,
        created_at: null,
        started_at: null,
        completed_at: null,
        updated_at: null,
      },
    })

    const { result } = renderHook(() => useAutoRun(), { wrapper: wrapperWithComic(7) })
    await waitFor(() => expect(result.current.autoRun?.status).toBe('running'))
    await vi.advanceTimersByTimeAsync(2000)
    await waitFor(() => expect(result.current.autoRun?.status).toBe('completed'))
  })
})
```

- [ ] **Step 2: Run hook tests and confirm failure**

Run:

```bash
cd frontend && npm test -- src/hooks/__tests__/use-auto-run.test.ts
```

Expected: FAIL because `use-auto-run.ts` and AutoApi run methods do not exist.

- [ ] **Step 3: Add TypeScript contracts**

In `frontend/src/service/types.ts`, add after `AutoCharacterPrepareResponse`:

```ts
export type AutoRunStatus = 'queued' | 'running' | 'needs_review' | 'completed' | 'failed' | 'aborted'

export type AutoRunStage = 'story' | 'characters' | 'panels' | 'layout' | 'render' | 'preview'

export interface AutoRunRenderProgress {
  completed: number
  failed: number
  total: number
  current_page_number: number | null
}

export interface AutoRun {
  id: number
  comic_id: number
  user_id: number
  status: AutoRunStatus
  current_stage: AutoRunStage
  story_snapshot: string
  title_snapshot: string
  preferences_snapshot: Record<string, unknown>
  character_review: AutoCharacterPrepareResponse | null
  selected_character_ids: number[]
  render_run_id: number | null
  render_run: RenderRun | null
  render_progress: AutoRunRenderProgress | null
  abort_requested: boolean
  job_id: string | null
  error_message: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  updated_at: string | null
}

export interface StartAutoRunRequest {
  comic_id?: number | null
  title: string
  story: string
  preferences?: Record<string, unknown>
}

export interface AutoRunResponse {
  auto_run: AutoRun | null
  comic?: IComic | null
}

export interface ResolveAutoRunRequest {
  selected_character_ids?: number[]
  character_roles?: Record<number, string>
}
```

Extend `frontend/src/apis/jobs.ts` `ActiveJob`:

```ts
auto_run_id?: number | null
```

Extend `JobDetail`:

```ts
auto_run?: AutoRun | null
```

- [ ] **Step 4: Add AutoApi run methods**

In `frontend/src/apis/auto.ts`, extend imports and object:

```ts
import type {
  AutoCharacterPrepareRequest,
  AutoCharacterPrepareResponse,
  AutoRunResponse,
  ResolveAutoRunRequest,
  StartAutoRunRequest,
} from '@/service/types'
```

Add methods:

```ts
startRun(body: StartAutoRunRequest) {
  return request<StartAutoRunRequest, AutoRunResponse>({
    url: '/api/auto/runs',
    method: 'POST',
    data: body,
    timeout: 60000,
  })
},
getRun(autoRunId: number) {
  return request<void, AutoRunResponse>({
    url: `/api/auto/runs/${autoRunId}`,
    method: 'GET',
  })
},
getActiveRun(comicId: number) {
  return request<void, AutoRunResponse>({
    url: `/api/auto/runs/active?comic_id=${comicId}`,
    method: 'GET',
  })
},
abortRun(autoRunId: number) {
  return request<void, AutoRunResponse>({
    url: `/api/auto/runs/${autoRunId}/abort`,
    method: 'POST',
  })
},
resolveRun(autoRunId: number, body: ResolveAutoRunRequest) {
  return request<ResolveAutoRunRequest, AutoRunResponse>({
    url: `/api/auto/runs/${autoRunId}/resolve`,
    method: 'POST',
    data: body,
  })
},
retryRun(autoRunId: number) {
  return request<void, AutoRunResponse>({
    url: `/api/auto/runs/${autoRunId}/retry`,
    method: 'POST',
  })
},
```

- [ ] **Step 5: Implement `useAutoRun`**

Create `frontend/src/hooks/use-auto-run.ts`:

```ts
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AutoApi } from '@/apis/auto'
import { currentComicIdAtom } from '@/pages/comics/atoms'
import type { AutoRun, ResolveAutoRunRequest, StartAutoRunRequest } from '@/service/types'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'needs_review'])
const POLL_MS = 2000

function isActiveAutoRun(autoRun: AutoRun | null): boolean {
  return Boolean(autoRun && ACTIVE_STATUSES.has(autoRun.status))
}

export function useAutoRun() {
  const comicId = useAtomValue(currentComicIdAtom)
  const [autoRun, setAutoRun] = useState<AutoRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const refreshRun = useCallback(async (runId = autoRun?.id) => {
    if (!runId) return null
    const response = await AutoApi.getRun(runId)
    setAutoRun(response.auto_run)
    return response.auto_run
  }, [autoRun?.id])

  useEffect(() => {
    clearTimer()
    if (!comicId) {
      setAutoRun(null)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    AutoApi.getActiveRun(comicId)
      .then((response) => {
        if (!cancelled) setAutoRun(response.auto_run)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught?.message || 'Failed to load Auto run')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      clearTimer()
    }
  }, [clearTimer, comicId])

  useEffect(() => {
    clearTimer()
    if (!isActiveAutoRun(autoRun)) return undefined

    let cancelled = false
    const tick = async () => {
      try {
        const response = await AutoApi.getRun(autoRun.id)
        if (cancelled) return
        setAutoRun(response.auto_run)
        if (isActiveAutoRun(response.auto_run)) {
          timerRef.current = window.setTimeout(tick, POLL_MS)
        }
      } catch (caught: any) {
        if (cancelled) return
        setError(caught?.message || 'Failed to refresh Auto run')
        timerRef.current = window.setTimeout(tick, POLL_MS)
      }
    }

    timerRef.current = window.setTimeout(tick, POLL_MS)

    return () => {
      cancelled = true
      clearTimer()
    }
  }, [autoRun, clearTimer])

  const startRun = useCallback(async (body: StartAutoRunRequest) => {
    setLoading(true)
    setError(null)
    try {
      const response = await AutoApi.startRun(body)
      setAutoRun(response.auto_run)
      return response
    } catch (caught: any) {
      setError(caught?.message || 'Failed to start Auto run')
      throw caught
    } finally {
      setLoading(false)
    }
  }, [])

  const abortRun = useCallback(async () => {
    if (!autoRun) return null
    const response = await AutoApi.abortRun(autoRun.id)
    setAutoRun(response.auto_run)
    return response.auto_run
  }, [autoRun])

  const resolveRun = useCallback(async (body: ResolveAutoRunRequest) => {
    if (!autoRun) return null
    const response = await AutoApi.resolveRun(autoRun.id, body)
    setAutoRun(response.auto_run)
    return response.auto_run
  }, [autoRun])

  const retryRun = useCallback(async () => {
    if (!autoRun) return null
    const response = await AutoApi.retryRun(autoRun.id)
    setAutoRun(response.auto_run)
    return response.auto_run
  }, [autoRun])

  return {
    autoRun,
    loading,
    error,
    isActive: isActiveAutoRun(autoRun),
    startRun,
    abortRun,
    resolveRun,
    retryRun,
    refreshRun,
  }
}

export default useAutoRun
```

- [ ] **Step 6: Run hook tests**

Run:

```bash
cd frontend && npm test -- src/hooks/__tests__/use-auto-run.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit contracts and hook**

```bash
git add frontend/src/service/types.ts frontend/src/apis/auto.ts frontend/src/apis/jobs.ts frontend/src/hooks/use-auto-run.ts frontend/src/hooks/__tests__/use-auto-run.test.ts
git commit -m "feat: add frontend auto run contract"
```

---

## Task 5: Auto Mode State Machine And Surfaces

**Files:**
- Modify: `frontend/src/pages/comics/auto/auto-mode-tab.tsx`
- Create: `frontend/src/pages/comics/auto/auto-draft.tsx`
- Create: `frontend/src/pages/comics/auto/auto-run-progress.tsx`
- Create: `frontend/src/pages/comics/auto/auto-run-review.tsx`
- Create: `frontend/src/pages/comics/auto/auto-preview.tsx`
- Create: `frontend/src/pages/comics/auto/auto-run-stage-list.tsx`
- Modify/Create tests under `frontend/src/pages/comics/auto/__tests__/`

- [ ] **Step 1: Add failing Auto state tests**

Create `frontend/src/pages/comics/auto/__tests__/auto-mode-v2.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoApi } from '@/apis/auto'
import { currentComicIdAtom, fullStoryAtom, mangaTitleAtom, workflowModeAtom } from '../../atoms'
import { AutoModeTab } from '../auto-mode-tab'

vi.mock('@/apis/auto', () => ({
  AutoApi: {
    getActiveRun: vi.fn(),
    getRun: vi.fn(),
    startRun: vi.fn(),
    abortRun: vi.fn(),
    retryRun: vi.fn(),
    resolveRun: vi.fn(),
    prepareCharacters: vi.fn(),
  },
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: any) => ({
      'auto.title': 'Auto Manga',
      'auto.subtitle': 'Upload or paste a novel to start.',
      'auto.generateManga': 'Generate manga',
      'auto.running.title': 'Generating your manga',
      'auto.running.subtitle': `Stage: ${options?.stage ?? ''}`,
      'auto.running.abort': 'Abort generation',
      'auto.preview.title': 'Preview',
      'auto.preview.story': 'Story',
      'auto.preview.export': 'Export',
      'auto.preview.regenerateCurrent': 'Regenerate current page',
      'auto.preview.regenerateAll': 'Regenerate all pages',
      'auto.openPro': 'Open Pro controls',
    }[key] ?? key),
  }),
}))

const getActiveRunMock = vi.mocked(AutoApi.getActiveRun)
const startRunMock = vi.mocked(AutoApi.startRun)

function renderAuto(store = createStore()) {
  return render(
    <Provider store={store}>
      <AutoModeTab onOpenPro={() => store.set(workflowModeAtom, 'pro')} />
    </Provider>,
  )
}

describe('Auto Mode V2', () => {
  beforeEach(() => {
    getActiveRunMock.mockReset()
    startRunMock.mockReset()
    getActiveRunMock.mockResolvedValue({ auto_run: null })
  })

  it('shows a one-click draft surface without Pro controls', async () => {
    const store = createStore()
    store.set(fullStoryAtom, 'A pilot finds a hidden city.')
    store.set(mangaTitleAtom, 'Hidden City')

    renderAuto(store)

    expect(await screen.findByRole('button', { name: 'Generate manga' })).toBeInTheDocument()
    expect(screen.queryByText('Prepare characters')).not.toBeInTheDocument()
    expect(screen.queryByText('AI模型')).not.toBeInTheDocument()
  })

  it('starts an Auto run from story and title', async () => {
    const store = createStore()
    store.set(fullStoryAtom, 'A pilot finds a hidden city.')
    store.set(mangaTitleAtom, 'Hidden City')
    startRunMock.mockResolvedValue({
      auto_run: {
        id: 8,
        comic_id: 9,
        user_id: 1,
        status: 'running',
        current_stage: 'characters',
        story_snapshot: 'A pilot finds a hidden city.',
        title_snapshot: 'Hidden City',
        preferences_snapshot: {},
        character_review: null,
        selected_character_ids: [],
        render_run_id: null,
        render_run: null,
        render_progress: null,
        abort_requested: false,
        job_id: 'auto-job-8',
        error_message: null,
        created_at: null,
        started_at: null,
        completed_at: null,
        updated_at: null,
      },
      comic: { id: 9, title: 'Hidden City' },
    } as any)

    renderAuto(store)
    fireEvent.click(await screen.findByRole('button', { name: 'Generate manga' }))

    await waitFor(() => {
      expect(startRunMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Hidden City',
        story: 'A pilot finds a hidden city.',
      }))
    })
    expect(store.get(currentComicIdAtom)).toBe(9)
  })

  it('shows running progress and hides the story editor for active runs', async () => {
    const store = createStore()
    store.set(currentComicIdAtom, 9)
    getActiveRunMock.mockResolvedValue({
      auto_run: {
        id: 8,
        comic_id: 9,
        user_id: 1,
        status: 'running',
        current_stage: 'render',
        story_snapshot: 'Snapshot story',
        title_snapshot: 'Hidden City',
        preferences_snapshot: {},
        character_review: null,
        selected_character_ids: [],
        render_run_id: 20,
        render_run: null,
        render_progress: { completed: 1, failed: 0, total: 3, current_page_number: 2 },
        abort_requested: false,
        job_id: 'auto-job-8',
        error_message: null,
        created_at: null,
        started_at: null,
        completed_at: null,
        updated_at: null,
      },
    })

    renderAuto(store)

    expect(await screen.findByText('Generating your manga')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('...')).not.toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run Auto tests and confirm failure**

Run:

```bash
cd frontend && npm test -- src/pages/comics/auto/__tests__/auto-mode-v2.test.tsx
```

Expected: FAIL because the V2 Auto surfaces do not exist.

- [ ] **Step 3: Create Auto draft surface**

Create `frontend/src/pages/comics/auto/auto-draft.tsx`:

```tsx
import { useAtom } from 'jotai'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRunResponse } from '@/service/types'

import { currentComicIdAtom, fullStoryAtom, mangaTitleAtom } from '../atoms'
import { StoryEditor } from '../story/story-editor'

interface AutoDraftProps {
  starting: boolean
  onStart: (body: { title: string; story: string }) => Promise<AutoRunResponse>
}

export function AutoDraft({ starting, onStart }: AutoDraftProps) {
  const { t } = useI18n('comics')
  const [story] = useAtom(fullStoryAtom)
  const [title] = useAtom(mangaTitleAtom)
  const [, setComicId] = useAtom(currentComicIdAtom)

  const handleStart = async () => {
    if (!story.trim()) {
      toast.error(String(t('auto.error.addStory')))
      return
    }
    const response = await onStart({ title: title.trim() || String(t('editor.untitled')), story })
    const comicId = response.comic?.id ?? response.auto_run?.comic_id
    if (comicId) setComicId(comicId)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 rounded-lg border border-border/60 bg-card p-4 shadow-sm sm:p-5">
        <StoryEditor />
      </section>
      <aside className="flex min-w-0 flex-col gap-4">
        <section className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
          <h3 className="text-base font-semibold">{String(t('auto.title'))}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{String(t('auto.subtitle'))}</p>
          <Button className="mt-4 w-full" size="lg" onClick={() => void handleStart()} disabled={starting}>
            {starting ? String(t('auto.starting')) : String(t('auto.generateManga'))}
          </Button>
        </section>
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Create stage list and progress surface**

Create `frontend/src/pages/comics/auto/auto-run-stage-list.tsx`:

```tsx
import { CheckCircle2, Circle, LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AutoRun, AutoRunStage } from '@/service/types'

const STAGES: AutoRunStage[] = ['characters', 'panels', 'layout', 'render', 'preview']

function rank(stage: AutoRunStage) {
  return STAGES.indexOf(stage)
}

export function AutoRunStageList({ autoRun, labelForStage }: {
  autoRun: AutoRun
  labelForStage: (stage: AutoRunStage) => string
}) {
  const currentRank = rank(autoRun.current_stage)
  return (
    <ol className="grid gap-3 md:grid-cols-5">
      {STAGES.map((stage) => {
        const stageRank = rank(stage)
        const complete = autoRun.status === 'completed' || stageRank < currentRank
        const active = stage === autoRun.current_stage && autoRun.status !== 'completed'
        return (
          <li key={stage} className={cn('rounded-lg border p-3', active && 'border-primary bg-primary/10')}>
            <div className="flex items-center gap-2 text-sm font-medium">
              {complete ? <CheckCircle2 className="size-4 text-emerald-500" /> : active ? <LoaderCircle className="size-4 animate-spin text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
              <span>{labelForStage(stage)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
```

Create `frontend/src/pages/comics/auto/auto-run-progress.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun, AutoRunStage } from '@/service/types'

import { AutoRunStageList } from './auto-run-stage-list'

export function AutoRunProgress({ autoRun, aborting, onAbort, onOpenPro }: {
  autoRun: AutoRun
  aborting: boolean
  onAbort: () => void
  onOpenPro: () => void
}) {
  const { t } = useI18n('comics')
  const progress = autoRun.render_progress
  const percent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0
  const labelForStage = (stage: AutoRunStage) => String(t(`auto.stage.${stage}`))

  return (
    <section className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-2xl font-semibold tracking-normal">{String(t('auto.running.title'))}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {String(t('auto.running.subtitle', { stage: labelForStage(autoRun.current_stage) }))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenPro}>{String(t('auto.openPro'))}</Button>
          <Button variant="destructive" onClick={onAbort} disabled={aborting || autoRun.abort_requested}>
            {String(t('auto.running.abort'))}
          </Button>
        </div>
      </div>
      <div className="mt-6">
        <AutoRunStageList autoRun={autoRun} labelForStage={labelForStage} />
      </div>
      {progress ? (
        <div className="mt-6 rounded-lg border border-border/60 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{String(t('auto.running.pages'))}</span>
            <span>{progress.completed}/{progress.total}</span>
          </div>
          <Progress value={percent} />
        </div>
      ) : null}
      {autoRun.error_message ? (
        <div role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {autoRun.error_message}
        </div>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 5: Create review and preview surfaces**

Create `frontend/src/pages/comics/auto/auto-run-review.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun } from '@/service/types'

export function AutoRunReview({ autoRun, onOpenPro, onRetry }: {
  autoRun: AutoRun
  onOpenPro: () => void
  onRetry: () => void
}) {
  const { t } = useI18n('comics')
  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
      <h3 className="text-xl font-semibold">{String(t('auto.review.title'))}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{String(t('auto.review.description'))}</p>
      {autoRun.error_message ? <p className="mt-3 text-sm text-destructive">{autoRun.error_message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onOpenPro}>{String(t('auto.openPro'))}</Button>
        <Button variant="outline" onClick={onRetry}>{String(t('auto.review.retry'))}</Button>
      </div>
    </section>
  )
}
```

Create `frontend/src/pages/comics/auto/auto-preview.tsx`:

```tsx
import { useAtomValue } from 'jotai'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/use-i18n'
import { proxiedStatic } from '@/lib/utils'
import type { AutoRun, IComic } from '@/service/types'

import { currentComicDetailAtom } from '../atoms'
import { StoryEditor } from '../story/story-editor'
import { GeneratedImage } from '../image-generation/generated-image'

export function AutoPreview({ autoRun, onOpenPro }: {
  autoRun: AutoRun
  onOpenPro: () => void
}) {
  const { t } = useI18n('comics')
  const comic = useAtomValue(currentComicDetailAtom) as IComic | null
  const pages = useMemo(() => (
    Array.isArray(comic?.pages)
      ? [...comic.pages].sort((a, b) => Number(a?.page_number ?? 0) - Number(b?.page_number ?? 0))
      : []
  ), [comic?.pages])
  const [selectedPage, setSelectedPage] = useState(() => Number(pages[0]?.page_number ?? 1))
  const selected = pages.find((page) => Number(page?.page_number) === selectedPage) ?? pages[0]
  const imageUrl = proxiedStatic(selected?.image_url)

  return (
    <Tabs defaultValue="preview" className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <TabsList className="grid w-full grid-cols-2 sm:w-72">
          <TabsTrigger value="preview">{String(t('auto.preview.title'))}</TabsTrigger>
          <TabsTrigger value="story">{String(t('auto.preview.story'))}</TabsTrigger>
        </TabsList>
        <Button variant="outline" onClick={onOpenPro}>{String(t('auto.openPro'))}</Button>
      </div>
      <TabsContent value="preview" className="mt-0">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-h-[520px] items-center justify-center rounded-lg border border-border/60 bg-card p-4">
            {imageUrl ? <GeneratedImage alt="Auto preview" src={imageUrl} aspectRatio="16 / 10" /> : <p className="text-sm text-muted-foreground">{String(t('auto.preview.empty'))}</p>}
          </section>
          <aside className="space-y-4">
            <section className="rounded-lg border border-border/60 bg-card p-4">
              <h3 className="text-base font-semibold">{autoRun.title_snapshot}</h3>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {pages.map((page) => (
                  <Button key={page.page_number} variant={Number(page.page_number) === selectedPage ? 'default' : 'outline'} onClick={() => setSelectedPage(Number(page.page_number))}>
                    {page.page_number}
                  </Button>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-border/60 bg-card p-4">
              <div className="grid gap-2">
                <Button>{String(t('auto.preview.export'))}</Button>
                <Button variant="outline">{String(t('auto.preview.regenerateCurrent'))}</Button>
                <Button variant="outline">{String(t('auto.preview.regenerateAll'))}</Button>
              </div>
            </section>
          </aside>
        </div>
      </TabsContent>
      <TabsContent value="story" className="mt-0">
        <section className="rounded-lg border border-border/60 bg-card p-4">
          <StoryEditor />
        </section>
      </TabsContent>
    </Tabs>
  )
}
```

- [ ] **Step 6: Refactor AutoModeTab into a state router**

Replace `frontend/src/pages/comics/auto/auto-mode-tab.tsx` with:

```tsx
import { useAtom } from 'jotai'
import toast from 'react-hot-toast'

import { useAutoRun } from '@/hooks/use-auto-run'
import { useI18n } from '@/hooks/use-i18n'

import { currentComicDetailAtom, currentComicIdAtom, currentComicOverridesAtom } from '../atoms'
import { ComicsWorkflowShell } from '../components/workflow-layout'
import { AutoDraft } from './auto-draft'
import { AutoPreview } from './auto-preview'
import { AutoRunProgress } from './auto-run-progress'
import { AutoRunReview } from './auto-run-review'

export function AutoModeTab({ onOpenPro }: { onOpenPro: () => void }) {
  const { t } = useI18n('comics')
  const [comicId] = useAtom(currentComicIdAtom)
  const [, setComicDetail] = useAtom(currentComicDetailAtom)
  const [overrides] = useAtom(currentComicOverridesAtom)
  const { autoRun, loading, startRun, abortRun, retryRun } = useAutoRun()

  const handleStart = async ({ title, story }: { title: string; story: string }) => {
    const response = await startRun({
      comic_id: comicId,
      title,
      story,
      preferences: overrides,
    })
    if (response.comic) setComicDetail(response.comic)
    return response
  }

  const handleAbort = async () => {
    try {
      await abortRun()
    } catch (error: any) {
      toast.error(error?.message || String(t('auto.error.abortFailed')))
    }
  }

  const handleRetry = async () => {
    try {
      await retryRun()
    } catch (error: any) {
      toast.error(error?.message || String(t('auto.error.retryFailed')))
    }
  }

  let content = <AutoDraft starting={loading} onStart={handleStart} />
  if (autoRun?.status === 'queued' || autoRun?.status === 'running') {
    content = <AutoRunProgress autoRun={autoRun} aborting={loading} onAbort={() => void handleAbort()} onOpenPro={onOpenPro} />
  } else if (autoRun?.status === 'needs_review' || autoRun?.status === 'failed') {
    content = <AutoRunReview autoRun={autoRun} onOpenPro={onOpenPro} onRetry={() => void handleRetry()} />
  } else if (autoRun?.status === 'completed') {
    content = <AutoPreview autoRun={autoRun} onOpenPro={onOpenPro} />
  }

  return <ComicsWorkflowShell>{content}</ComicsWorkflowShell>
}
```

- [ ] **Step 7: Run Auto state tests**

Run:

```bash
cd frontend && npm test -- src/pages/comics/auto/__tests__/auto-mode-v2.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Auto surfaces**

```bash
git add frontend/src/pages/comics/auto frontend/src/hooks/use-auto-run.ts
git commit -m "feat: add auto run mode surfaces"
```

---

## Task 6: Pro Snapshot Banner And Auto Run Hydration In Comics Page

**Files:**
- Modify: `frontend/src/pages/comics/index.tsx`
- Create: `frontend/src/pages/comics/components/auto-run-banner.tsx`
- Modify: `frontend/src/pages/comics/__tests__/comics-mode.test.tsx`

- [ ] **Step 1: Add failing Pro banner test**

In `frontend/src/pages/comics/__tests__/comics-mode.test.tsx`, add a test with `AutoApi.getActiveRun` mocked to return an active run, then click Pro and assert:

```tsx
expect(screen.getByText('Auto generation is using a saved story snapshot.')).toBeInTheDocument()
expect(screen.getByText('Story workflow')).toBeInTheDocument()
```

Update the existing `vi.mock('@/apis/auto')` to include `getActiveRun`, `getRun`, `startRun`, `abortRun`, `retryRun`, and `resolveRun`.

- [ ] **Step 2: Create banner component**

Create `frontend/src/pages/comics/components/auto-run-banner.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun } from '@/service/types'

export function AutoRunBanner({ autoRun, onOpenAuto }: {
  autoRun: AutoRun | null
  onOpenAuto: () => void
}) {
  const { t } = useI18n('comics')
  if (!autoRun || !['queued', 'running', 'needs_review'].includes(autoRun.status)) return null

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-primary">{String(t('auto.proSnapshotBanner'))}</p>
        <Button type="button" variant="outline" size="sm" onClick={onOpenAuto}>
          {String(t('auto.backToProgress'))}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount banner in Pro mode**

In `frontend/src/pages/comics/index.tsx`, import `useAutoRun` and `AutoRunBanner`. Inside `ComicsPage`, call `const { autoRun } = useAutoRun()`. In the Pro `TabsContent`, before nested tabs, render:

```tsx
<ComicsWorkflowShell className="pb-0">
  <AutoRunBanner autoRun={autoRun} onOpenAuto={() => setWorkflowMode('auto')} />
</ComicsWorkflowShell>
```

Keep the existing Pro tab header below it.

- [ ] **Step 4: Run Comics mode tests**

Run:

```bash
cd frontend && npm test -- src/pages/comics/__tests__/comics-mode.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Pro banner**

```bash
git add frontend/src/pages/comics/index.tsx frontend/src/pages/comics/components/auto-run-banner.tsx frontend/src/pages/comics/__tests__/comics-mode.test.tsx
git commit -m "feat: show auto run snapshot banner in pro"
```

---

## Task 7: Draggable Edge-Snapping Progress Shelf

**Files:**
- Modify: `frontend/src/components/progress-shelf/index.tsx`
- Create: `frontend/src/components/progress-shelf/shelf-orb.tsx`
- Create: `frontend/src/components/progress-shelf/shelf-panel.tsx`
- Create: `frontend/src/components/progress-shelf/use-shelf-position.ts`
- Modify/Create tests in `frontend/src/components/progress-shelf/__tests__/`

- [ ] **Step 1: Add failing position hook tests**

Create `frontend/src/components/progress-shelf/__tests__/use-shelf-position.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useShelfPosition } from '../use-shelf-position'

describe('useShelfPosition', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  })

  it('snaps to the nearest viewport edge and persists position', () => {
    const { result } = renderHook(() => useShelfPosition())

    act(() => {
      result.current.setPosition({ x: 940, y: 300 })
      result.current.snapToEdge()
    })

    expect(result.current.position.edge).toBe('right')
    expect(result.current.position.x).toBeGreaterThan(900)
    expect(JSON.parse(localStorage.getItem('mangasuperb.progressShelf.position') || '{}').edge).toBe('right')
  })

  it('clamps restored position inside the viewport', () => {
    localStorage.setItem('mangasuperb.progressShelf.position', JSON.stringify({ x: 5000, y: 5000, edge: 'right' }))

    const { result } = renderHook(() => useShelfPosition())

    expect(result.current.position.x).toBeLessThanOrEqual(936)
    expect(result.current.position.y).toBeLessThanOrEqual(736)
  })
})
```

- [ ] **Step 2: Implement `useShelfPosition`**

Create `frontend/src/components/progress-shelf/use-shelf-position.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'mangasuperb.progressShelf.position'
const ORB_SIZE = 64
const MARGIN = 16

type Edge = 'left' | 'right' | 'top' | 'bottom'

export interface ShelfPosition {
  x: number
  y: number
  edge: Edge
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function defaultPosition(): ShelfPosition {
  return {
    x: Math.max(MARGIN, window.innerWidth - ORB_SIZE - MARGIN),
    y: Math.max(MARGIN, window.innerHeight - ORB_SIZE - MARGIN),
    edge: 'right',
  }
}

function clampPosition(position: ShelfPosition): ShelfPosition {
  return {
    ...position,
    x: clamp(position.x, MARGIN, Math.max(MARGIN, window.innerWidth - ORB_SIZE - MARGIN)),
    y: clamp(position.y, MARGIN, Math.max(MARGIN, window.innerHeight - ORB_SIZE - MARGIN)),
  }
}

function nearestEdge(x: number, y: number): Edge {
  const distances: Record<Edge, number> = {
    left: x,
    right: window.innerWidth - x,
    top: y,
    bottom: window.innerHeight - y,
  }
  return (Object.entries(distances).sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'right') as Edge
}

function loadPosition(): ShelfPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0, edge: 'right' }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return clampPosition({
        x: parsed.x,
        y: parsed.y,
        edge: parsed.edge || nearestEdge(parsed.x, parsed.y),
      })
    }
  } catch {
    void 0
  }
  return defaultPosition()
}

function persist(position: ShelfPosition) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
}

export function useShelfPosition() {
  const [position, setPositionState] = useState<ShelfPosition>(() => loadPosition())

  const setPosition = useCallback((next: { x: number; y: number }) => {
    setPositionState((current) => clampPosition({ ...current, ...next }))
  }, [])

  const snapToEdge = useCallback(() => {
    setPositionState((current) => {
      const edge = nearestEdge(current.x + ORB_SIZE / 2, current.y + ORB_SIZE / 2)
      const snapped = clampPosition({
        ...current,
        edge,
        x: edge === 'left' ? MARGIN : edge === 'right' ? window.innerWidth - ORB_SIZE - MARGIN : current.x,
        y: edge === 'top' ? MARGIN : edge === 'bottom' ? window.innerHeight - ORB_SIZE - MARGIN : current.y,
      })
      persist(snapped)
      return snapped
    })
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setPositionState((current) => {
        const next = clampPosition(current)
        persist(next)
        return next
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return { position, setPosition, snapToEdge, orbSize: ORB_SIZE }
}
```

- [ ] **Step 3: Add failing shelf orb render tests**

Create or extend `frontend/src/components/progress-shelf/__tests__/progress-shelf.test.tsx`:

```tsx
it('renders as a circular draggable progress button when collapsed', () => {
  const store = createStore()
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ProgressShelf />
      </MemoryRouter>
    </Provider>,
  )

  const button = screen.getByRole('button', { name: /任务进度/i })
  expect(button).toHaveClass('rounded-full')
  expect(button).toHaveAttribute('draggable', 'false')
})
```

- [ ] **Step 4: Create `ShelfOrb`**

Create `frontend/src/components/progress-shelf/shelf-orb.tsx`:

```tsx
import { Layers3 } from 'lucide-react'
import { useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import type { ShelfPosition } from './use-shelf-position'

export function ShelfOrb({
  activeCount,
  expanded,
  label,
  hint,
  position,
  orbSize,
  onToggle,
  onMove,
  onSnap,
}: {
  activeCount: number
  expanded: boolean
  label: string
  hint: string
  position: ShelfPosition
  orbSize: number
  onToggle: () => void
  onMove: (position: { x: number; y: number }) => void
  onSnap: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const hiddenClass = !expanded && !dragging
    ? position.edge === 'right'
      ? 'translate-x-1/2 hover:translate-x-0 focus-visible:translate-x-0'
      : position.edge === 'left'
        ? '-translate-x-1/2 hover:translate-x-0 focus-visible:translate-x-0'
        : position.edge === 'top'
          ? '-translate-y-1/2 hover:translate-y-0 focus-visible:translate-y-0'
          : 'translate-y-1/2 hover:translate-y-0 focus-visible:translate-y-0'
    : ''

  return (
    <button
      type="button"
      draggable={false}
      title={label}
      aria-label={label}
      onClick={() => {
        if (!dragging) onToggle()
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        dragOffsetRef.current = { x: event.clientX - position.x, y: event.clientY - position.y }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        if (!dragging) return
        onMove({
          x: event.clientX - dragOffsetRef.current.x,
          y: event.clientY - dragOffsetRef.current.y,
        })
      }}
      onPointerUp={() => {
        if (!dragging) return
        setDragging(false)
        onSnap()
      }}
      className={cn(
        'pointer-events-auto fixed z-50 inline-flex items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-white shadow-xl shadow-slate-950/40 backdrop-blur-xl transition-transform hover:border-sky-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
        hiddenClass,
      )}
      style={{
        left: position.x,
        top: position.y,
        width: orbSize,
        height: orbSize,
        touchAction: 'none',
      }}
    >
      <Layers3 className="h-6 w-6 text-sky-200" />
      {activeCount > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-sky-500 px-1.5 py-0.5 text-xs font-semibold">
          {activeCount}
        </span>
      ) : null}
      <span className="sr-only">{hint}</span>
    </button>
  )
}
```

- [ ] **Step 5: Extract `ShelfPanel` and wire position**

Move the expanded panel markup from `index.tsx` into `frontend/src/components/progress-shelf/shelf-panel.tsx` with props:

```ts
jobs: ActiveJobEntry[]
groupedJobs: ActiveJobEntry[]
abortingJobIds: Set<string>
onClose: () => void
onOpen: (job: ActiveJobEntry) => void
onAbort: (job: ActiveJobEntry) => void
```

In `index.tsx`, use:

```tsx
const { position, setPosition, snapToEdge, orbSize } = useShelfPosition()
```

Render the panel as fixed with a style derived from edge:

```tsx
const panelStyle = {
  right: position.edge === 'right' ? 24 : undefined,
  left: position.edge === 'left' ? 24 : undefined,
  top: position.edge === 'top' ? position.y + orbSize + 12 : undefined,
  bottom: position.edge === 'bottom' || position.edge === 'left' || position.edge === 'right' ? 96 : undefined,
}
```

Then render:

```tsx
{expanded ? <ShelfPanel ... style={panelStyle} /> : null}
<ShelfOrb
  activeCount={jobs.length}
  expanded={expanded}
  label={String(t(expanded ? 'toggle.close' : 'toggle.open'))}
  hint={jobs.length > 0 ? String(t('toggle.activeHint')) : String(t('toggle.idleHint'))}
  position={position}
  orbSize={orbSize}
  onToggle={() => setExpanded((current) => !current)}
  onMove={setPosition}
  onSnap={snapToEdge}
/>
```

- [ ] **Step 6: Run shelf tests**

Run:

```bash
cd frontend && npm test -- src/components/progress-shelf/__tests__/use-shelf-position.test.tsx src/components/progress-shelf/__tests__/progress-shelf.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit shelf interaction**

```bash
git add frontend/src/components/progress-shelf
git commit -m "feat: make progress shelf draggable"
```

---

## Task 8: I18n And Active Job Frontend Integration

**Files:**
- Modify: `frontend/src/i18n/index.ts`
- Modify: `frontend/src/hooks/use-active-jobs.ts`
- Modify: `frontend/src/components/progress-shelf/progress-row.tsx`
- Modify tests for active jobs and shelf rows

- [ ] **Step 1: Add active-job normalization test for Auto runs**

In `frontend/src/hooks/__tests__/use-active-jobs.test.ts`, add:

```ts
it('preserves active Auto run metadata from the active jobs response', async () => {
  listActiveMock.mockResolvedValue({
    active: [{
      job_id: 'auto-job-1',
      kind: 'auto_run',
      auto_run_id: 12,
      comic_id: 7,
      stage: 'render',
      status: 'running',
      title: 'Auto Run Book',
      started_at: '2026-05-11T00:00:00.000Z',
      render_progress: { completed: 1, total: 3 },
    }],
  })
  getJobMock.mockResolvedValue({
    job_id: 'auto-job-1',
    rq_status: 'running',
    auto_run: {
      id: 12,
      comic_id: 7,
      user_id: 1,
      status: 'running',
      current_stage: 'render',
      story_snapshot: 'Story',
      title_snapshot: 'Auto Run Book',
      preferences_snapshot: {},
      character_review: null,
      selected_character_ids: [],
      render_run_id: null,
      render_run: null,
      render_progress: { completed: 1, failed: 0, total: 3, current_page_number: 2 },
      abort_requested: false,
      job_id: 'auto-job-1',
      error_message: null,
      created_at: null,
      started_at: null,
      completed_at: null,
      updated_at: null,
    },
  } as any)

  const { result } = renderHook(() => useActiveJobs())

  await waitFor(() => {
    expect(result.current.jobs[0]).toMatchObject({
      kind: 'auto_run',
      auto_run_id: 12,
      stage: 'render',
      render_progress: { completed: 1, total: 3 },
    })
  })
})
```

- [ ] **Step 2: Extend active job types and normalization**

In `frontend/src/atoms` if `ActiveJobEntry` is defined there, add:

```ts
auto_run_id?: number | null
auto_run?: AutoRun | null
```

In `use-active-jobs.ts`, normalize `auto_run_id`:

```ts
auto_run_id: job.auto_run_id ?? null,
auto_run: null,
```

In `enrichJob`, read:

```ts
const autoRun = detail?.auto_run ?? job.auto_run ?? null
```

Set:

```ts
auto_run_id: autoRun?.id ?? job.auto_run_id ?? null,
auto_run: autoRun,
stage: autoRun?.current_stage ?? job.stage,
status: autoRun?.status ?? renderRun?.status ?? currentStage?.status ?? job.status,
render_progress: autoRun?.render_progress
  ? { completed: autoRun.render_progress.completed, total: autoRun.render_progress.total }
  : renderRunProgress ?? ...
```

- [ ] **Step 3: Update shelf labels for Auto runs**

In `progress-row.tsx`, update `jobTypeLabel`:

```ts
if (job.kind === 'auto_run' || job.auto_run_id || job.auto_run) return String(t('job.autoRun'))
```

Add stage fallback labels for Auto stages:

```ts
stage.characters
stage.panels
stage.layout
stage.preview
```

- [ ] **Step 4: Add i18n strings**

In `frontend/src/i18n/index.ts`, add these keys in `comics` for `zh-CN`, `zh-TW`, and `en`:

```ts
'auto.generateManga'
'auto.starting'
'auto.running.title'
'auto.running.subtitle'
'auto.running.abort'
'auto.running.pages'
'auto.stage.characters'
'auto.stage.panels'
'auto.stage.layout'
'auto.stage.render'
'auto.stage.preview'
'auto.review.title'
'auto.review.description'
'auto.review.retry'
'auto.preview.title'
'auto.preview.story'
'auto.preview.empty'
'auto.preview.export'
'auto.preview.regenerateCurrent'
'auto.preview.regenerateAll'
'auto.proSnapshotBanner'
'auto.backToProgress'
'auto.error.abortFailed'
'auto.error.retryFailed'
```

Add these keys in `progressShelf` for all locales:

```ts
'job.autoRun'
'stage.characters'
'stage.panels'
'stage.layout'
'stage.preview'
```

Use natural translations:

- zh-CN `auto.proSnapshotBanner`: `自动生成正在使用已保存的故事快照。`
- zh-TW `auto.proSnapshotBanner`: `自動生成正在使用已儲存的故事快照。`
- en `auto.proSnapshotBanner`: `Auto generation is using a saved story snapshot.`

- [ ] **Step 5: Run frontend focused tests**

Run:

```bash
cd frontend && npm test -- src/hooks/__tests__/use-active-jobs.test.ts src/components/progress-shelf/__tests__/progress-row.test.tsx src/pages/comics/auto/__tests__/auto-mode-v2.test.tsx src/pages/comics/__tests__/comics-mode.test.tsx
```

Expected: PASS. Existing React `act(...)` warnings in `use-active-jobs.test.ts` may remain unless this task also cleans them.

- [ ] **Step 6: Commit i18n and active job integration**

```bash
git add frontend/src/i18n/index.ts frontend/src/hooks/use-active-jobs.ts frontend/src/atoms.ts frontend/src/components/progress-shelf/progress-row.tsx frontend/src/hooks/__tests__/use-active-jobs.test.ts frontend/src/components/progress-shelf/__tests__/progress-row.test.tsx frontend/src/pages/comics/auto/__tests__/auto-mode-v2.test.tsx frontend/src/pages/comics/__tests__/comics-mode.test.tsx
git commit -m "feat: show auto runs in frontend status"
```

---

## Task 9: Verification, Browser QA, Build, Static Sync

**Files:**
- Modify only if verification exposes bugs.
- Static build output: `frontend/dist` and `mangasuperb/static`.

- [ ] **Step 1: Run full backend tests**

Run:

```bash
/Users/daniel/code/dev/.venv/bin/pytest -q
```

Expected: all backend tests pass. Current baseline before this work was `192 passed, 1 warning`.

- [ ] **Step 2: Run full frontend tests**

Ensure worktree has frontend dependencies available:

```bash
ln -s /Users/daniel/code/dev/frontend/node_modules frontend/node_modules
```

Then run:

```bash
cd frontend && npm test
```

Expected: all frontend tests pass. Current baseline before this work was `82 passed` with existing React `act(...)` warnings in `use-active-jobs.test.ts`.

- [ ] **Step 3: Run lint and build**

Run:

```bash
cd frontend && npm run lint
cd frontend && npm run build
```

Expected: lint exits 0 and build exits 0. Existing react-refresh warnings in shadcn UI files are acceptable only if unchanged from baseline.

- [ ] **Step 4: Replace static files**

After successful frontend build:

```bash
rsync -a --delete frontend/dist/ mangasuperb/static/
diff -qr frontend/dist mangasuperb/static
```

Expected: `diff -qr` prints no output.

- [ ] **Step 5: Browser QA with Browser plugin**

The flow under test is: `http://localhost:5001/comics` -> login as test user -> start or inspect Auto run -> active Auto run shows full-page progress with no editor -> completed Auto run shows preview -> shelf drags/snaps/opens and deep-links.

Use Browser plugin path from `frontend-testing-debugging`:

1. Start the local app on port 5001 if it is not already running.
2. Open `http://localhost:5001`.
3. Log in as `abcd@abc.com` / `11111111`.
4. Navigate to `/comics`.
5. Verify page identity, nonblank content, no framework overlay, and console health.
6. Start an Auto run with a short story if provider calls can be safely mocked or if the local environment is configured.
7. If real provider calls are not appropriate, seed an active Auto run in the test database and reload `/comics`.
8. Verify Auto running view has no story editor.
9. Switch to Pro and verify snapshot banner plus editable story.
10. Open shelf, drag orb to right edge, confirm half-hidden edge state.
11. Click shelf Auto run row and verify it routes back to Auto progress.
12. Capture desktop screenshot and one mobile-width screenshot.

- [ ] **Step 6: Clean temporary dependency symlink**

If the worktree has the symlink:

```bash
unlink frontend/node_modules
```

Then verify:

```bash
git status --short --branch
```

Expected: only intended tracked changes remain.

- [ ] **Step 7: Final commit**

If static files were changed in Task 9:

```bash
git add frontend/dist mangasuperb/static
git commit -m "build: refresh frontend static assets"
```

If fixes were made during verification, commit them with a scoped message before the static refresh commit.

---

## Self-Review Checklist

- Spec coverage:
  - Backend durable Auto run: Tasks 1-3.
  - One-click Auto run orchestration: Task 2.
  - Auto active/running/completed UX: Task 5.
  - Pro snapshot editing policy: Task 6.
  - Draggable edge-snapping shelf: Task 7.
  - Auto runs in active jobs: Tasks 3 and 8.
  - I18n: Task 8.
  - React performance guidance: Tasks 4, 5, 7, and 8 keep polling centralized, split components, and use stable dimensions.
  - Browser QA: Task 9.
- Type consistency:
  - Backend serializer uses `auto_run`.
  - Frontend type is `AutoRun`.
  - Active jobs use `kind: 'auto_run'` and `auto_run_id`.
  - Auto run statuses are `queued`, `running`, `needs_review`, `completed`, `failed`, `aborted`.
  - Auto run stages are `story`, `characters`, `panels`, `layout`, `render`, `preview`.
- Execution preference:
  - Use subagent-driven implementation with disjoint write scopes from the Parallelization Map.
