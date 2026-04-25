# Security & Hardening Fixes — Design

**Date:** 2026-04-24
**Status:** Draft (awaiting user review)
**Author:** Brainstormed with Claude

## Background

A security audit surfaced six issues across `mangasuperb/`:

1. **High** — Like endpoints leak private comic data.
2. **High** — `GET /api/jobs/<job_id>` is not owner-scoped for character jobs or unknown jobs.
3. **High** — `PATCH /api/comics/<id>` can set `is_public=true` without asset validation.
4. **Medium** — Deleting a character with comic links raises `IntegrityError`.
5. **Medium** — `POST /api/stories/enhance` calls Gemini before validating `comic_id`.
6. **Medium** — Prompt logging keys off Flask `DEBUG` (default true) and writes full user prompts.

This spec groups the fixes into three sequential PRs on a single branch, ordered by severity.

## Scope

- Three PRs, landed sequentially on one branch off the current HEAD.
- PR 1: three High findings (security / auth).
- PR 2: two Medium correctness findings (character cascade, story ownership pre-check).
- PR 3: one Medium privacy finding (prompt logging).

Out of scope:
- Unrelated WIP in the working tree (comics/stories refactor, `frontend/` tracking, `mangasuperb/static/` gitignore, `google.genai` test-patch breakage).
- Adding audit logging or rate limiting.
- Broader RBAC rework.

## PR 1 — Security hardening

### 1a. Like endpoints: owner-or-public check

**Files:** `mangasuperb/routes/comics.py`

Both `POST /api/comics/<id>/like` (line 504) and `DELETE /api/comics/<id>/like` (line 530) currently lookup the comic by ID alone and return `comic.to_dict()`. The dict includes pages, outline sections, panel shots, and layout metadata — full private content.

**Fix:**

- Gate access with: `comic.is_public or comic.user_id == current_user.id`. If neither, return `404 {"error": "Comic not found"}`.
- Response payload: when the caller is NOT the owner, return `comic.to_public_dict()` instead of `comic.to_dict()`. Owners keep the full dict.

### 1b. Job ownership on `GET /api/jobs/<id>`

**Files:** `mangasuperb/routes/jobs.py`

Currently the route (line 317) looks up ownership only via `Comic.job_id`. Character image jobs (`Character.image_job_id`) and stage jobs are not owner-scoped, and unknown job_ids fall through to a generic response that includes `worker_snapshot`.

**Fix:**

Add `@login_required` (currently missing). Resolve ownership by checking three sources, short-circuiting on the first hit:

```python
owner_found = (
    db.session.query(Comic.id)
      .filter(Comic.job_id == job_id, Comic.user_id == current_user.id).first()
    or db.session.query(ComicWorkflowStage.id).join(Comic)
      .filter(ComicWorkflowStage.job_id == job_id, Comic.user_id == current_user.id).first()
    or db.session.query(Character.id)
      .filter(Character.image_job_id == job_id, Character.user_id == current_user.id).first()
)
if not owner_found:
    return jsonify({"error": "Job not found"}), 404
```

The 404 body must NOT include `worker_snapshot`. The existing owned-path response (including `rq_status`, `worker_snapshot`, optional `comic.to_dict()` for comic jobs) is preserved.

### 1c. Remove `is_public` from PATCH; add `/unpublish`

**Files:** `mangasuperb/routes/comics.py`, `frontend/src/apis/comics.ts`

`PATCH /api/comics/<id>` currently accepts `is_public` (line 172) and flips it without the asset checks that `POST /publish` enforces. That lets a draft with no cover/PDF/ZIP become publicly listed.

**Fix:**

- `update_comic`: pop `is_public` from the request body before reading other fields. Silently ignore if present (forward-compatible with the existing type declaration).
- New route `POST /api/comics/<int:comic_id>/unpublish`: `@login_required`. Return 404 unless `comic.user_id == current_user.id`. Set `is_public = False`, commit, return `{"comic": comic.to_dict()}`. No asset validation (unpublishing a broken comic must always succeed).
- `POST /publish` is unchanged — it already runs asset validation via `enqueue_publish_workflow`.
- Frontend `apis/comics.ts`: drop `is_public` from `update()`'s body type. Add `unpublish(comicId)` that POSTs to the new endpoint. No UI callsite currently sends `is_public` through `update()`, so there is no UI migration.

### PR 1 tests

**`tests/test_comic_routes.py`** (new scenarios):
- Like a private comic owned by another user → 404.
- Unlike a private comic owned by another user → 404.
- Like a public comic owned by another user → 200, body matches `to_public_dict()` shape (no `pages`, `panel_shots`, etc.).
- Like own private comic → 200, body matches full `to_dict()` shape.
- PATCH with `is_public=true` in payload → flag unchanged.
- `POST /unpublish` on own comic → 200, `is_public=False`.
- `POST /unpublish` on another user's comic → 404.

**`tests/test_job_routes.py`** (new scenarios):
- Other user's `Comic.job_id` → 404, no `worker_snapshot` in body.
- Other user's `ComicWorkflowStage.job_id` → 404.
- Other user's `Character.image_job_id` → 404.
- Unknown job_id → 404.
- Own comic job → 200, payload includes `rq_status` and `worker_snapshot`.
- Own character job → 200.

## PR 2 — Medium correctness

### 2a. Character delete cascade

**Files:** `models.py`

`Character.comic_links` (line ~281) has no cascade. Deleting a character tries to NULL-out `comic_characters.character_id`, violating the NOT NULL constraint.

**Fix:**

```python
comic_links = db.relationship(
    "ComicCharacter",
    back_populates="character",
    lazy=True,
    cascade="all, delete-orphan",
)
```

Matches the pattern already used on `Comic.workflow_stages`. No schema migration; ORM handles DELETE ordering.

### 2b. Story enhancement: validate `comic_id` before Gemini

**Files:** `mangasuperb/routes/stories.py`

`enhance_story` (line ~48) calls `enhance_story_text(...)` — an external Gemini call — before parsing/loading `comic_id`. Invalid or unauthorized IDs still consume API spend.

**Fix:** move the `comic_id` validation block before the Gemini call:

```python
comic = None
if comic_id_raw is not None:
    try:
        comic_id = int(comic_id_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "comic_id must be an integer"}), 400
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

try:
    enhanced_story = enhance_story_text(story_text)
except ValueError as exc:
    return jsonify({"error": str(exc)}), 400
except Exception:
    current_app.logger.exception("Story enhancement failed")
    return jsonify({"error": "Failed to enhance story"}), 502

if comic is not None:
    # (existing script-upsert logic, using the pre-loaded comic)
```

### PR 2 tests

**`tests/test_character_routes.py`** (new scenario):
- Create character, link to a comic via `ComicCharacter`, `DELETE /api/characters/<id>` → 200. Assert character row is gone, bridge rows are gone, comic row still exists.

**`tests/test_story_panel_routes.py`** (new scenario):
- `POST /api/stories/enhance` with `comic_id` for a comic owned by another user → 404. Patch `enhance_story_text` with a mock and assert `mock.called is False`.
- `POST /api/stories/enhance` with a non-integer `comic_id` → 400. Same mock-not-called assertion.

## PR 3 — Prompt logging hardening

### 3a. Decouple from Flask DEBUG and truncate

**Files:** `mangasuperb/services/generation.py`, `.env.example`

`_debug_logging_enabled()` (line 104) falls back to Flask `DEBUG`, which defaults to `True` (`config.py:16`). That means production-ish configs still log full user prompts by default unless the operator overrides `FLASK_DEBUG`.

**Fix:**

Replace the helper:

```python
def _prompt_logging_enabled() -> bool:
    return os.getenv("LOG_PROMPTS", "").strip().lower() == "true"
```

Remove the Flask-config fallback entirely. Rename all callers from `_debug_logging_enabled` to `_prompt_logging_enabled`.

Add a truncation helper at module scope:

```python
_PROMPT_LOG_LIMIT = 200

def _truncate_for_log(text: str) -> str:
    if len(text) <= _PROMPT_LOG_LIMIT:
        return text
    omitted = len(text) - _PROMPT_LOG_LIMIT
    return f"{text[:_PROMPT_LOG_LIMIT]}... [truncated {omitted} chars]"
```

Wire `_truncate_for_log` into:
- `_summarize_content_part` for the `[text N]` and string/`dict` branches that emit raw user text.
- Any other logging site inside `generation.py` that writes a prompt body (grep for the log calls gated by the old helper).

### 3b. `.env.example`

Append at the end:

```
# Log outbound Gemini prompts. Prompts are truncated to the first 200 chars when logged. Default off.
LOG_PROMPTS=false
```

### PR 3 tests

**`tests/test_generation_logging.py`** (new file):
- `LOG_PROMPTS=true` + a prompt longer than 200 chars: capture logs with `caplog`; assert the record contains the `... [truncated N chars]` marker and does NOT contain the suffix of the original text.
- `LOG_PROMPTS=false`: `caplog` shows no prompt body even with `FLASK_DEBUG=true` set via `monkeypatch`.
- `LOG_PROMPTS` unset: same as `false`.

All three tests drive `_summarize_content_part` directly — no Gemini client mock required.

## Sequencing

All three PRs land on one dedicated branch off the current HEAD (not `aidev`, which carries unrelated WIP). Each PR is a separate commit set on that branch; split into GitHub PRs at review time, or cut three small branches from it if reviewers prefer.

Order: PR 1 → PR 2 → PR 3. PR 2 and PR 3 do not touch files modified by PR 1, so rebases stay clean.

## Non-goals

- No rate limiting on like/unlike endpoints.
- No schema migration; all fixes are ORM/application-level.
- No audit log for is_public transitions.
- No removal of the existing `FLASK_DEBUG` default (`config.py:16`) — changing that is out of scope for this work and should be addressed separately.
- No changes to `POST /publish` behavior; existing asset validation remains the single publish gate.

## Risk and rollback

- PR 1c removes `is_public` from an API surface. Verified no frontend callsite currently sends it via `update()`. Type-only change on the client.
- PR 2a cascade addition is ORM-only; no migration. If a deploy needs rollback, reverting the model change restores prior behavior (and restores the bug).
- PR 3 defaults logging off — an operator who relied on `FLASK_DEBUG=true` for prompt logs must now set `LOG_PROMPTS=true`. Called out in the PR description.
