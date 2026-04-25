# Security And Hardening Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six security and correctness issues from `docs/superpowers/specs/2026-04-24-security-and-hardening-fixes-design.md` without changing unrelated WIP behavior.

**Architecture:** Keep the fixes at the existing Flask route/model boundaries. Authorization is enforced before RQ/job metadata is read, public comic responses use the existing `to_public_dict()` contract, and prompt logging is opt-in through a dedicated env var. Tests are added at the route/service level because the defects are API behavior and ORM behavior, not UI rendering defects.

**Tech Stack:** Flask 3, flask-login, Flask-SQLAlchemy, RQ, pytest, React/Vite TypeScript client types.

**Reference spec:** `docs/superpowers/specs/2026-04-24-security-and-hardening-fixes-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `mangasuperb/routes/comics.py` | Modify | Gate like/unlike with owner-or-public access, return public payloads for non-owners, ignore `is_public` in PATCH, add `/unpublish`. |
| `swagger.py` | Modify | Add Swagger metadata for `POST /api/comics/<id>/unpublish`. |
| `frontend/src/apis/comics.ts` | Modify | Remove `is_public` from `update()` body type and add `unpublish(comicId)`. |
| `mangasuperb/routes/jobs.py` | Modify | Owner-scope `GET /api/jobs/<job_id>` across comic, stage, and character jobs; return 404 for unknown jobs. |
| `models.py` | Modify | Cascade delete `Character.comic_links` bridge rows. |
| `mangasuperb/routes/stories.py` | Modify | Validate optional `comic_id` before calling Gemini. |
| `mangasuperb/services/generation.py` | Modify | Replace DEBUG-based prompt logging with opt-in `LOG_PROMPTS`; truncate logged prompt text. |
| `.env.example` | Modify | Document `LOG_PROMPTS=false`. |
| `tests/test_comic_routes.py` | Modify | Cover like/unlike privacy, public vs owner response shape, PATCH ignore, and unpublish. |
| `tests/test_job_routes.py` | Modify | Cover owned and unowned comic/stage/character job status paths plus unknown jobs. |
| `tests/test_character_routes.py` | Modify | Cover deleting linked characters without deleting comics. |
| `tests/test_story_panel_routes.py` | Modify | Cover story enhancement rejecting bad/unauthorized `comic_id` before Gemini. |
| `tests/test_generation_logging.py` | Create | Cover opt-in prompt logging and truncation. |

---

## PR 1: Security Hardening

### Task 1: Like/Unlike Owner-Or-Public Access

**Files:**
- Modify: `tests/test_comic_routes.py`
- Modify: `mangasuperb/routes/comics.py:504`

- [ ] **Step 1.1: Write failing tests for private comic like/unlike leakage**

Append these tests to `tests/test_comic_routes.py` after `test_delete_comic_unauthorized`:

```python
def test_like_private_comic_owned_by_other_user_returns_404(app: Flask, auth_client) -> None:
    with app.app_context():
        other = User(username="private-owner", email="private-owner@example.com", password_hash="x")
        db.session.add(other)
        db.session.flush()
        comic = _create_comic_with_script(other.id, "Private Comic")
        comic.is_public = False
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(f"/api/comics/{comic_id}/like")

    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Comic not found"


def test_unlike_private_comic_owned_by_other_user_returns_404(app: Flask, auth_client) -> None:
    with app.app_context():
        other = User(username="private-owner-2", email="private-owner-2@example.com", password_hash="x")
        db.session.add(other)
        db.session.flush()
        comic = _create_comic_with_script(other.id, "Private Comic")
        comic.is_public = False
        db.session.commit()
        comic_id = comic.id

    response = auth_client.delete(f"/api/comics/{comic_id}/like")

    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Comic not found"
```

- [ ] **Step 1.2: Write failing tests for public-vs-owner response shape**

Append these tests to `tests/test_comic_routes.py` after the tests from Step 1.1:

```python
def test_like_public_comic_owned_by_other_user_returns_public_payload(app: Flask, auth_client) -> None:
    with app.app_context():
        other = User(username="public-owner", email="public-owner@example.com", password_hash="x")
        db.session.add(other)
        db.session.flush()
        comic = _create_comic_with_script(other.id, "Public Comic")
        comic.is_public = True
        comic.cover_image_url = "https://cdn.example.com/cover.png"
        comic.pdf_url = "https://cdn.example.com/book.pdf"
        comic.zip_url = "https://cdn.example.com/book.zip"
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(f"/api/comics/{comic_id}/like")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["like_count"] == 1
    assert payload["comic"]["id"] == comic_id
    assert payload["comic"]["title"] == "Public Comic"
    assert "pages" not in payload["comic"]
    assert "workflow_stages" not in payload["comic"]
    assert "outline_sections" not in payload["comic"]
    assert "panel_shots" not in payload["comic"]
    assert "page_layouts" not in payload["comic"]
    assert "characters" not in payload["comic"]


def test_like_own_private_comic_returns_full_payload(app: Flask, auth_client, user) -> None:
    with app.app_context():
        comic = _create_comic_with_script(user.id, "Own Private Comic")
        comic.is_public = False
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(f"/api/comics/{comic_id}/like")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["like_count"] == 1
    assert payload["comic"]["id"] == comic_id
    assert "pages" in payload["comic"]
    assert "workflow_stages" in payload["comic"]
    assert "outline_sections" in payload["comic"]
    assert "panel_shots" in payload["comic"]
    assert "page_layouts" in payload["comic"]
```

- [ ] **Step 1.3: Run tests and confirm the leakage is reproduced**

Run:

```bash
.venv/bin/python -m pytest tests/test_comic_routes.py -k "like_private or unlike_private or like_public or like_own" -v
```

Expected: the private-comic tests fail with `200 != 404`, and the public response-shape test fails because the current route returns full `to_dict()` data.

- [ ] **Step 1.4: Add helper functions for comic access and like payload shape**

In `mangasuperb/routes/comics.py`, add these helpers after `bp = Blueprint("comics", __name__, url_prefix="/api/comics")`:

```python
def _can_access_comic(comic: Comic) -> bool:
    return comic.user_id == current_user.id or comic.is_public


def _serialize_comic_for_current_like_view(comic: Comic) -> dict[str, Any]:
    if comic.user_id == current_user.id:
        return comic.to_dict()
    return comic.to_public_dict()
```

- [ ] **Step 1.5: Replace like/unlike implementations with owner-or-public checks**

Replace `like_comic` and `unlike_comic` in `mangasuperb/routes/comics.py` with:

```python
@bp.post("/<int:comic_id>/like")
@login_required
@swag_from(COMIC_LIKE_DOC)
def like_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or not _can_access_comic(comic):
        return jsonify({"error": "Comic not found"}), 404

    existing = ComicLike.query.filter_by(comic_id=comic_id, user_id=current_user.id).first()
    if not existing:
        try:
            db.session.add(ComicLike(comic_id=comic_id, user_id=current_user.id))
            db.session.commit()
        except Exception:  # pragma: no cover - integrity guard
            db.session.rollback()

    like_count = (
        db.session.query(func.count(ComicLike.id)).filter_by(comic_id=comic_id).scalar() or 0
    )

    comic = db.session.get(Comic, comic_id)
    comic._user_liked = True
    comic._like_count = int(like_count)
    return (
        jsonify(
            {
                "comic": _serialize_comic_for_current_like_view(comic),
                "like_count": like_count,
            }
        ),
        200,
    )


@bp.delete("/<int:comic_id>/like")
@login_required
@swag_from(COMIC_UNLIKE_DOC)
def unlike_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or not _can_access_comic(comic):
        return jsonify({"error": "Comic not found"}), 404

    existing = ComicLike.query.filter_by(comic_id=comic_id, user_id=current_user.id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()

    like_count = (
        db.session.query(func.count(ComicLike.id)).filter_by(comic_id=comic_id).scalar() or 0
    )

    comic = db.session.get(Comic, comic_id)
    comic._user_liked = False
    comic._like_count = int(like_count)
    return (
        jsonify(
            {
                "comic": _serialize_comic_for_current_like_view(comic),
                "like_count": like_count,
            }
        ),
        200,
    )
```

- [ ] **Step 1.6: Run focused tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_comic_routes.py -k "like_private or unlike_private or like_public or like_own" -v
```

Expected: all four tests pass.

- [ ] **Step 1.7: Commit PR 1a**

```bash
git add mangasuperb/routes/comics.py tests/test_comic_routes.py
git commit -m "comics: restrict likes to owned or public comics"
```

### Task 2: Job Status Ownership

**Files:**
- Modify: `tests/test_job_routes.py`
- Modify: `mangasuperb/routes/jobs.py:322`

- [ ] **Step 2.1: Add route import and RQ fetch helper to job route tests**

In `tests/test_job_routes.py`, add this import next to the existing service import:

```python
from mangasuperb.routes import jobs as job_routes
```

Add this helper after `_create_stage`:

```python
def _patch_rq_fetch(monkeypatch) -> None:
    monkeypatch.setattr(
        job_routes.Job,
        "fetch",
        lambda job_id, connection: SimpleNamespace(get_status=lambda: "queued"),
    )
```

- [ ] **Step 2.2: Write failing tests for unowned and unknown jobs**

Append these tests to `tests/test_job_routes.py`:

```python
def test_job_status_does_not_expose_other_users_stage_job(app, auth_client):
    with app.app_context():
        other = User(username="stage-owner", email="stage-owner@example.com", password_hash="x")
        db.session.add(other)
        db.session.commit()
        comic = _create_comic_simple(other.id, title="Private Stage Job")
        _create_stage(comic.id, "render", "in_progress", "stage-secret")

    response = auth_client.get("/api/jobs/stage-secret")

    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload


def test_job_status_does_not_expose_other_users_character_job(app, auth_client):
    with app.app_context():
        other = User(username="character-owner", email="character-owner@example.com", password_hash="x")
        db.session.add(other)
        db.session.commit()
        character = _create_character(app, other.id)
        character.image_job_id = "character-secret"
        db.session.commit()

    response = auth_client.get("/api/jobs/character-secret")

    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload


def test_job_status_unknown_job_returns_404_without_worker_snapshot(auth_client):
    response = auth_client.get("/api/jobs/not-owned-or-known")

    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Job not found"
    assert "worker_snapshot" not in payload
```

- [ ] **Step 2.3: Write tests for owned comic and character jobs**

Append these tests to `tests/test_job_routes.py`:

```python
def test_job_status_returns_owned_comic_job(app, auth_client, user, monkeypatch):
    _patch_rq_fetch(monkeypatch)
    with app.app_context():
        comic = _create_comic_simple(user.id, title="Owned Comic Job")
        comic.job_id = "owned-comic-job"
        db.session.commit()
        comic_id = comic.id

    response = auth_client.get("/api/jobs/owned-comic-job")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["job_id"] == "owned-comic-job"
    assert payload["rq_status"] == "queued"
    assert "worker_snapshot" in payload
    assert payload["comic"]["id"] == comic_id


def test_job_status_returns_owned_character_job(app, auth_client, user, monkeypatch):
    _patch_rq_fetch(monkeypatch)
    with app.app_context():
        character = _create_character(app, user.id)
        character.image_job_id = "owned-character-job"
        db.session.commit()

    response = auth_client.get("/api/jobs/owned-character-job")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["job_id"] == "owned-character-job"
    assert payload["rq_status"] == "queued"
    assert "worker_snapshot" in payload
    assert "comic" not in payload
```

- [ ] **Step 2.4: Run tests and confirm current route leaks unknown/character jobs**

Run:

```bash
.venv/bin/python -m pytest tests/test_job_routes.py -k "job_status" -v
```

Expected: unknown and unowned character/stage job tests fail because the current route returns generic status data instead of 404.

- [ ] **Step 2.5: Replace `get_job_status` with owner-scoped resolution**

Replace `get_job_status` in `mangasuperb/routes/jobs.py` with:

```python
@bp.get("/<job_id>")
@login_required
@swag_from(JOB_STATUS_DOC)
def get_job_status(job_id: str) -> Any:
    try:
        comic = Comic.query.filter_by(job_id=job_id, user_id=current_user.id).first()
        if not comic:
            stage_match = (
                db.session.query(ComicWorkflowStage, Comic)
                .join(Comic, ComicWorkflowStage.comic_id == Comic.id)
                .filter(
                    ComicWorkflowStage.job_id == job_id,
                    Comic.user_id == current_user.id,
                )
                .first()
            )
            if stage_match:
                _, comic = stage_match

        character = None
        if not comic:
            character = Character.query.filter_by(
                image_job_id=job_id,
                user_id=current_user.id,
            ).first()

        if not comic and not character:
            return jsonify({"error": "Job not found"}), 404

        try:
            job = Job.fetch(job_id, connection=current_app.extensions["redis_conn"])
            rq_status = job.get_status()
        except Exception as exc:
            logger.error("Failed to fetch RQ job: %s", exc)
            rq_status = "unknown"

        worker_snapshot = _queue_worker_snapshot()
        response = {
            "job_id": job_id,
            "rq_status": rq_status,
            "worker_snapshot": worker_snapshot,
        }
        if comic:
            response["comic"] = comic.to_dict()
        if worker_snapshot.get("active", 0) == 0:
            response["warning"] = "No active RQ workers detected; job will remain queued."

        return jsonify(response), 200

    except Exception as exc:  # pragma: no cover - unexpected failure
        logger.error("Error getting job status: %s", exc)
        return jsonify({"error": str(exc)}), 500
```

- [ ] **Step 2.6: Run focused tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_job_routes.py -k "job_status" -v
```

Expected: all job status tests pass.

- [ ] **Step 2.7: Commit PR 1b**

```bash
git add mangasuperb/routes/jobs.py tests/test_job_routes.py
git commit -m "jobs: owner-scope job status lookups"
```

### Task 3: Remove Public Toggle From PATCH And Add Unpublish

**Files:**
- Modify: `tests/test_comic_routes.py`
- Modify: `mangasuperb/routes/comics.py:145`
- Modify: `swagger.py`
- Modify: `frontend/src/apis/comics.ts`

- [ ] **Step 3.1: Replace the existing public PATCH test**

In `tests/test_comic_routes.py`, replace `test_update_comic_is_public` with:

```python
def test_update_comic_ignores_is_public(app: Flask, auth_client, user) -> None:
    """PATCH should not publish or unpublish comics."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id)
        assert comic.is_public is False
        db.session.commit()
        comic_id = comic.id

    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={"is_public": True, "title": "Updated Title"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["comic"]["title"] == "Updated Title"
    assert data["comic"]["is_public"] is False

    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.title == "Updated Title"
        assert persisted.is_public is False
```

- [ ] **Step 3.2: Add unpublish tests**

At the top of `tests/test_comic_routes.py`, add:

```python
from datetime import datetime
```

Append these tests near the other delete/update tests:

```python
def test_unpublish_owned_comic_sets_private(app: Flask, auth_client, user) -> None:
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id, "Published Comic")
        comic.is_public = True
        comic.published_at = datetime.utcnow()
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(f"/api/comics/{comic_id}/unpublish")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["comic"]["id"] == comic_id
    assert payload["comic"]["is_public"] is False
    assert payload["comic"]["published_at"] is None

    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.is_public is False
        assert persisted.published_at is None


def test_unpublish_requires_owner(app: Flask, auth_client) -> None:
    with app.app_context():
        other = User(username="unpublish-owner", email="unpublish-owner@example.com", password_hash="x")
        db.session.add(other)
        db.session.flush()
        comic = _create_comic_with_script(other.id, "Protected Published Comic")
        comic.is_public = True
        comic.published_at = datetime.utcnow()
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(f"/api/comics/{comic_id}/unpublish")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Comic not found"
```

- [ ] **Step 3.3: Run tests and confirm current behavior fails**

Run:

```bash
.venv/bin/python -m pytest tests/test_comic_routes.py -k "ignores_is_public or unpublish" -v
```

Expected: `test_update_comic_ignores_is_public` fails because PATCH currently sets the flag, and unpublish tests fail with 404 because the route does not exist.

- [ ] **Step 3.4: Ignore `is_public` in PATCH**

In `mangasuperb/routes/comics.py`, change:

```python
    data = request.get_json(silent=True) or {}
```

to:

```python
    data = dict(request.get_json(silent=True) or {})
    data.pop("is_public", None)
```

Then remove this block from `update_comic`:

```python
    # Update is_public if provided
    is_public = data.get("is_public")
    if is_public is not None:
        comic.is_public = bool(is_public)
```

- [ ] **Step 3.5: Add Swagger doc for unpublish**

In `swagger.py`, add this after `COMIC_PUBLISH_DOC`:

```python
COMIC_UNPUBLISH_DOC = {
    'tags': ['Comics'],
    'summary': 'Unpublish comic',
    'description': 'Marks an owned comic as private without requiring export assets.',
    'parameters': [
        {
            'name': 'comic_id',
            'in': 'path',
            'required': True,
            'type': 'integer',
        }
    ],
    'responses': {
        '200': {
            'description': 'Comic unpublished successfully',
            'schema': {
                'type': 'object',
                'properties': {
                    'comic': COMIC_CREATE_DOC['responses']['201']['schema']['properties']['comic'],
                },
            },
        },
        '404': {'description': 'Comic not found'},
        '500': {'description': 'Unpublish failed'},
    },
    'security': [{'sessionCookie': []}],
}
```

Add `'COMIC_UNPUBLISH_DOC',` to `__all__`.

- [ ] **Step 3.6: Add the unpublish route**

In `mangasuperb/routes/comics.py`, add `COMIC_UNPUBLISH_DOC` to the existing Swagger import list. Add this route after `publish_comic`:

```python
@bp.post("/<int:comic_id>/unpublish")
@login_required
@swag_from(COMIC_UNPUBLISH_DOC)
def unpublish_comic(comic_id: int) -> Any:
    comic = db.session.get(Comic, comic_id)
    if not comic or comic.user_id != current_user.id:
        return jsonify({"error": "Comic not found"}), 404

    try:
        comic.is_public = False
        comic.published_at = None
        db.session.commit()
        db.session.refresh(comic)
        comic._like_count = len(comic.likes) if comic.likes else 0
        comic._user_liked = any(like.user_id == current_user.id for like in comic.likes)
        return jsonify({"comic": comic.to_dict()}), 200
    except Exception as exc:  # pragma: no cover - database failure
        db.session.rollback()
        logger.exception("Failed to unpublish comic_id=%s: %s", comic_id, exc)
        return jsonify({"error": "Failed to unpublish comic"}), 500
```

- [ ] **Step 3.7: Update frontend API typing**

In `frontend/src/apis/comics.ts`, replace the `update` signature with:

```typescript
  // Update editable comic metadata
  update(comicId: number, body: Partial<{ title: string; style_description: string }>) {
    return request<typeof body, { comic: IComic }>({
      url: `/api/comics/${comicId}`,
      method: 'PATCH',
      data: body,
    })
  },
```

Add this method after `publish`:

```typescript
  unpublish(comicId: number) {
    return request<void, { comic: IComic }>({
      url: `/api/comics/${comicId}/unpublish`,
      method: 'POST',
    })
  },
```

- [ ] **Step 3.8: Run focused tests and TypeScript**

Run:

```bash
.venv/bin/python -m pytest tests/test_comic_routes.py -k "ignores_is_public or unpublish" -v
cd frontend && npx tsc --noEmit
```

Expected: focused pytest passes, and TypeScript exits with status 0.

- [ ] **Step 3.9: Commit PR 1c**

```bash
git add mangasuperb/routes/comics.py swagger.py frontend/src/apis/comics.ts tests/test_comic_routes.py
git commit -m "comics: keep publish state behind publish endpoints"
```

## PR 2: Medium Correctness

### Task 4: Character Delete Cascade

**Files:**
- Modify: `tests/test_character_routes.py`
- Modify: `models.py:281`

- [ ] **Step 4.1: Add model imports for linked-character delete test**

In `tests/test_character_routes.py`, extend the model import to include:

```python
from models import Character, Comic, ComicCharacter, Script, User
```

- [ ] **Step 4.2: Write failing test for deleting a linked character**

Append this test to `tests/test_character_routes.py`:

```python
def test_delete_character_removes_comic_links_without_deleting_comic(
    app: Flask,
    auth_client,
    user: Any,
) -> None:
    with app.app_context():
        owner = db.session.get(User, user.id)
        assert owner is not None
        character = _make_character(user_id=owner.id, name="Linked Hero")
        script = Script(user_id=owner.id, title="Linked Comic", content="{}")
        comic = Comic(user_id=owner.id, script=script, title="Linked Comic")
        db.session.add_all([script, comic])
        db.session.flush()
        link = ComicCharacter(comic=comic, character=character, order_index=1)
        db.session.add(link)
        db.session.commit()
        character_id = character.id
        comic_id = comic.id

    response = auth_client.delete(f"/api/characters/{character_id}")

    assert response.status_code == 200
    assert response.get_json()["message"] == "Character deleted"

    with app.app_context():
        assert db.session.get(Character, character_id) is None
        assert db.session.get(Comic, comic_id) is not None
        assert ComicCharacter.query.filter_by(character_id=character_id).count() == 0
```

- [ ] **Step 4.3: Run test and confirm IntegrityError path**

Run:

```bash
.venv/bin/python -m pytest tests/test_character_routes.py::test_delete_character_removes_comic_links_without_deleting_comic -v
```

Expected: FAIL with a 500 response from the delete route because SQLAlchemy tries to set `comic_characters.character_id` to `NULL`.

- [ ] **Step 4.4: Add cascade to `Character.comic_links`**

In `models.py`, replace the `comic_links` relationship on `Character` with:

```python
    comic_links = db.relationship(
        "ComicCharacter",
        back_populates="character",
        lazy=True,
        cascade="all, delete-orphan",
    )
```

- [ ] **Step 4.5: Run focused test**

Run:

```bash
.venv/bin/python -m pytest tests/test_character_routes.py::test_delete_character_removes_comic_links_without_deleting_comic -v
```

Expected: PASS.

- [ ] **Step 4.6: Commit PR 2a**

```bash
git add models.py tests/test_character_routes.py
git commit -m "characters: delete comic links with characters"
```

### Task 5: Story Enhance Validates Comic Before Gemini

**Files:**
- Modify: `tests/test_story_panel_routes.py`
- Modify: `mangasuperb/routes/stories.py:39`

- [ ] **Step 5.1: Add Mock import**

In `tests/test_story_panel_routes.py`, add:

```python
from unittest.mock import Mock
```

- [ ] **Step 5.2: Write failing tests for pre-Gemini validation**

Append these tests near the existing story enhancement tests in `tests/test_story_panel_routes.py`:

```python
def test_enhance_story_rejects_other_users_comic_before_gemini(
    app,
    auth_client,
    monkeypatch,
) -> None:
    enhance_mock = Mock(return_value="should not be used")
    monkeypatch.setattr(stories, "enhance_story_text", enhance_mock)

    with app.app_context():
        other = User(username="story-owner", email="story-owner@example.com", password_hash="x")
        db.session.add(other)
        db.session.flush()
        script = Script(user_id=other.id, title="Other", content=json.dumps({"story": "secret"}))
        comic = Comic(user_id=other.id, script=script, title="Other Comic")
        db.session.add_all([script, comic])
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(
        "/api/stories/enhance",
        json={"story": "please enhance", "comic_id": comic_id},
    )

    assert response.status_code == 404
    assert response.get_json()["error"] == "Comic not found"
    enhance_mock.assert_not_called()


def test_enhance_story_rejects_non_integer_comic_id_before_gemini(
    auth_client,
    monkeypatch,
) -> None:
    enhance_mock = Mock(return_value="should not be used")
    monkeypatch.setattr(stories, "enhance_story_text", enhance_mock)

    response = auth_client.post(
        "/api/stories/enhance",
        json={"story": "please enhance", "comic_id": "not-an-int"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "comic_id must be an integer"
    enhance_mock.assert_not_called()
```

- [ ] **Step 5.3: Run tests and confirm current route calls Gemini too early**

Run:

```bash
.venv/bin/python -m pytest tests/test_story_panel_routes.py -k "before_gemini" -v
```

Expected: both tests fail because `enhance_story_text` is called before `comic_id` validation.

- [ ] **Step 5.4: Replace `enhance_story_inline` with pre-validation**

Replace `enhance_story_inline` in `mangasuperb/routes/stories.py` with:

```python
@bp.post("/enhance")
@login_required
@swag_from(STORY_ENHANCE_DOC)
def enhance_story_inline() -> Any:
    payload = request.get_json(silent=True) or {}
    story_text = (payload.get("story") or "").strip()
    if not story_text:
        return jsonify({"error": "Story text is required"}), 400

    comic_payload: dict[str, Any] | None = None
    comic_id_raw = payload.get("comic_id")
    comic: Comic | None = None

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
    except Exception as exc:  # pragma: no cover - external failure
        current_app.logger.exception("Story enhancement failed: %s", exc)
        return jsonify({"error": "Failed to enhance story"}), 502

    if comic is not None:
        try:
            script = comic.script
            if not script:
                script = Script(
                    user_id=current_user.id,
                    title=comic.title or "Untitled",
                    content="",
                )
                comic.script = script
                db.session.add(script)

            script_payload: dict[str, Any]
            if script.content:
                try:
                    script_payload = json.loads(script.content)
                except json.JSONDecodeError:
                    script_payload = {}
            else:
                script_payload = {}

            script_payload["story"] = enhanced_story
            script_payload.pop("panels", None)
            script_payload.pop("outline_sections", None)
            script.content = json.dumps(script_payload, ensure_ascii=False)
            comic.status = "pending"
            comic.workflow_stage = "outline"
            comic.workflow_status = "pending"
            comic.error_message = None
            db.session.commit()
            db.session.refresh(comic)
            comic_payload = comic.to_dict()
        except Exception as exc:  # pragma: no cover - database failure
            db.session.rollback()
            current_app.logger.exception("Failed to update story for comic_id=%s: %s", comic.id, exc)
            return jsonify({"error": "Failed to persist enhanced story"}), 500

    return jsonify({"story": enhanced_story, "comic": comic_payload}), 200
```

- [ ] **Step 5.5: Run focused tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_story_panel_routes.py -k "enhance_story" -v
```

Expected: all story enhancement tests pass.

- [ ] **Step 5.6: Commit PR 2b**

```bash
git add mangasuperb/routes/stories.py tests/test_story_panel_routes.py
git commit -m "stories: validate comic before enhancement"
```

## PR 3: Prompt Logging Hardening

### Task 6: Opt-In Prompt Logging With Truncation

**Files:**
- Create: `tests/test_generation_logging.py`
- Modify: `mangasuperb/services/generation.py:104`
- Modify: `.env.example`

- [ ] **Step 6.1: Create prompt logging tests**

Create `tests/test_generation_logging.py` with:

```python
"""Tests for Gemini prompt logging safeguards."""
from __future__ import annotations

from pathlib import Path

from mangasuperb.services import generation


def _prompt_log_path(root: Path) -> Path:
    return root / "logs" / "gemini_prompts.log"


def test_prompt_logging_truncates_long_text(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("LOG_PROMPTS", "true")
    text = ("a" * 220) + "SECRET_SUFFIX"

    generation.log_gemini_contents([text], "test-model", context="unit")

    content = _prompt_log_path(tmp_path).read_text(encoding="utf-8")
    assert "[text 1] " + ("a" * 200) in content
    assert "... [truncated " in content
    assert "SECRET_SUFFIX" not in content


def test_prompt_logging_false_ignores_flask_debug(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("LOG_PROMPTS", "false")
    monkeypatch.setenv("FLASK_DEBUG", "true")

    generation.log_gemini_contents(["SECRET_PROMPT"], "test-model", context="unit")

    assert not _prompt_log_path(tmp_path).exists()


def test_prompt_logging_unset_is_disabled(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LOG_PROMPTS", raising=False)
    monkeypatch.setenv("FLASK_DEBUG", "true")

    generation.log_gemini_contents(["SECRET_PROMPT"], "test-model", context="unit")

    assert not _prompt_log_path(tmp_path).exists()
```

- [ ] **Step 6.2: Run tests and confirm current logging is DEBUG-driven**

Run:

```bash
.venv/bin/python -m pytest tests/test_generation_logging.py -v
```

Expected: `LOG_PROMPTS=true` truncation test fails because truncation is missing; disabled tests fail when `FLASK_DEBUG=true` still enables prompt logging.

- [ ] **Step 6.3: Replace DEBUG-based helper with LOG_PROMPTS helper and truncation**

In `mangasuperb/services/generation.py`, replace `_debug_logging_enabled` and add the truncation helper:

```python
_PROMPT_LOG_LIMIT = 200


def _prompt_logging_enabled() -> bool:
    return os.getenv("LOG_PROMPTS", "").strip().lower() == "true"


def _truncate_for_log(text: str) -> str:
    if len(text) <= _PROMPT_LOG_LIMIT:
        return text
    omitted = len(text) - _PROMPT_LOG_LIMIT
    return f"{text[:_PROMPT_LOG_LIMIT]}... [truncated {omitted} chars]"
```

- [ ] **Step 6.4: Truncate text branches in `_summarize_content_part`**

Replace `_summarize_content_part` with:

```python
def _summarize_content_part(part: Any, idx: int) -> str:
    if part is None:
        return f"[part {idx}] <empty>"

    if isinstance(part, str):
        return f"[text {idx}] {_truncate_for_log(part)}"

    if isinstance(part, dict):
        if "text" in part and isinstance(part["text"], str):
            return f"[text {idx}] {_truncate_for_log(part['text'])}"

        inline = part.get("inline_data")
        if inline:
            mime = inline.get("mime_type") or "unknown"
            data = inline.get("data") or b""
            length = len(data) if isinstance(data, (bytes, bytearray)) else len(str(data))
            return f"[image {idx}] mime={mime} bytes={length}"

    return f"[part {idx}] {_truncate_for_log(repr(part))}"
```

- [ ] **Step 6.5: Wire the new helper into prompt logging**

In `log_gemini_contents`, replace:

```python
    if not _debug_logging_enabled():
        return
```

with:

```python
    if not _prompt_logging_enabled():
        return
```

Run this grep to verify no old helper remains:

```bash
rg "_debug_logging_enabled|_prompt_logging_enabled|_truncate_for_log" mangasuperb/services/generation.py
```

Expected: `_debug_logging_enabled` does not appear; `_prompt_logging_enabled` appears in its definition and in `log_gemini_contents`; `_truncate_for_log` appears in its definition and `_summarize_content_part`.

- [ ] **Step 6.6: Document the env var**

Append this to `.env.example`:

```dotenv

# Log outbound Gemini prompts. Prompts are truncated to the first 200 chars when logged. Default off.
LOG_PROMPTS=false
```

- [ ] **Step 6.7: Run focused tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_generation_logging.py -v
```

Expected: all three prompt logging tests pass.

- [ ] **Step 6.8: Commit PR 3**

```bash
git add .env.example mangasuperb/services/generation.py tests/test_generation_logging.py
git commit -m "generation: make prompt logging opt-in and truncated"
```

## Final Verification

### Task 7: Whole-Branch Verification

**Files:**
- No new file edits unless a verification command exposes a concrete defect.

- [ ] **Step 7.1: Run full backend tests**

Run:

```bash
.venv/bin/python -m pytest -q
```

Expected: all tests pass. The current suite may emit `datetime.utcnow()` deprecation warnings; those warnings are not part of this hardening scope.

- [ ] **Step 7.2: Run focused Ruff on touched Python files**

Run:

```bash
.venv/bin/python -m ruff check \
  mangasuperb/routes/comics.py \
  mangasuperb/routes/jobs.py \
  mangasuperb/routes/characters.py \
  mangasuperb/routes/stories.py \
  mangasuperb/services/generation.py \
  models.py \
  tests/test_comic_routes.py \
  tests/test_job_routes.py \
  tests/test_character_routes.py \
  tests/test_story_panel_routes.py \
  tests/test_generation_logging.py
```

Expected: `All checks passed!`

- [ ] **Step 7.3: Run frontend type-check**

Run:

```bash
cd frontend && npx tsc --noEmit
```

Expected: command exits 0 with no TypeScript errors.

- [ ] **Step 7.4: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds. If the environment is still on Node 18.19.1, Vite prints its known Node 20.19+ warning before completing.

- [ ] **Step 7.5: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git diff --check
```

Expected: the stat includes only the planned files, and `git diff --check` exits 0.

---

## Self-Review

**Spec coverage:** PR 1a is Task 1, PR 1b is Task 2, PR 1c is Task 3, PR 2a is Task 4, PR 2b is Task 5, and PR 3 is Task 6. Final verification is Task 7.

**Placeholder scan:** The plan contains concrete file paths, code snippets, commands, and expected outcomes for each task.

**Type consistency:** Backend response keys stay `comic`, `like_count`, `rq_status`, and `worker_snapshot`; frontend `ComicsApi.update()` keeps `title` and `style_description`, and new `ComicsApi.unpublish()` returns `{ comic: IComic }`.

**Spec adjustment:** The spec suggested `caplog` for prompt logging tests, but the implementation writes prompt bodies to `logs/gemini_prompts.log`. Task 6 tests the real file-writing behavior under `tmp_path`, which verifies the same privacy requirements without changing the logging sink.
