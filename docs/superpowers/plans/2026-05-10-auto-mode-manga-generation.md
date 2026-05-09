# Auto Mode Manga Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first iteration of Auto Mode so new users can upload a novel, review auto-detected characters, and generate one page, all pages, or remaining pages while Pro Mode keeps detailed controls defaulted to Auto.

**Architecture:** Add backend support for normalized Auto/manual preferences, story cast extraction and matching, and run-level page rendering with abort. Layer Auto and Pro controls over the existing React comics workflow, reusing the current character dialog, panel generation, page rendering, and progress shelf where possible.

**Tech Stack:** Flask, SQLAlchemy, RQ, pytest, React 19, Vite, TypeScript, Jotai, SWR, Vitest, Testing Library, shadcn/Radix UI.

---

## File Structure

Backend:

- Create `mangasuperb/services/auto_preferences.py`: canonical preference schema, available option sets, normalization, and legacy migration helpers.
- Modify `models.py`: use the new preference helpers and add `ComicRenderRun`.
- Modify `mangasuperb/routes/preferences.py`: return the full available options needed by Pro controls.
- Create `tests/test_auto_preferences.py`: coverage for new users, legacy preferences, invalid values, and the preferences endpoint.
- Create `mangasuperb/services/auto_prep.py`: cast candidate data classes, extraction parsing, deterministic matching, missing character creation, and review payload rendering.
- Create `mangasuperb/routes/auto.py`: `/api/auto/characters/prepare` endpoint.
- Modify `mangasuperb/routes/__init__.py`: register the Auto blueprint.
- Create `tests/test_auto_prep.py`: coverage for reuse, conflict, creation, failed creation, and route scoping.
- Modify `mangasuperb/services/jobs.py`: add render-run helpers and optional `render_run_id` handling in page-render jobs.
- Modify `mangasuperb/routes/panels.py`: add render-run endpoints for first/all/remaining pages and abort.
- Modify `mangasuperb/routes/jobs.py`: include render runs in active jobs and job status responses.
- Create `tests/test_render_runs.py`: coverage for all-pages, remaining-pages, abort, page failure stop, and active status.

Frontend:

- Modify `frontend/src/service/types.ts`: add preference, Auto prep, render-run, and active-job types.
- Create `frontend/src/lib/auto-preferences.ts`: TypeScript helpers for Auto/manual preferences and workflow default resolution.
- Modify `frontend/src/config/preferences.ts`: export full option sets for layout, color, aspect ratio, font, bubble, and providers.
- Modify `frontend/src/apis/preferences.ts`: typed preference client stays thin.
- Create `frontend/src/apis/auto.ts`: Auto character-prep API client.
- Modify `frontend/src/apis/panels.ts`: render-run start/abort API clients.
- Modify `frontend/src/pages/comics/atoms.ts`: workflow mode, current-comic overrides, auto review state, render-run state.
- Modify `frontend/src/pages/comics/index.tsx`: Auto/Pro mode switch and Auto lane routing.
- Create `frontend/src/pages/comics/auto/auto-mode-tab.tsx`: simplified Auto upload/review/generation lane.
- Create `frontend/src/pages/comics/auto/character-review.tsx`: review reused/created/conflict/failed characters using current edit dialog.
- Create `frontend/src/pages/comics/components/auto-select-control.tsx`: shared Auto/manual control shell for Pro controls.
- Modify `frontend/src/pages/comics/story/story-tab.tsx`: Pro controls read normalized preferences and show Auto defaults.
- Modify `frontend/src/pages/comics/story/manga-style-card.tsx`: use Auto/manual style selection.
- Modify `frontend/src/pages/comics/story/manga-grid-layout-card.tsx`: use Auto/manual layout selection.
- Modify `frontend/src/pages/comics/panels/panels-tab.tsx`: default layouts from Auto/manual preferences.
- Modify `frontend/src/pages/comics/image-generation/image-generation.tsx`: generate first/all/remaining and abort buttons.
- Modify `frontend/src/hooks/use-active-jobs.ts`: hydrate/poll render runs and expose page progress.
- Modify `frontend/src/components/progress-shelf/*`: render run progress and Abort action.
- Create focused frontend tests beside changed components.

## Parallel Implementation Strategy

Use subagent-driven development with disjoint file ownership. Workers are not
alone in the codebase: each worker must preserve edits made by others, avoid
reverting unrelated changes, and keep commits scoped to the files they own.

### Wave 1: Independent Backend Foundations

Run these in parallel:

- **Worker A: Backend preferences**
  - Owns Task 1 only.
  - Write scope: `mangasuperb/services/auto_preferences.py`, `models.py`
    preference helpers only, `mangasuperb/routes/preferences.py`,
    `tests/test_auto_preferences.py`.
  - Must not edit Auto prep, render-run code, or frontend files.

- **Worker B: Backend Auto prep**
  - Owns Task 2 only.
  - Write scope: `mangasuperb/services/auto_prep.py`,
    `mangasuperb/routes/auto.py`, `mangasuperb/routes/__init__.py`,
    `tests/test_auto_prep.py`.
  - May import existing character image enqueue helpers, but must not edit
    `mangasuperb/routes/characters.py`.

- **Worker C: Backend render runs**
  - Owns Task 3 only.
  - Write scope: `models.py` render-run model only,
    `mangasuperb/services/jobs.py`, `mangasuperb/routes/panels.py`,
    `mangasuperb/routes/jobs.py`, `tests/test_render_runs.py`.
  - Must coordinate with Worker A because both touch `models.py`; changes are
    in separate regions and should merge cleanly.

Wave 1 integration checkpoint:

```bash
pytest tests/test_auto_preferences.py tests/test_auto_prep.py tests/test_render_runs.py tests/test_job_routes.py -v
```

Expected: PASS before frontend workers start depending on backend contracts.

### Wave 2: Independent Frontend Foundations

Run these in parallel after Wave 1 tests pass:

- **Worker D: Frontend contracts**
  - Owns Task 4 only.
  - Write scope: `frontend/src/service/types.ts`,
    `frontend/src/config/preferences.ts`, `frontend/src/apis/auto.ts`,
    `frontend/src/apis/panels.ts`, `frontend/src/lib/auto-preferences.ts`,
    `frontend/src/lib/auto-preferences.test.ts`.
  - Must not edit page components.

- **Worker E: Auto/Pro shell and character review**
  - Owns Tasks 5 and 6.
  - Write scope: `frontend/src/pages/comics/atoms.ts`,
    `frontend/src/pages/comics/index.tsx`,
    `frontend/src/pages/comics/auto/*`,
    `frontend/src/pages/comics/__tests__/comics-mode.test.tsx`.
  - Depends on Worker D’s exported types and `AutoApi`; if Worker D is not
    merged yet, use the exact type names from Task 4 and reconcile at merge.

- **Worker F: Pro controls**
  - Owns Task 7 only.
  - Write scope: `frontend/src/pages/comics/components/auto-select-control.tsx`,
    `frontend/src/pages/comics/story/manga-style-card.tsx`,
    `frontend/src/pages/comics/story/manga-grid-layout-card.tsx`,
    `frontend/src/pages/comics/story/ai-model-card.tsx`,
    `frontend/src/pages/comics/panels/panels-tab.tsx`,
    tests under `frontend/src/pages/comics/components/__tests__/`.
  - Must not edit Auto lane files.

Wave 2 integration checkpoint:

```bash
cd frontend && npm test -- \
  src/lib/auto-preferences.test.ts \
  src/pages/comics/__tests__/comics-mode.test.tsx \
  src/pages/comics/auto/__tests__/character-review.test.tsx \
  src/pages/comics/components/__tests__/auto-select-control.test.tsx
```

Expected: PASS before render controls and progress shelf are merged.

### Wave 3: Render UI And Status Panel

Run these in parallel after Worker D and Worker C contracts are merged:

- **Worker G: Image-generation render controls**
  - Owns Task 8 only.
  - Write scope: `frontend/src/pages/comics/image-generation/image-generation.tsx`,
    `frontend/src/pages/comics/image-generation/generation-status-panel.tsx`,
    `frontend/src/pages/comics/image-generation/__tests__/image-generation.test.tsx`.
  - Depends on `PanelsApi.startRenderRun`, `PanelsApi.abortRenderRun`, and
    `activeRenderRunAtom`.

- **Worker H: Progress shelf render-run status**
  - Owns Task 9 only.
  - Write scope: `frontend/src/atoms.ts`,
    `frontend/src/hooks/use-active-jobs.ts`,
    `frontend/src/components/progress-shelf/index.tsx`,
    `frontend/src/components/progress-shelf/progress-row.tsx`,
    `frontend/src/components/progress-shelf/__tests__/progress-shelf.test.tsx`,
    `frontend/src/hooks/__tests__/use-active-jobs.test.ts`.
  - Must not edit image-generation files.

Wave 3 integration checkpoint:

```bash
cd frontend && npm test -- \
  src/pages/comics/image-generation/__tests__/image-generation.test.tsx \
  src/components/progress-shelf/__tests__/progress-shelf.test.tsx \
  src/hooks/__tests__/use-active-jobs.test.ts
```

Expected: PASS before final verification.

### Final Integration Owner

The controller agent owns Task 10. It resolves merge conflicts, runs the
backend and frontend suites, fixes integration defects, and performs the manual
smoke checks.

## Task 1: Normalize Auto/Manual Preferences On The Backend

**Files:**
- Create: `mangasuperb/services/auto_preferences.py`
- Modify: `models.py`
- Modify: `mangasuperb/routes/preferences.py`
- Test: `tests/test_auto_preferences.py`

- [ ] **Step 1: Write failing backend preference tests**

Create `tests/test_auto_preferences.py`:

```python
from __future__ import annotations

import json

from mangasuperb.extensions import db
from models import User


def test_new_user_preferences_default_to_auto(app):
    with app.app_context():
        user = User(username="auto-new", email="auto-new@example.com", password_hash="x")
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    expected_fields = {
        "character_detection",
        "style",
        "color_mode",
        "aspect_ratio",
        "page_layout",
        "font_family",
        "font_size",
        "bubble_shape",
        "bubble_tail",
        "text_provider",
        "image_provider",
    }
    assert set(prefs["fields"]) == expected_fields
    assert all(value["mode"] == "auto" for value in prefs["fields"].values())


def test_legacy_preferences_become_manual_when_values_are_valid(app):
    legacy = {
        "selected_style": "Classic manga black and white linework.",
        "default_layout": "vertical",
        "color_mode": "color",
    }
    with app.app_context():
        user = User(
            username="legacy",
            email="legacy@example.com",
            password_hash="x",
            preferences=json.dumps(legacy),
        )
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    assert prefs["fields"]["style"] == {
        "mode": "manual",
        "value": "Classic manga black and white linework.",
    }
    assert prefs["fields"]["page_layout"] == {"mode": "manual", "value": "vertical"}
    assert prefs["fields"]["color_mode"] == {"mode": "manual", "value": "color"}
    assert prefs["fields"]["aspect_ratio"]["mode"] == "auto"


def test_invalid_preferences_normalize_back_to_auto(app):
    raw = {
        "fields": {
            "style": {"mode": "manual", "value": "unknown style"},
            "page_layout": {"mode": "manual", "value": "spiral"},
            "color_mode": {"mode": "manual", "value": "sepia"},
            "bubble_tail": {"mode": "manual", "value": "yes"},
            "text_provider": {"mode": "manual", "value": "openai"},
        }
    }
    with app.app_context():
        user = User(
            username="invalid",
            email="invalid@example.com",
            password_hash="x",
            preferences=json.dumps(raw),
        )
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    assert prefs["fields"]["style"]["mode"] == "auto"
    assert prefs["fields"]["page_layout"]["mode"] == "auto"
    assert prefs["fields"]["color_mode"]["mode"] == "auto"
    assert prefs["fields"]["bubble_tail"]["mode"] == "auto"
    assert prefs["fields"]["text_provider"]["mode"] == "auto"


def test_update_preferences_accepts_auto_and_valid_manual_values(app, auth_client):
    response = auth_client.put(
        "/api/preferences",
        json={
            "fields": {
                "style": {"mode": "auto"},
                "page_layout": {"mode": "manual", "value": "grid-2x2"},
                "bubble_tail": {"mode": "manual", "value": False},
                "font_size": {"mode": "manual", "value": "24"},
            }
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    fields = payload["preferences"]["fields"]
    assert fields["style"] == {"mode": "auto"}
    assert fields["page_layout"] == {"mode": "manual", "value": "grid-2x2"}
    assert fields["bubble_tail"] == {"mode": "manual", "value": False}
    assert fields["font_size"] == {"mode": "manual", "value": "24"}
    assert "aspect_ratios" in payload["available_options"]
    assert "font_families" in payload["available_options"]
```

- [ ] **Step 2: Run preference tests and verify failure**

Run: `pytest tests/test_auto_preferences.py -v`

Expected: FAIL because `mangasuperb.services.auto_preferences` and the new `fields` preference shape do not exist.

- [ ] **Step 3: Create backend preference normalization service**

Create `mangasuperb/services/auto_preferences.py`:

```python
"""Auto/manual preference normalization for creator workflows."""
from __future__ import annotations

import json
from typing import Any


STYLE_PRESETS: tuple[dict[str, Any], ...] = (
    {"value": "Classic manga black and white linework.", "label": "经典黑白漫画线稿", "is_custom": False},
    {"value": "High-contrast ink with splashy gradients", "label": "高对比墨线 + 渐变", "is_custom": False},
    {"value": "Moebius-inspired clean lines, minimal shading", "label": "莫比乌斯风·干净线条", "is_custom": False},
    {"value": "Gritty seinen style with textured shading", "label": "青年向质感阴影", "is_custom": False},
)
LAYOUT_OPTIONS = ("auto-grid", "grid-2x2", "vertical", "cinematic")
COLOR_MODES = ("black-white", "color")
ASPECT_RATIOS = ("16:9", "4:3", "3:4", "1:1", "2:3", "3:2")
FONT_FAMILIES = ("source-han-sans", "yahei", "heiti", "songti")
FONT_SIZES = ("18", "20", "22", "24", "28")
BUBBLE_SHAPES = ("rect", "round")
AI_PROVIDERS = ("gemini", "third_party")
PREFERENCE_FIELDS = (
    "character_detection",
    "style",
    "color_mode",
    "aspect_ratio",
    "page_layout",
    "font_family",
    "font_size",
    "bubble_shape",
    "bubble_tail",
    "text_provider",
    "image_provider",
)


def _auto() -> dict[str, str]:
    return {"mode": "auto"}


def available_options() -> dict[str, Any]:
    return {
        "style_presets": [dict(preset) for preset in STYLE_PRESETS],
        "layout_options": list(LAYOUT_OPTIONS),
        "color_modes": list(COLOR_MODES),
        "aspect_ratios": list(ASPECT_RATIOS),
        "font_families": list(FONT_FAMILIES),
        "font_sizes": list(FONT_SIZES),
        "bubble_shapes": list(BUBBLE_SHAPES),
        "ai_providers": list(AI_PROVIDERS),
    }


def default_preferences() -> dict[str, Any]:
    return {"version": 2, "fields": {field: _auto() for field in PREFERENCE_FIELDS}}


def _parse_raw(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return raw if isinstance(raw, dict) else {}


def _allowed_values(field: str) -> tuple[Any, ...] | None:
    if field == "style":
        return tuple(preset["value"] for preset in STYLE_PRESETS)
    if field == "page_layout":
        return LAYOUT_OPTIONS
    if field == "color_mode":
        return COLOR_MODES
    if field == "aspect_ratio":
        return ASPECT_RATIOS
    if field == "font_family":
        return FONT_FAMILIES
    if field == "font_size":
        return FONT_SIZES
    if field == "bubble_shape":
        return BUBBLE_SHAPES
    if field in {"text_provider", "image_provider"}:
        return AI_PROVIDERS
    if field == "character_detection":
        return ("enabled",)
    if field == "bubble_tail":
        return (True, False)
    return None


def _normalize_field(field: str, raw_value: Any) -> dict[str, Any]:
    if not isinstance(raw_value, dict):
        return _auto()
    if raw_value.get("mode") != "manual":
        return _auto()

    value = raw_value.get("value")
    allowed = _allowed_values(field)
    if allowed is None or value not in allowed:
        return _auto()
    return {"mode": "manual", "value": value}


def normalize_preferences(raw: Any) -> dict[str, Any]:
    parsed = _parse_raw(raw)
    normalized = default_preferences()

    fields = parsed.get("fields")
    if isinstance(fields, dict):
        for field in PREFERENCE_FIELDS:
            normalized["fields"][field] = _normalize_field(field, fields.get(field))
        return normalized

    legacy_map = {
        "selected_style": "style",
        "default_layout": "page_layout",
        "color_mode": "color_mode",
    }
    for legacy_key, field in legacy_map.items():
        if legacy_key in parsed:
            normalized["fields"][field] = _normalize_field(
                field,
                {"mode": "manual", "value": parsed.get(legacy_key)},
            )
    return normalized


def apply_preferences_update(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = normalize_preferences(current)
    incoming = updates.get("fields")
    if isinstance(incoming, dict):
        for field in PREFERENCE_FIELDS:
            if field in incoming:
                merged["fields"][field] = _normalize_field(field, incoming[field])
    return merged
```

- [ ] **Step 4: Wire `models.py` to the new preference service**

Modify the top of `models.py` to import the service constants and helpers, then replace the existing preference helper bodies:

```python
from mangasuperb.services.auto_preferences import (
    COLOR_MODES as DEFAULT_COLOR_MODES,
    LAYOUT_OPTIONS as DEFAULT_LAYOUT_OPTIONS,
    STYLE_PRESETS as DEFAULT_STYLE_PRESETS,
    apply_preferences_update as _auto_apply_preferences_update,
    default_preferences as _auto_default_preferences,
    normalize_preferences as _auto_normalize_preferences,
)
```

Replace the existing `_default_preferences_dict`, `_default_preferences_json`, `_normalize_preferences`, and `_apply_preferences_update` functions with:

```python
DEFAULT_STYLE_VALUES = {preset["value"] for preset in DEFAULT_STYLE_PRESETS}


def _default_style_presets() -> list[dict[str, Any]]:
    return [dict(preset) for preset in DEFAULT_STYLE_PRESETS]


def _default_preferences_dict() -> dict[str, Any]:
    return _auto_default_preferences()


def _default_preferences_json() -> str:
    return json.dumps(_default_preferences_dict(), ensure_ascii=False)


def _normalize_preferences(raw: Any) -> dict[str, Any]:
    return _auto_normalize_preferences(raw)


def _apply_preferences_update(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    return _auto_apply_preferences_update(current, updates)
```

- [ ] **Step 5: Expand the preferences endpoint response**

Modify `mangasuperb/routes/preferences.py` imports:

```python
from mangasuperb.services.auto_preferences import available_options
from models import User
```

Replace `_preference_response` with:

```python
def _preference_response(preferences: dict[str, Any]) -> Any:
    options = available_options()
    return jsonify(
        {
            "preferences": preferences,
            "available_options": options,
            "layout_options": options["layout_options"],
            "color_modes": options["color_modes"],
        }
    )
```

- [ ] **Step 6: Run backend preference tests**

Run: `pytest tests/test_auto_preferences.py -v`

Expected: PASS.

- [ ] **Step 7: Run existing preference-adjacent tests**

Run: `pytest tests/test_config.py tests/test_storage.py -v`

Expected: PASS.

- [ ] **Step 8: Commit preference foundation**

```bash
git add mangasuperb/services/auto_preferences.py models.py mangasuperb/routes/preferences.py tests/test_auto_preferences.py
git commit -m "feat: normalize auto workflow preferences"
```

## Task 2: Add Backend Auto Character Prep

**Files:**
- Create: `mangasuperb/services/auto_prep.py`
- Create: `mangasuperb/routes/auto.py`
- Modify: `mangasuperb/routes/__init__.py`
- Test: `tests/test_auto_prep.py`

- [ ] **Step 1: Write failing auto-prep service and route tests**

Create `tests/test_auto_prep.py`:

```python
from __future__ import annotations

from types import SimpleNamespace

import pytest

from mangasuperb.extensions import db
from mangasuperb.services.auto_prep import (
    CastCandidate,
    prepare_characters_from_candidates,
)
from models import Character, User


class FakeTextProvider:
    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[str] = []

    def generate_text(self, prompt: str) -> str:
        self.calls.append(prompt)
        return self.response


def _character(user_id: int, name: str, description: str) -> Character:
    character = Character(
        user_id=user_id,
        name=name,
        description=description,
        sex="unspecified",
        is_public=False,
        style_prompt=description,
    )
    db.session.add(character)
    db.session.commit()
    return character


def test_auto_prep_reuses_obvious_match(app, user):
    with app.app_context():
        existing = _character(user.id, "Mira", "A red-haired pilot with a silver jacket.")
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                CastCandidate(
                    name="Mira",
                    aliases=(),
                    description="A red-haired pilot wearing a silver jacket.",
                    sex="female",
                    visual_traits=("red hair", "silver jacket"),
                    role="protagonist",
                    confidence=0.95,
                )
            ],
            image_provider=None,
        )

    assert [item["character"]["id"] for item in result["reused"]] == [existing.id]
    assert result["created"] == []
    assert result["conflicts"] == []


def test_auto_prep_creates_missing_character(app, user, dummy_queue):
    with app.app_context():
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                CastCandidate(
                    name="Rook",
                    aliases=(),
                    description="A masked rival with a black coat.",
                    sex="male",
                    visual_traits=("mask", "black coat"),
                    role="antagonist",
                    confidence=0.9,
                )
            ],
            image_provider="gemini",
        )
        created = Character.query.filter_by(name="Rook").one()

    assert result["created"][0]["character"]["id"] == created.id
    assert result["created"][0]["role"] == "antagonist"
    assert dummy_queue.jobs[-1].kwargs["character_id"] == created.id


def test_auto_prep_marks_name_description_conflict(app, user):
    with app.app_context():
        existing = _character(user.id, "Mira", "A red-haired pilot with a silver jacket.")
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                CastCandidate(
                    name="Mira",
                    aliases=(),
                    description="An elderly scholar with white robes.",
                    sex="female",
                    visual_traits=("white robes",),
                    role="supporting",
                    confidence=0.9,
                )
            ],
            image_provider=None,
        )

    assert result["reused"] == []
    assert result["created"] == []
    assert result["conflicts"][0]["candidate"]["name"] == "Mira"
    assert result["conflicts"][0]["existing_character"]["id"] == existing.id


def test_auto_prepare_route_extracts_and_prepares_characters(app, auth_client, monkeypatch):
    response_text = """
    {"characters":[
      {"name":"Mira","aliases":[],"description":"A red-haired pilot.","sex":"female","visual_traits":["red hair"],"role":"protagonist","confidence":0.95}
    ]}
    """
    provider = FakeTextProvider(response_text)
    monkeypatch.setattr(
        "mangasuperb.routes.auto.get_text_provider",
        lambda provider_id=None: provider,
    )

    response = auth_client.post(
        "/api/auto/characters/prepare",
        json={"story": "Mira launches the hidden mech.", "image_provider": "gemini"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["created"][0]["character"]["name"] == "Mira"
    assert provider.calls
```

- [ ] **Step 2: Run auto-prep tests and verify failure**

Run: `pytest tests/test_auto_prep.py -v`

Expected: FAIL because `mangasuperb.services.auto_prep` and `/api/auto/characters/prepare` do not exist.

- [ ] **Step 3: Implement auto-prep service data model and JSON parsing**

Create `mangasuperb/services/auto_prep.py` with:

```python
"""Automatic character extraction, matching, and creation."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterable

from flask import current_app
from sqlalchemy import or_

from mangasuperb.extensions import db
from models import Character


ALLOWED_SEX_VALUES = {"male", "female", "non-binary", "unspecified", "other"}


@dataclass(frozen=True)
class CastCandidate:
    name: str
    aliases: tuple[str, ...]
    description: str
    sex: str
    visual_traits: tuple[str, ...]
    role: str
    confidence: float


def _tokenize(text: str) -> set[str]:
    normalized = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", " ", text.lower())
    return {token for token in normalized.split() if token}


def _similarity(left: str, right: str) -> float:
    left_tokens = _tokenize(left)
    right_tokens = _tokenize(right)
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = left_tokens & right_tokens
    return len(overlap) / max(len(left_tokens), len(right_tokens))


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?", "", stripped).strip()
        stripped = re.sub(r"```$", "", stripped).strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {"characters": []}
    try:
        parsed = json.loads(stripped[start : end + 1])
    except (TypeError, ValueError):
        return {"characters": []}
    return parsed if isinstance(parsed, dict) else {"characters": []}


def parse_cast_candidates(text: str) -> list[CastCandidate]:
    parsed = _extract_json_object(text)
    raw_items = parsed.get("characters")
    if not isinstance(raw_items, list):
        return []

    candidates: list[CastCandidate] = []
    seen: set[str] = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()
        description = str(raw.get("description") or "").strip()
        if not name or not description:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        aliases_raw = raw.get("aliases")
        traits_raw = raw.get("visual_traits")
        sex = str(raw.get("sex") or "unspecified").strip().lower()
        if sex not in ALLOWED_SEX_VALUES:
            sex = "unspecified"
        try:
            confidence = float(raw.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        candidates.append(
            CastCandidate(
                name=name,
                aliases=tuple(str(item).strip() for item in aliases_raw or [] if str(item).strip()),
                description=description,
                sex=sex,
                visual_traits=tuple(str(item).strip() for item in traits_raw or [] if str(item).strip()),
                role=str(raw.get("role") or "supporting").strip() or "supporting",
                confidence=max(0.0, min(1.0, confidence)),
            )
        )
    return candidates
```

- [ ] **Step 4: Implement extraction and matching functions**

Add to `mangasuperb/services/auto_prep.py`:

```python
def build_cast_extraction_prompt(story: str, style_preference: str | None = None) -> str:
    style_line = f"\nStyle preference: {style_preference.strip()}" if style_preference else ""
    return (
        "Extract the recurring manga cast from this story. Return only JSON with a "
        "characters array. Each character must include name, aliases, description, "
        "sex, visual_traits, role, and confidence. Keep descriptions visual and "
        "specific enough to create a character image."
        f"{style_line}\n\nStory:\n{story}"
    )


def extract_cast_candidates(
    story: str,
    *,
    text_provider: Any,
    style_preference: str | None = None,
) -> list[CastCandidate]:
    prompt = build_cast_extraction_prompt(story, style_preference)
    response = text_provider.generate_text(prompt)
    return parse_cast_candidates(response)


def _accessible_characters(user_id: int) -> list[Character]:
    return (
        Character.query.filter(
            or_(Character.user_id == user_id, Character.is_public.is_(True))
        )
        .order_by(Character.name.asc(), Character.id.asc())
        .all()
    )


def _candidate_names(candidate: CastCandidate) -> set[str]:
    return {candidate.name.lower(), *(alias.lower() for alias in candidate.aliases)}


def _name_matches(candidate: CastCandidate, character: Character) -> bool:
    return (character.name or "").strip().lower() in _candidate_names(candidate)


def _character_payload(character: Character, role: str) -> dict[str, Any]:
    return {"character": character.to_dict(), "role": role}


def prepare_characters_from_candidates(
    *,
    user_id: int,
    candidates: Iterable[CastCandidate],
    image_provider: str | None,
) -> dict[str, Any]:
    from mangasuperb.routes.characters import _enqueue_character_image

    accessible = _accessible_characters(user_id)
    reused: list[dict[str, Any]] = []
    created: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    for candidate in candidates:
        name_matches = [character for character in accessible if _name_matches(candidate, character)]
        compatible = [
            character
            for character in name_matches
            if _similarity(candidate.description, character.description or "") >= 0.35
        ]
        if compatible:
            reused.append(_character_payload(compatible[0], candidate.role))
            continue
        if name_matches:
            conflicts.append(
                {
                    "candidate": candidate.__dict__,
                    "existing_character": name_matches[0].to_dict(),
                    "reason": "name_match_description_conflict",
                    "role": candidate.role,
                }
            )
            continue

        try:
            character = Character(
                user_id=user_id,
                name=candidate.name,
                description=candidate.description,
                sex=candidate.sex,
                is_public=False,
                style_prompt=candidate.description,
                image_status="idle",
            )
            db.session.add(character)
            db.session.flush()
            try:
                _enqueue_character_image(
                    character=character,
                    prompt_for_image=candidate.description,
                    reference_images=[],
                    image_provider=image_provider,
                )
            except Exception as exc:
                character.image_status = "failed"
                character.image_error = str(exc)
            db.session.flush()
            created.append(_character_payload(character, candidate.role))
            accessible.append(character)
        except Exception as exc:
            current_app.logger.exception("Auto character creation failed")
            failed.append({"candidate": candidate.__dict__, "error": str(exc), "role": candidate.role})

    db.session.commit()
    return {
        "reused": reused,
        "created": created,
        "conflicts": conflicts,
        "failed": failed,
        "suggested_roles": {
            item["character"]["id"]: item["role"] for item in [*reused, *created]
        },
    }
```

- [ ] **Step 5: Implement Auto route**

Create `mangasuperb/routes/auto.py`:

```python
"""Auto-mode preparation endpoints."""
from __future__ import annotations

from typing import Any

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.services.ai_provider import get_text_provider
from mangasuperb.services.auto_prep import (
    extract_cast_candidates,
    prepare_characters_from_candidates,
)

bp = Blueprint("auto", __name__, url_prefix="/api/auto")

ALLOWED_AI_PROVIDER_VALUES = {"gemini", "third_party", "openai"}


def _normalise_ai_provider(value: Any, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    provider = value.strip().lower()
    if not provider:
        return None
    if provider not in ALLOWED_AI_PROVIDER_VALUES:
        raise ValueError(f"{field} must be 'gemini' or 'third_party'")
    return "third_party" if provider == "openai" else provider


@bp.post("/characters/prepare")
@login_required
def prepare_characters() -> Any:
    payload = request.get_json(silent=True) or {}
    story = (payload.get("story") or "").strip()
    if not story:
        return jsonify({"error": "Story is required"}), 400

    style_preference = (payload.get("style_preference") or "").strip() or None
    try:
        text_provider_id = _normalise_ai_provider(payload.get("text_provider"), "text_provider")
        image_provider_id = _normalise_ai_provider(payload.get("image_provider"), "image_provider")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        candidates = extract_cast_candidates(
            story,
            text_provider=get_text_provider(text_provider_id),
            style_preference=style_preference,
        )
        result = prepare_characters_from_candidates(
            user_id=current_user.id,
            candidates=candidates,
            image_provider=image_provider_id,
        )
    except Exception:
        current_app.logger.exception("Auto character preparation failed")
        return jsonify({"error": "Failed to prepare characters"}), 502

    return jsonify(result), 200
```

- [ ] **Step 6: Register the Auto blueprint**

Modify `mangasuperb/routes/__init__.py`:

```python
from .auto import bp as auto_bp
```

Register it before character/comic routes:

```python
    app.register_blueprint(auto_bp)
```

- [ ] **Step 7: Run auto-prep tests**

Run: `pytest tests/test_auto_prep.py -v`

Expected: PASS.

- [ ] **Step 8: Run character and route tests**

Run: `pytest tests/test_character_routes.py tests/test_job_routes.py tests/test_auto_prep.py -v`

Expected: PASS.

- [ ] **Step 9: Commit auto character prep**

```bash
git add mangasuperb/services/auto_prep.py mangasuperb/routes/auto.py mangasuperb/routes/__init__.py tests/test_auto_prep.py
git commit -m "feat: prepare auto characters from story"
```

## Task 3: Add Render Runs, Generate Remaining Pages, And Abort

**Files:**
- Modify: `models.py`
- Modify: `mangasuperb/services/jobs.py`
- Modify: `mangasuperb/routes/panels.py`
- Modify: `mangasuperb/routes/jobs.py`
- Test: `tests/test_render_runs.py`

- [ ] **Step 1: Write failing render-run tests**

Create `tests/test_render_runs.py`:

```python
from __future__ import annotations

import json

from mangasuperb.extensions import db
from mangasuperb.services import jobs
from models import Comic, ComicPage, ComicPageLayout, ComicPanelShot, ComicRenderRun, Script


def _comic_with_pages(user_id: int, *, page_count: int = 3) -> Comic:
    script = Script(user_id=user_id, title="Run Story", content=json.dumps({"story": "Run"}))
    comic = Comic(user_id=user_id, script=script, title="Run Story", aspect_ratio="16:9")
    db.session.add_all([script, comic])
    db.session.flush()
    for page_number in range(1, page_count + 1):
        layout = ComicPageLayout(comic_id=comic.id, page_number=page_number, layout_key="auto-grid")
        panel = ComicPanelShot(
            comic_id=comic.id,
            sequence_index=page_number,
            page_number=page_number,
            panel_number=1,
            description=f"Page {page_number}",
        )
        db.session.add_all([layout, panel])
    db.session.commit()
    return comic


def test_start_all_pages_render_run_enqueues_first_page(app, auth_client, user, dummy_queue):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=3)
        comic_id = comic.id

    response = auth_client.post(
        f"/api/panels/{comic_id}/render-runs",
        json={"mode": "all_pages", "image_provider": "gemini"},
    )

    assert response.status_code == 202
    payload = response.get_json()
    assert payload["render_run"]["mode"] == "all_pages"
    assert payload["render_run"]["requested_pages"] == [1, 2, 3]
    assert dummy_queue.jobs[-1].func is jobs.process_page_render_stage
    assert dummy_queue.jobs[-1].kwargs["render_run_id"] == payload["render_run"]["id"]
    assert dummy_queue.jobs[-1].kwargs["page_number"] == 1


def test_remaining_pages_skip_rendered_pages(app, auth_client, user, dummy_queue, dummy_storage):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=3)
        page = ComicPage(
            comic_id=comic.id,
            script_id=comic.script_id,
            page_number=1,
            image_url="https://cdn.example.com/page-1.png",
        )
        db.session.add(page)
        db.session.commit()
        comic_id = comic.id

    response = auth_client.post(
        f"/api/panels/{comic_id}/render-runs",
        json={"mode": "remaining_pages"},
    )

    assert response.status_code == 202
    payload = response.get_json()
    assert payload["render_run"]["requested_pages"] == [2, 3]
    assert dummy_queue.jobs[-1].kwargs["page_number"] == 2


def test_abort_render_run_marks_run_and_prevents_next_page(app, auth_client, user, dummy_queue):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        db.session.add(run)
        db.session.commit()
        run_id = run.id

    response = auth_client.post(f"/api/panels/render-runs/{run_id}/abort")

    assert response.status_code == 200
    with app.app_context():
        persisted = db.session.get(ComicRenderRun, run_id)
        assert persisted.status == "aborted"
        assert persisted.abort_requested is True


def test_render_run_appears_in_active_jobs(app, auth_client, user):
    with app.app_context():
        comic = _comic_with_pages(user.id, page_count=2)
        run = ComicRenderRun.create(
            comic_id=comic.id,
            user_id=user.id,
            mode="all_pages",
            requested_pages=[1, 2],
        )
        run.status = "running"
        run.current_page_number = 1
        db.session.add(run)
        db.session.commit()

    response = auth_client.get("/api/jobs/active")

    assert response.status_code == 200
    active = response.get_json()["active"]
    render_run_rows = [item for item in active if item.get("render_run_id")]
    assert len(render_run_rows) == 1
    assert render_run_rows[0]["stage"] == "render"
    assert render_run_rows[0]["render_progress"] == {"completed": 0, "total": 2}
```

- [ ] **Step 2: Run render-run tests and verify failure**

Run: `pytest tests/test_render_runs.py -v`

Expected: FAIL because `ComicRenderRun` and render-run endpoints do not exist.

- [ ] **Step 3: Add `ComicRenderRun` model**

In `models.py`, add this class after `ComicPage`:

```python
class ComicRenderRun(db.Model):
    """Run-level state for first/all/remaining page generation."""

    __tablename__ = "comic_render_runs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey("comics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mode = db.Column(db.String(30), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="queued", index=True)
    current_page_number = db.Column(db.Integer, nullable=True)
    requested_pages_json = db.Column(db.Text, nullable=False, default="[]")
    completed_pages_json = db.Column(db.Text, nullable=False, default="[]")
    failed_pages_json = db.Column(db.Text, nullable=False, default="[]")
    abort_requested = db.Column(db.Boolean, nullable=False, default=False)
    job_id = db.Column(db.String(36), nullable=True, index=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    comic = db.relationship("Comic", backref=db.backref("render_runs", lazy=True))

    @staticmethod
    def _loads(value: str | None) -> list[int]:
        try:
            parsed = json.loads(value or "[]")
        except (TypeError, ValueError):
            return []
        return [int(item) for item in parsed if isinstance(item, int) or str(item).isdigit()]

    @staticmethod
    def _dumps(values: list[int]) -> str:
        return json.dumps(sorted(set(int(value) for value in values)))

    @classmethod
    def create(cls, *, comic_id: int, user_id: int, mode: str, requested_pages: list[int]):
        return cls(
            comic_id=comic_id,
            user_id=user_id,
            mode=mode,
            requested_pages_json=cls._dumps(requested_pages),
            completed_pages_json="[]",
            failed_pages_json="[]",
        )

    @property
    def requested_pages(self) -> list[int]:
        return self._loads(self.requested_pages_json)

    @property
    def completed_pages(self) -> list[int]:
        return self._loads(self.completed_pages_json)

    @property
    def failed_pages(self) -> list[int]:
        return self._loads(self.failed_pages_json)

    def mark_completed_page(self, page_number: int) -> None:
        self.completed_pages_json = self._dumps([*self.completed_pages, page_number])

    def mark_failed_page(self, page_number: int) -> None:
        self.failed_pages_json = self._dumps([*self.failed_pages, page_number])

    def to_dict(self):
        return {
            "id": self.id,
            "comic_id": self.comic_id,
            "user_id": self.user_id,
            "mode": self.mode,
            "status": self.status,
            "current_page_number": self.current_page_number,
            "requested_pages": self.requested_pages,
            "completed_pages": self.completed_pages,
            "failed_pages": self.failed_pages,
            "abort_requested": self.abort_requested,
            "job_id": self.job_id,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
```

- [ ] **Step 4: Add render-run helper functions**

In `mangasuperb/services/jobs.py`, import `ComicRenderRun` and add:

```python
def _renderable_page_numbers(comic: Comic) -> list[int]:
    numbers = {
        int(layout.page_number)
        for layout in comic.page_layouts
        if layout.page_number and int(layout.page_number) > 0
    }
    numbers.update(
        int(panel.page_number)
        for panel in comic.panel_shots
        if panel.page_number and int(panel.page_number) > 0
    )
    return sorted(numbers)


def _rendered_page_numbers(comic: Comic) -> set[int]:
    return {int(page.page_number) for page in comic.pages if page.image_url}


def resolve_render_run_pages(comic: Comic, mode: str) -> list[int]:
    all_pages = _renderable_page_numbers(comic)
    if mode == "first_page":
        return [1] if 1 in all_pages else all_pages[:1]
    if mode == "all_pages":
        return all_pages
    if mode == "remaining_pages":
        rendered = _rendered_page_numbers(comic)
        return [page for page in all_pages if page not in rendered]
    raise ValueError("mode must be first_page, all_pages, or remaining_pages")
```

Add enqueue function:

```python
def enqueue_render_run(
    queue,
    comic: Comic,
    *,
    mode: str,
    user_id: int,
    image_provider: str | None = None,
    text_provider: str | None = None,
    color_mode: str | None = None,
    aspect_ratio: str | None = None,
    font_family: str | None = None,
    font_size: str | None = None,
    bubble_shape: str | None = None,
    bubble_tail: bool | None = None,
) -> ComicRenderRun:
    requested_pages = resolve_render_run_pages(comic, mode)
    if not requested_pages:
        raise ValueError("No pages are available for rendering")
    render_run = ComicRenderRun.create(
        comic_id=comic.id,
        user_id=user_id,
        mode=mode,
        requested_pages=requested_pages,
    )
    render_run.status = "queued"
    db.session.add(render_run)
    db.session.flush()
    job = enqueue_page_render(
        queue,
        comic,
        requested_pages[0],
        image_provider=image_provider,
        text_provider=text_provider,
        color_mode=color_mode,
        aspect_ratio=aspect_ratio,
        font_family=font_family,
        font_size=font_size,
        bubble_shape=bubble_shape,
        bubble_tail=bubble_tail,
        render_run_id=render_run.id,
    )
    render_run.job_id = job.id
    db.session.commit()
    return render_run
```

- [ ] **Step 5: Add `render_run_id` handling to page render jobs**

Extend `enqueue_page_render` and `process_page_render_stage` signatures with:

```python
    render_run_id: int | None = None,
```

Pass `render_run_id=render_run_id` into the queued `process_page_render_stage`.

At the start of `process_page_render_stage`, after loading the comic, add:

```python
        render_run = db.session.get(ComicRenderRun, render_run_id) if render_run_id else None
        if render_run and render_run.abort_requested:
            render_run.status = "aborted"
            render_run.completed_at = datetime.utcnow()
            db.session.commit()
            return {
                "status": "aborted",
                "comic_id": comic_id,
                "page_number": page_number,
                "render_run_id": render_run.id,
            }
```

After successful page upload and before `db.session.commit()`, add:

```python
            if render_run:
                render_run.status = "running"
                render_run.current_page_number = page_number
                render_run.started_at = render_run.started_at or datetime.utcnow()
                render_run.mark_completed_page(page_number)
                remaining_pages = [
                    page for page in render_run.requested_pages
                    if page not in render_run.completed_pages
                    and page not in render_run.failed_pages
                    and page > page_number
                ]
                if render_run.abort_requested:
                    render_run.status = "aborted"
                    render_run.completed_at = datetime.utcnow()
                elif remaining_pages:
                    queue = current_app.extensions.get("rq_queue")
                    if queue:
                        timeout = current_app.config["RQ_JOB_TIMEOUT"]
                        result_ttl = current_app.config["RQ_RESULT_TTL"]
                        next_page = remaining_pages[0]
                        next_job = queue.enqueue(
                            process_page_render_stage,
                            comic_id=comic_id,
                            page_number=next_page,
                            image_model=image_model,
                            image_provider=image_provider,
                            text_provider=text_provider,
                            chain_remaining=False,
                            font_family=font_family,
                            font_size=font_size,
                            bubble_shape=bubble_shape,
                            bubble_tail=bubble_tail,
                            color_mode=normalized_color,
                            aspect_ratio=normalized_aspect_ratio,
                            render_run_id=render_run.id,
                            job_timeout=timeout,
                            result_ttl=result_ttl,
                            description=f"Render page {next_page} for comic {comic_id}",
                        )
                        render_run.job_id = next_job.id
                        _assign_stage_job(comic, "render", next_job.id)
                else:
                    render_run.status = "completed"
                    render_run.completed_at = datetime.utcnow()
```

In the exception block, before committing the failed render stage, add:

```python
                if render_run:
                    render_run.status = "failed"
                    render_run.error_message = str(exc)
                    render_run.mark_failed_page(page_number)
                    render_run.completed_at = datetime.utcnow()
```

- [ ] **Step 6: Add render-run endpoints**

In `mangasuperb/routes/panels.py`, import `ComicRenderRun` and `enqueue_render_run`.

Add:

```python
@bp.post("/<int:comic_id>/render-runs")
@login_required
def start_render_run(comic_id: int) -> Any:
    comic = _load_comic_for_user(comic_id)
    if not comic:
        return jsonify({"error": "Comic not found"}), 404

    payload = request.get_json(silent=True) or {}
    mode = (payload.get("mode") or "first_page").strip()
    if mode not in {"first_page", "all_pages", "remaining_pages"}:
        return jsonify({"error": "mode is invalid"}), 400

    try:
        image_provider = _normalise_ai_provider(payload.get("image_provider"))
        text_provider = _normalise_ai_provider(payload.get("text_provider"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    queue = current_app.extensions.get("rq_queue")
    if not queue:
        return jsonify({"error": "Background queue is not configured"}), 503

    try:
        render_run = enqueue_render_run(
            queue,
            comic,
            mode=mode,
            user_id=current_user.id,
            image_provider=image_provider,
            text_provider=text_provider,
            color_mode=payload.get("color_mode"),
            aspect_ratio=payload.get("aspect_ratio"),
            font_family=payload.get("font_family"),
            font_size=payload.get("font_size"),
            bubble_shape=payload.get("bubble_shape"),
            bubble_tail=payload.get("bubble_tail"),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    db.session.refresh(comic)
    return jsonify({"render_run": render_run.to_dict(), "comic": comic.to_dict()}), 202


@bp.post("/render-runs/<int:render_run_id>/abort")
@login_required
def abort_render_run(render_run_id: int) -> Any:
    render_run = db.session.get(ComicRenderRun, render_run_id)
    if not render_run or render_run.user_id != current_user.id:
        return jsonify({"error": "Render run not found"}), 404

    render_run.abort_requested = True
    if render_run.status in {"queued", "running"}:
        render_run.status = "aborted"
        render_run.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"render_run": render_run.to_dict()}), 200
```

- [ ] **Step 7: Include render runs in active job responses**

In `mangasuperb/routes/jobs.py`, import `ComicRenderRun`.

In `list_active_jobs`, after building workflow stage rows, query active render runs:

```python
    render_runs = (
        ComicRenderRun.query.filter_by(user_id=current_user.id)
        .filter(ComicRenderRun.status.in_(("queued", "running")))
        .order_by(ComicRenderRun.created_at.asc())
        .all()
    )
```

Extend `active` with:

```python
    for render_run in render_runs:
        comic = render_run.comic
        if not comic:
            continue
        active.append(
            {
                "job_id": render_run.job_id or f"render-run-{render_run.id}",
                "render_run_id": render_run.id,
                "comic_id": comic.id,
                "stage": "render",
                "status": render_run.status,
                "title": comic.title,
                "started_at": (
                    render_run.started_at.isoformat()
                    if render_run.started_at
                    else render_run.created_at.isoformat()
                ),
                "render_progress": {
                    "completed": len(render_run.completed_pages),
                    "total": len(render_run.requested_pages),
                },
            }
        )
```

- [ ] **Step 8: Run render-run tests**

Run: `pytest tests/test_render_runs.py -v`

Expected: PASS.

- [ ] **Step 9: Run workflow regression tests**

Run: `pytest tests/test_jobs_workflow.py tests/test_story_panel_routes.py tests/test_job_routes.py tests/test_render_runs.py -v`

Expected: PASS.

- [ ] **Step 10: Commit render runs**

```bash
git add models.py mangasuperb/services/jobs.py mangasuperb/routes/panels.py mangasuperb/routes/jobs.py tests/test_render_runs.py
git commit -m "feat: add abortable render runs"
```

## Task 4: Add Frontend Types, API Clients, And Auto Preference Utilities

**Files:**
- Modify: `frontend/src/service/types.ts`
- Modify: `frontend/src/config/preferences.ts`
- Modify: `frontend/src/apis/preferences.ts`
- Create: `frontend/src/apis/auto.ts`
- Modify: `frontend/src/apis/panels.ts`
- Create: `frontend/src/lib/auto-preferences.ts`
- Test: `frontend/src/lib/auto-preferences.test.ts`

- [ ] **Step 1: Write failing frontend utility tests**

Create `frontend/src/lib/auto-preferences.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  autoPreference,
  manualPreference,
  resolvePreferenceValue,
  normalizePreferenceFields,
} from './auto-preferences'

describe('auto preference helpers', () => {
  it('defaults missing fields to auto', () => {
    const fields = normalizePreferenceFields({})

    expect(fields.style).toEqual({ mode: 'auto' })
    expect(fields.aspect_ratio).toEqual({ mode: 'auto' })
    expect(fields.bubble_tail).toEqual({ mode: 'auto' })
  })

  it('keeps valid manual values and drops invalid values', () => {
    const fields = normalizePreferenceFields({
      page_layout: { mode: 'manual', value: 'grid-2x2' },
      color_mode: { mode: 'manual', value: 'sepia' },
      bubble_tail: { mode: 'manual', value: false },
    })

    expect(fields.page_layout).toEqual({ mode: 'manual', value: 'grid-2x2' })
    expect(fields.color_mode).toEqual({ mode: 'auto' })
    expect(fields.bubble_tail).toEqual({ mode: 'manual', value: false })
  })

  it('resolves manual values before auto fallback', () => {
    expect(resolvePreferenceValue(manualPreference('color'), 'black-white')).toBe('color')
    expect(resolvePreferenceValue(autoPreference(), 'black-white')).toBe('black-white')
  })
})
```

- [ ] **Step 2: Run frontend utility test and verify failure**

Run: `cd frontend && npm test -- src/lib/auto-preferences.test.ts`

Expected: FAIL because `auto-preferences.ts` does not exist.

- [ ] **Step 3: Add frontend preference and Auto API types**

Modify `frontend/src/service/types.ts` and add these exports after `AiProviderId`:

```ts
export type PreferenceMode = 'auto' | 'manual'

export type AutoPreference<T> =
  | { mode: 'auto'; value?: never }
  | { mode: 'manual'; value: T }

export type ColorMode = 'black-white' | 'color'

export interface UserStylePreset {
  value: string
  label: string
  is_custom: boolean
}

export interface WorkflowPreferenceFields {
  character_detection: AutoPreference<'enabled'>
  style: AutoPreference<string>
  color_mode: AutoPreference<ColorMode>
  aspect_ratio: AutoPreference<string>
  page_layout: AutoPreference<string>
  font_family: AutoPreference<string>
  font_size: AutoPreference<string>
  bubble_shape: AutoPreference<string>
  bubble_tail: AutoPreference<boolean>
  text_provider: AutoPreference<AiProviderId>
  image_provider: AutoPreference<AiProviderId>
}

export interface UserPreferences {
  version: number
  fields: WorkflowPreferenceFields
}

export interface PreferencesAvailableOptions {
  style_presets: UserStylePreset[]
  layout_options: string[]
  color_modes: ColorMode[]
  aspect_ratios: string[]
  font_families: string[]
  font_sizes: string[]
  bubble_shapes: string[]
  ai_providers: AiProviderId[]
}

export interface PreferencesResponse {
  preferences: UserPreferences
  available_options: PreferencesAvailableOptions
  layout_options: string[]
  color_modes: ColorMode[]
}

export type UpdatePreferencesRequest = Partial<{
  fields: Partial<WorkflowPreferenceFields>
}>

export type UpdatePreferencesResponse = PreferencesResponse
```

Also update `IUser`:

```ts
  preferences?: UserPreferences
```

Add Auto prep types:

```ts
export interface AutoCharacterReviewItem {
  character: ICharacter
  role: string
}

export interface AutoCharacterConflict {
  candidate: {
    name: string
    aliases: string[]
    description: string
    sex: string
    visual_traits: string[]
    role: string
    confidence: number
  }
  existing_character: ICharacter
  reason: string
  role: string
}

export interface AutoCharacterPrepareRequest {
  story: string
  style_preference?: string
  image_provider?: AiProviderId
  text_provider?: AiProviderId
}

export interface AutoCharacterPrepareResponse {
  reused: AutoCharacterReviewItem[]
  created: AutoCharacterReviewItem[]
  conflicts: AutoCharacterConflict[]
  failed: Array<{ candidate: AutoCharacterConflict['candidate']; error: string; role: string }>
  suggested_roles: Record<number, string>
}

export interface RenderRun {
  id: number
  comic_id: number
  user_id: number
  mode: 'first_page' | 'all_pages' | 'remaining_pages'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted'
  current_page_number: number | null
  requested_pages: number[]
  completed_pages: number[]
  failed_pages: number[]
  abort_requested: boolean
  job_id: string | null
  error_message: string | null
}
```

- [ ] **Step 4: Expand frontend option constants**

Modify `frontend/src/config/preferences.ts`:

```ts
export const DEFAULT_ASPECT_RATIOS = ['16:9', '4:3', '3:4', '1:1', '2:3', '3:2'] as const
export const DEFAULT_FONT_FAMILIES = ['source-han-sans', 'yahei', 'heiti', 'songti'] as const
export const DEFAULT_FONT_SIZES = ['18', '20', '22', '24', '28'] as const
export const DEFAULT_BUBBLE_SHAPES = ['rect', 'round'] as const
```

- [ ] **Step 5: Implement frontend auto preference utility**

Create `frontend/src/lib/auto-preferences.ts`:

```ts
import {
  DEFAULT_ASPECT_RATIOS,
  DEFAULT_BUBBLE_SHAPES,
  DEFAULT_COLOR_MODES,
  DEFAULT_FONT_FAMILIES,
  DEFAULT_FONT_SIZES,
  DEFAULT_LAYOUT_OPTIONS,
  DEFAULT_STYLE_PRESETS,
} from '@/config/preferences'
import type { AiProviderId, AutoPreference, WorkflowPreferenceFields } from '@/service/types'

const AI_PROVIDERS: AiProviderId[] = ['gemini', 'third_party']

export function autoPreference<T>(): AutoPreference<T> {
  return { mode: 'auto' }
}

export function manualPreference<T>(value: T): AutoPreference<T> {
  return { mode: 'manual', value }
}

function validManual<T>(raw: unknown, allowed: readonly T[]): AutoPreference<T> {
  if (!raw || typeof raw !== 'object') return autoPreference<T>()
  const candidate = raw as { mode?: string; value?: unknown }
  if (candidate.mode !== 'manual') return autoPreference<T>()
  return (allowed as readonly unknown[]).includes(candidate.value)
    ? manualPreference(candidate.value as T)
    : autoPreference<T>()
}

export function normalizePreferenceFields(raw: unknown): WorkflowPreferenceFields {
  const source = raw && typeof raw === 'object' ? raw as Partial<Record<keyof WorkflowPreferenceFields, unknown>> : {}

  return {
    character_detection: validManual(source.character_detection, ['enabled'] as const),
    style: validManual(source.style, DEFAULT_STYLE_PRESETS.map((preset) => preset.value)),
    color_mode: validManual(source.color_mode, DEFAULT_COLOR_MODES),
    aspect_ratio: validManual(source.aspect_ratio, DEFAULT_ASPECT_RATIOS),
    page_layout: validManual(source.page_layout, DEFAULT_LAYOUT_OPTIONS),
    font_family: validManual(source.font_family, DEFAULT_FONT_FAMILIES),
    font_size: validManual(source.font_size, DEFAULT_FONT_SIZES),
    bubble_shape: validManual(source.bubble_shape, DEFAULT_BUBBLE_SHAPES),
    bubble_tail: validManual(source.bubble_tail, [true, false] as const),
    text_provider: validManual(source.text_provider, AI_PROVIDERS),
    image_provider: validManual(source.image_provider, AI_PROVIDERS),
  }
}

export function resolvePreferenceValue<T>(preference: AutoPreference<T> | undefined, fallback: T): T {
  return preference?.mode === 'manual' ? preference.value : fallback
}
```

- [ ] **Step 6: Add Auto and render-run API clients**

Create `frontend/src/apis/auto.ts`:

```ts
import request from '@/service'
import type { AutoCharacterPrepareRequest, AutoCharacterPrepareResponse } from '@/service/types'

export const AutoApi = {
  prepareCharacters(body: AutoCharacterPrepareRequest) {
    return request<AutoCharacterPrepareRequest, AutoCharacterPrepareResponse>({
      url: '/api/auto/characters/prepare',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },
}

export default AutoApi
```

Modify `frontend/src/apis/panels.ts`:

```ts
import type { AiProviderId, RenderRun, SetPanelLayoutRequest } from '@/service/types'
```

Add:

```ts
  startRenderRun(comicId: number, body: {
    mode: 'first_page' | 'all_pages' | 'remaining_pages'
    image_provider?: AiProviderId
    text_provider?: AiProviderId
    color_mode?: string
    aspect_ratio?: string
    font_family?: string
    font_size?: string
    bubble_shape?: string
    bubble_tail?: boolean
  }) {
    return request<typeof body, { render_run: RenderRun; comic: any }>({
      url: `/api/panels/${comicId}/render-runs`,
      method: 'POST',
      data: body,
    })
  },

  abortRenderRun(renderRunId: number) {
    return request<void, { render_run: RenderRun }>({
      url: `/api/panels/render-runs/${renderRunId}/abort`,
      method: 'POST',
    })
  },
```

- [ ] **Step 7: Run frontend utility tests**

Run: `cd frontend && npm test -- src/lib/auto-preferences.test.ts`

Expected: PASS.

- [ ] **Step 8: Run frontend type check through build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 9: Commit frontend foundation**

```bash
git add frontend/src/service/types.ts frontend/src/config/preferences.ts frontend/src/apis/auto.ts frontend/src/apis/panels.ts frontend/src/lib/auto-preferences.ts frontend/src/lib/auto-preferences.test.ts
git commit -m "feat: add frontend auto workflow contracts"
```

## Task 5: Add Auto/Pro Mode State And Top-Level Comics UX

**Files:**
- Modify: `frontend/src/pages/comics/atoms.ts`
- Modify: `frontend/src/pages/comics/index.tsx`
- Create: `frontend/src/pages/comics/auto/auto-mode-tab.tsx`
- Test: `frontend/src/pages/comics/__tests__/comics-mode.test.tsx`

- [ ] **Step 1: Write failing mode-switch tests**

Create `frontend/src/pages/comics/__tests__/comics-mode.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import ComicsPage from '../index'

vi.mock('../story/story-tab', () => ({ StoryTab: () => <div>Pro Story Tab</div> }))
vi.mock('../character/characters-tab', () => ({ CharactersTab: () => <div>Pro Characters Tab</div> }))
vi.mock('../panels/panels-tab', () => ({ PanelsTab: () => <div>Pro Panels Tab</div> }))
vi.mock('../image-generation/image-generation-tab', () => ({ ImageGenerationTab: () => <div>Pro Image Tab</div> }))

describe('ComicsPage Auto/Pro mode', () => {
  it('shows Auto mode by default and can switch to Pro', () => {
    render(
      <Provider store={createStore()}>
        <ComicsPage />
      </Provider>,
    )

    expect(screen.getByText('Auto Manga')).toBeInTheDocument()
    expect(screen.getByText('Upload or paste a novel to start.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Pro' }))

    expect(screen.getByText('Pro Story Tab')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run mode-switch test and verify failure**

Run: `cd frontend && npm test -- src/pages/comics/__tests__/comics-mode.test.tsx`

Expected: FAIL because Auto/Pro mode does not exist.

- [ ] **Step 3: Add comics workflow atoms**

Modify `frontend/src/pages/comics/atoms.ts`:

```ts
import type {
  AutoCharacterPrepareResponse,
  AutoPreference,
  ColorMode,
  RenderRun,
} from '@/service/types'
```

Add:

```ts
export type ComicsWorkflowMode = 'auto' | 'pro'
export const workflowModeAtom = atom<ComicsWorkflowMode>('auto')

export interface CurrentComicOverrides {
  style?: AutoPreference<string>
  color_mode?: AutoPreference<ColorMode>
  aspect_ratio?: AutoPreference<string>
  page_layout?: AutoPreference<string>
  font_family?: AutoPreference<string>
  font_size?: AutoPreference<string>
  bubble_shape?: AutoPreference<string>
  bubble_tail?: AutoPreference<boolean>
}

export const currentComicOverridesAtom = atom<CurrentComicOverrides>({})
export const autoCharacterReviewAtom = atom<AutoCharacterPrepareResponse | null>(null)
export const activeRenderRunAtom = atom<RenderRun | null>(null)
```

- [ ] **Step 4: Add initial Auto mode lane component**

Create `frontend/src/pages/comics/auto/auto-mode-tab.tsx`:

```tsx
import { useAtom } from 'jotai'

import { Button } from '@/components/ui/button'

import { fullStoryAtom, mangaTitleAtom, workflowModeAtom } from '../atoms'
import { ComicsWorkflowShell, WorkflowPanel } from '../components/workflow-layout'
import { StoryEditor } from '../story/story-editor'

export function AutoModeTab() {
  const [, setMode] = useAtom(workflowModeAtom)
  const [story] = useAtom(fullStoryAtom)
  const [title] = useAtom(mangaTitleAtom)

  return (
    <ComicsWorkflowShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">Auto Manga</h2>
          <p className="mt-1 text-sm text-muted-foreground">Upload or paste a novel to start.</p>
        </div>
        <Button variant="outline" onClick={() => setMode('pro')}>Open Pro controls</Button>
      </div>
      <WorkflowPanel>
        <StoryEditor />
      </WorkflowPanel>
      <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
        {story.trim()
          ? `Ready to prepare characters for "${title}".`
          : 'Auto will detect characters, choose defaults, and prepare pages after you add story text.'}
      </div>
    </ComicsWorkflowShell>
  )
}
```

- [ ] **Step 5: Add top-level Auto/Pro tabs**

Modify `frontend/src/pages/comics/index.tsx` imports:

```tsx
import { workflowModeAtom } from './atoms'
import { AutoModeTab } from './auto/auto-mode-tab'
```

Inside `ComicsPage`, add:

```tsx
  const [workflowMode, setWorkflowMode] = useAtom(workflowModeAtom)
```

At the top of the return, wrap existing content:

```tsx
    <div className="flex-1">
      <Tabs value={workflowMode} onValueChange={(value) => setWorkflowMode(value as 'auto' | 'pro')}>
        <ComicsWorkflowShell className="pb-0">
          <TabsList className="grid w-full grid-cols-2 sm:w-[260px]">
            <TabsTrigger value="auto">Auto</TabsTrigger>
            <TabsTrigger value="pro">Pro</TabsTrigger>
          </TabsList>
        </ComicsWorkflowShell>
        <TabsContent value="auto" className="mt-0">
          <AutoModeTab />
        </TabsContent>
        <TabsContent value="pro" className="mt-0">
          {/* existing four-tab workflow lives here */}
        </TabsContent>
      </Tabs>
    </div>
```

Move the existing four-step `<Tabs value={activeTab}>...</Tabs>` block into the Pro content.

- [ ] **Step 6: Run mode-switch test**

Run: `cd frontend && npm test -- src/pages/comics/__tests__/comics-mode.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run focused frontend smoke tests**

Run: `cd frontend && npm test -- src/pages/comics/__tests__/comics-mode.test.tsx src/pages/comics/story/__tests__/story-tab.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit Auto/Pro shell**

```bash
git add frontend/src/pages/comics/atoms.ts frontend/src/pages/comics/index.tsx frontend/src/pages/comics/auto/auto-mode-tab.tsx frontend/src/pages/comics/__tests__/comics-mode.test.tsx
git commit -m "feat: add auto and pro comics modes"
```

## Task 6: Build Auto Character Review And Preparation UI

**Files:**
- Create: `frontend/src/pages/comics/auto/character-review.tsx`
- Modify: `frontend/src/pages/comics/auto/auto-mode-tab.tsx`
- Test: `frontend/src/pages/comics/auto/__tests__/character-review.test.tsx`

- [ ] **Step 1: Write failing character review tests**

Create `frontend/src/pages/comics/auto/__tests__/character-review.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import type { AutoCharacterPrepareResponse } from '@/service/types'

import { autoCharacterReviewAtom, selectedCharacterIdsAtom, selectedCharacterRolesAtom } from '../../atoms'
import { CharacterReview } from '../character-review'

vi.mock('../../character/character-upsert-dialog', () => ({
  CharacterUpsertDialog: ({ open }: { open: boolean }) => open ? <div>Edit Character Dialog</div> : null,
}))

function review(): AutoCharacterPrepareResponse {
  return {
    reused: [
      {
        role: 'protagonist',
        character: {
          id: 1,
          user_id: 1,
          name: 'Mira',
          description: 'Red-haired pilot',
          sex: 'female',
          is_public: false,
          style_prompt: null,
          optimized_description: null,
          image_status: 'completed',
          image_url: null,
          image_job_id: null,
          image_error: null,
          created_at: null,
          updated_at: null,
        },
      },
    ],
    created: [],
    conflicts: [
      {
        candidate: {
          name: 'Rook',
          aliases: [],
          description: 'Masked rival',
          sex: 'male',
          visual_traits: ['mask'],
          role: 'antagonist',
          confidence: 0.9,
        },
        existing_character: {
          id: 2,
          user_id: 1,
          name: 'Rook',
          description: 'Gentle healer',
          sex: 'male',
          is_public: false,
          style_prompt: null,
          optimized_description: null,
          image_status: 'idle',
          image_url: null,
          image_job_id: null,
          image_error: null,
          created_at: null,
          updated_at: null,
        },
        reason: 'name_match_description_conflict',
        role: 'antagonist',
      },
    ],
    failed: [],
    suggested_roles: { 1: 'protagonist' },
  }
}

describe('CharacterReview', () => {
  it('renders reused and conflict sections and accepts reused characters', () => {
    const store = createStore()
    store.set(autoCharacterReviewAtom, review())

    render(
      <Provider store={store}>
        <CharacterReview />
      </Provider>,
    )

    expect(screen.getByText('Reused characters')).toBeInTheDocument()
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.getByText('Mira')).toBeInTheDocument()
    expect(screen.getByText('Rook')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Accept character review' }))

    expect(store.get(selectedCharacterIdsAtom)).toEqual([1])
    expect(store.get(selectedCharacterRolesAtom)).toEqual({ 1: 'protagonist' })
  })

  it('opens the existing edit dialog from a conflict', () => {
    const store = createStore()
    store.set(autoCharacterReviewAtom, review())

    render(
      <Provider store={store}>
        <CharacterReview />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Rook' }))

    expect(screen.getByText('Edit Character Dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run character review tests and verify failure**

Run: `cd frontend && npm test -- src/pages/comics/auto/__tests__/character-review.test.tsx`

Expected: FAIL because `CharacterReview` does not exist.

- [ ] **Step 3: Implement character review component**

Create `frontend/src/pages/comics/auto/character-review.tsx`:

```tsx
import { useAtom } from 'jotai'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ICharacter } from '@/service/types'

import {
  activeTabAtom,
  autoCharacterReviewAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  workflowModeAtom,
} from '../atoms'
import { CharacterUpsertDialog } from '../character/character-upsert-dialog'

function CharacterLine({
  character,
  role,
  onEdit,
}: {
  character: ICharacter
  role: string
  onEdit: (character: ICharacter) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <p className="font-medium">{character.name}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{character.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">{role}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${character.name}`} onClick={() => onEdit(character)}>
        <Pencil className="size-4" />
      </Button>
    </div>
  )
}

export function CharacterReview() {
  const [review] = useAtom(autoCharacterReviewAtom)
  const [, setSelectedIds] = useAtom(selectedCharacterIdsAtom)
  const [, setRoles] = useAtom(selectedCharacterRolesAtom)
  const [, setMode] = useAtom(workflowModeAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [editing, setEditing] = useState<ICharacter | undefined>()

  if (!review) return null

  const acceptedItems = [...review.reused, ...review.created]
  const acceptReview = () => {
    setSelectedIds(acceptedItems.map((item) => item.character.id))
    setRoles(Object.fromEntries(acceptedItems.map((item) => [item.character.id, item.role])))
    setMode('pro')
    setActiveTab('characters')
  }

  return (
    <section className="space-y-4 rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold">Character review</h3>
        <p className="text-sm text-muted-foreground">Review reused, created, and conflicting characters before rendering.</p>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Reused characters</h4>
        {[...review.reused, ...review.created].map((item) => (
          <CharacterLine
            key={item.character.id}
            character={item.character}
            role={item.role}
            onEdit={setEditing}
          />
        ))}
      </div>

      {review.conflicts.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-amber-600">Needs review</h4>
          {review.conflicts.map((conflict) => (
            <CharacterLine
              key={`${conflict.existing_character.id}-${conflict.candidate.name}`}
              character={conflict.existing_character}
              role={conflict.role}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      {review.failed.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {review.failed.length} character creation failed. Open Pro controls to add them manually.
        </div>
      )}

      <Button onClick={acceptReview} disabled={acceptedItems.length === 0 || review.conflicts.length > 0}>
        Accept character review
      </Button>

      <CharacterUpsertDialog
        mode="edit"
        open={Boolean(editing)}
        character={editing}
        providers={{ defaults: { image: 'gemini', text: 'gemini' }, providers: { gemini: { image: true, text: true }, third_party: { image: true, text: true } } }}
        onOpenChange={(open) => !open && setEditing(undefined)}
        onSaved={() => setEditing(undefined)}
      />
    </section>
  )
}
```

- [ ] **Step 4: Connect Auto mode to Auto prep**

Modify `frontend/src/pages/comics/auto/auto-mode-tab.tsx`:

```tsx
import toast from 'react-hot-toast'
import { AutoApi } from '@/apis/auto'
import { autoCharacterReviewAtom, imageProviderAtom, textProviderAtom } from '../atoms'
import { CharacterReview } from './character-review'
```

Add state and handler:

```tsx
  const [imageProvider] = useAtom(imageProviderAtom)
  const [textProvider] = useAtom(textProviderAtom)
  const [, setReview] = useAtom(autoCharacterReviewAtom)
  const [preparing, setPreparing] = useState(false)

  const prepareCharacters = async () => {
    if (!story.trim()) {
      toast.error('Add story text before preparing characters')
      return
    }
    try {
      setPreparing(true)
      const response = await AutoApi.prepareCharacters({
        story,
        image_provider: imageProvider,
        text_provider: textProvider,
      })
      setReview(response)
      toast.success('Character review is ready')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to prepare characters')
    } finally {
      setPreparing(false)
    }
  }
```

Render button and review:

```tsx
      <Button size="lg" onClick={prepareCharacters} disabled={preparing || !story.trim()}>
        {preparing ? 'Preparing characters...' : 'Prepare characters'}
      </Button>
      <CharacterReview />
```

- [ ] **Step 5: Run character review tests**

Run: `cd frontend && npm test -- src/pages/comics/auto/__tests__/character-review.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run Auto mode tests**

Run: `cd frontend && npm test -- src/pages/comics/__tests__/comics-mode.test.tsx src/pages/comics/auto/__tests__/character-review.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit character review UI**

```bash
git add frontend/src/pages/comics/auto/auto-mode-tab.tsx frontend/src/pages/comics/auto/character-review.tsx frontend/src/pages/comics/auto/__tests__/character-review.test.tsx
git commit -m "feat: add auto character review"
```

## Task 7: Add Auto Defaults To Pro Controls

**Files:**
- Create: `frontend/src/pages/comics/components/auto-select-control.tsx`
- Modify: `frontend/src/pages/comics/story/manga-style-card.tsx`
- Modify: `frontend/src/pages/comics/story/manga-grid-layout-card.tsx`
- Modify: `frontend/src/pages/comics/story/ai-model-card.tsx`
- Modify: `frontend/src/pages/comics/panels/panels-tab.tsx`
- Test: `frontend/src/pages/comics/components/__tests__/auto-select-control.test.tsx`

- [ ] **Step 1: Write failing Auto control tests**

Create `frontend/src/pages/comics/components/__tests__/auto-select-control.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AutoSelectControl } from '../auto-select-control'

describe('AutoSelectControl', () => {
  it('renders Auto by default and sends manual selections', () => {
    const onChange = vi.fn()
    render(
      <AutoSelectControl
        label="Layout"
        value={{ mode: 'auto' }}
        options={[
          { value: 'auto-grid', label: 'Auto grid' },
          { value: 'grid-2x2', label: '2x2' },
        ]}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Auto')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }))
    fireEvent.click(screen.getByRole('option', { name: '2x2' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'manual', value: 'grid-2x2' })
  })
})
```

- [ ] **Step 2: Run Auto control test and verify failure**

Run: `cd frontend && npm test -- src/pages/comics/components/__tests__/auto-select-control.test.tsx`

Expected: FAIL because `AutoSelectControl` does not exist.

- [ ] **Step 3: Implement shared Auto select control**

Create `frontend/src/pages/comics/components/auto-select-control.tsx`:

```tsx
import type { AutoPreference } from '@/service/types'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface AutoSelectOption<T extends string> {
  value: T
  label: string
}

export function AutoSelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: AutoPreference<T>
  options: AutoSelectOption<T>[]
  onChange: (value: AutoPreference<T>) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Select
        value={value.mode === 'manual' ? value.value : '__auto__'}
        onValueChange={(next) => {
          if (next === '__auto__') {
            onChange({ mode: 'auto' })
            return
          }
          onChange({ mode: 'manual', value: next as T })
        }}
      >
        <SelectTrigger aria-label={label} className="w-44 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__auto__">Auto</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 4: Wire style and layout cards to Auto/manual overrides**

In `manga-style-card.tsx`, read and set `currentComicOverridesAtom`, use `usePreferences`, and replace the toggle group with `AutoSelectControl`. Use style presets from preferences when available:

```tsx
const [overrides, setOverrides] = useAtom(currentComicOverridesAtom)
const { preferences, loading } = usePreferences()
const stylePreference = overrides.style ?? preferences?.fields.style ?? { mode: 'auto' as const }
const styleOptions = (preferences?.available_options?.style_presets ?? DEFAULT_STYLE_PRESETS).map((preset) => ({
  value: preset.value,
  label: preset.label,
}))
```

Render:

```tsx
<AutoSelectControl
  label={String(t('style.title'))}
  value={stylePreference}
  options={styleOptions}
  onChange={(style) => setOverrides((current) => ({ ...current, style }))}
/>
```

In `manga-grid-layout-card.tsx`, use the same pattern for `page_layout`.

- [ ] **Step 5: Wire provider and panels layout defaults**

In `ai-model-card.tsx`, use `currentComicOverridesAtom` for `text_provider` and `image_provider` when that card owns provider choices.

In `panels-tab.tsx`, initialize `selectedLayout` from:

```tsx
const layoutOverride = overrides.page_layout
const preferenceLayout = preferences?.fields.page_layout
const resolvedLayout = resolvePreferenceValue(layoutOverride ?? preferenceLayout, 'auto-grid')
```

When the user picks a concrete layout, set:

```tsx
setOverrides((current) => ({ ...current, page_layout: { mode: 'manual', value } }))
```

When the user picks Auto, set:

```tsx
setOverrides((current) => ({ ...current, page_layout: { mode: 'auto' } }))
```

- [ ] **Step 6: Run Auto control tests**

Run: `cd frontend && npm test -- src/pages/comics/components/__tests__/auto-select-control.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run Pro workflow tests**

Run: `cd frontend && npm test -- src/pages/comics/components/__tests__/auto-select-control.test.tsx src/pages/comics/story/__tests__/story-tab.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit Pro Auto defaults**

```bash
git add frontend/src/pages/comics/components/auto-select-control.tsx frontend/src/pages/comics/story/manga-style-card.tsx frontend/src/pages/comics/story/manga-grid-layout-card.tsx frontend/src/pages/comics/story/ai-model-card.tsx frontend/src/pages/comics/panels/panels-tab.tsx frontend/src/pages/comics/components/__tests__/auto-select-control.test.tsx
git commit -m "feat: default pro controls to auto"
```

## Task 8: Add First/All/Remaining Generation And Abort UI

**Files:**
- Modify: `frontend/src/pages/comics/image-generation/image-generation.tsx`
- Modify: `frontend/src/pages/comics/image-generation/generation-status-panel.tsx`
- Test: `frontend/src/pages/comics/image-generation/__tests__/image-generation.test.tsx`

- [ ] **Step 1: Add failing image-generation tests for render runs**

Append to `frontend/src/pages/comics/image-generation/__tests__/image-generation.test.tsx`:

```tsx
it('starts an all-pages render run', async () => {
  const startRenderRun = vi.fn().mockResolvedValue({
    render_run: {
      id: 9,
      comic_id: 7,
      user_id: 1,
      mode: 'all_pages',
      status: 'queued',
      current_page_number: 1,
      requested_pages: [1, 2],
      completed_pages: [],
      failed_pages: [],
      abort_requested: false,
      job_id: 'run-job',
      error_message: null,
    },
    comic: { id: 7 },
  })
  ;(PanelsApi as any).startRenderRun = startRenderRun
  renderImageGeneration()

  fireEvent.click(screen.getByRole('button', { name: 'Generate all pages' }))

  await waitFor(() => {
    expect(startRenderRun).toHaveBeenCalledWith(7, expect.objectContaining({ mode: 'all_pages' }))
  })
})

it('aborts an active render run', async () => {
  const startRenderRun = vi.fn().mockResolvedValue({
    render_run: {
      id: 9,
      comic_id: 7,
      user_id: 1,
      mode: 'all_pages',
      status: 'running',
      current_page_number: 1,
      requested_pages: [1, 2],
      completed_pages: [],
      failed_pages: [],
      abort_requested: false,
      job_id: 'run-job',
      error_message: null,
    },
    comic: { id: 7 },
  })
  const abortRenderRun = vi.fn().mockResolvedValue({
    render_run: {
      id: 9,
      comic_id: 7,
      user_id: 1,
      mode: 'all_pages',
      status: 'aborted',
      current_page_number: 1,
      requested_pages: [1, 2],
      completed_pages: [],
      failed_pages: [],
      abort_requested: true,
      job_id: 'run-job',
      error_message: null,
    },
  })
  ;(PanelsApi as any).startRenderRun = startRenderRun
  ;(PanelsApi as any).abortRenderRun = abortRenderRun
  renderImageGeneration()

  fireEvent.click(screen.getByRole('button', { name: 'Generate all pages' }))
  await screen.findByRole('button', { name: 'Abort' })
  fireEvent.click(screen.getByRole('button', { name: 'Abort' }))

  await waitFor(() => expect(abortRenderRun).toHaveBeenCalledWith(9))
})
```

- [ ] **Step 2: Run image-generation tests and verify failure**

Run: `cd frontend && npm test -- src/pages/comics/image-generation/__tests__/image-generation.test.tsx`

Expected: FAIL because all-pages and abort UI is missing.

- [ ] **Step 3: Add render-run state and handlers**

In `image-generation.tsx`, import:

```tsx
import { activeRenderRunAtom, currentComicOverridesAtom } from '../atoms'
import { resolvePreferenceValue } from '@/lib/auto-preferences'
```

Add atom state:

```tsx
const [activeRenderRun, setActiveRenderRun] = useAtom(activeRenderRunAtom)
const [overrides] = useAtom(currentComicOverridesAtom)
```

Add:

```tsx
const startRenderRun = async (mode: 'first_page' | 'all_pages' | 'remaining_pages') => {
  if (!comicId) {
    toast.error('请先完成“分镜”步骤后再来生图')
    return
  }
  try {
    setIsRendering(true)
    const response = await PanelsApi.startRenderRun(comicId, {
      mode,
      image_provider: imageProvider,
      text_provider: textProvider,
      color_mode: overrides.color_mode?.mode === 'manual' ? overrides.color_mode.value : undefined,
      aspect_ratio: overrides.aspect_ratio?.mode === 'manual' ? overrides.aspect_ratio.value : undefined,
      font_family: overrides.font_family?.mode === 'manual' ? overrides.font_family.value : undefined,
      font_size: overrides.font_size?.mode === 'manual' ? overrides.font_size.value : undefined,
      bubble_shape: overrides.bubble_shape?.mode === 'manual' ? overrides.bubble_shape.value : undefined,
      bubble_tail: overrides.bubble_tail?.mode === 'manual' ? overrides.bubble_tail.value : undefined,
    })
    setActiveRenderRun(response.render_run)
    setComicDetail(response.comic)
    toast.success(mode === 'first_page' ? '已提交第一页生成' : '已提交整本生成')
  } catch (error: any) {
    toast.error(error?.message || '提交生成任务失败')
  } finally {
    setIsRendering(false)
  }
}

const abortRenderRun = async () => {
  if (!activeRenderRun) return
  try {
    const response = await PanelsApi.abortRenderRun(activeRenderRun.id)
    setActiveRenderRun(response.render_run)
    toast.success('已中止后续页面生成')
  } catch (error: any) {
    toast.error(error?.message || '中止失败')
  }
}
```

- [ ] **Step 4: Replace render action buttons**

In the action bar, keep existing single-page `handleGenerate` for backwards-compatible page render if needed, but add the new run buttons:

```tsx
<Button size="lg" onClick={() => startRenderRun('first_page')} disabled={isRendering || !comicId}>
  Generate first page
</Button>
<Button size="lg" variant="outline" onClick={() => startRenderRun('all_pages')} disabled={isRendering || !comicId}>
  Generate all pages
</Button>
{pages.some((page) => page.image_url) && (
  <Button variant="outline" onClick={() => startRenderRun('remaining_pages')} disabled={isRendering || !comicId}>
    Generate remaining pages
  </Button>
)}
{activeRenderRun && ['queued', 'running'].includes(activeRenderRun.status) && (
  <Button variant="destructive" onClick={abortRenderRun}>
    Abort
  </Button>
)}
```

- [ ] **Step 5: Run image-generation tests**

Run: `cd frontend && npm test -- src/pages/comics/image-generation/__tests__/image-generation.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit render-run controls**

```bash
git add frontend/src/pages/comics/image-generation/image-generation.tsx frontend/src/pages/comics/image-generation/generation-status-panel.tsx frontend/src/pages/comics/image-generation/__tests__/image-generation.test.tsx
git commit -m "feat: add page run controls"
```

## Task 9: Extend Active Jobs And Progress Shelf For Render Runs

**Files:**
- Modify: `frontend/src/atoms.ts`
- Modify: `frontend/src/hooks/use-active-jobs.ts`
- Modify: `frontend/src/components/progress-shelf/index.tsx`
- Modify: `frontend/src/components/progress-shelf/progress-row.tsx`
- Test: `frontend/src/hooks/__tests__/use-active-jobs.test.ts`
- Test: `frontend/src/components/progress-shelf/__tests__/progress-shelf.test.tsx`

- [ ] **Step 1: Write failing progress shelf test**

Create `frontend/src/components/progress-shelf/__tests__/progress-shelf.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import PanelsApi from '@/apis/panels'
import { activeJobsAtom } from '@/atoms'

import { ProgressShelf } from '../index'

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/apis/panels', () => ({
  default: { abortRenderRun: vi.fn() },
}))

describe('ProgressShelf render runs', () => {
  it('shows page progress and aborts active render runs', async () => {
    const store = createStore()
    store.set(activeJobsAtom, [
      {
        job_id: 'run-job',
        render_run_id: 12,
        comic_id: 7,
        stage: 'render',
        status: 'running',
        title: 'Auto Book',
        render_progress: { completed: 1, total: 4 },
      } as any,
    ])
    vi.mocked(PanelsApi.abortRenderRun).mockResolvedValue({ render_run: { id: 12, status: 'aborted' } } as any)

    render(
      <Provider store={store}>
        <ProgressShelf />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 job running/i }))

    expect(screen.getByText('1 / 4 pages')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abort' }))

    await waitFor(() => expect(PanelsApi.abortRenderRun).toHaveBeenCalledWith(12))
  })
})
```

- [ ] **Step 2: Run progress shelf test and verify failure**

Run: `cd frontend && npm test -- src/components/progress-shelf/__tests__/progress-shelf.test.tsx`

Expected: FAIL because `render_run_id` and Abort rendering are not supported.

- [ ] **Step 3: Extend active job types**

Modify `frontend/src/atoms.ts`:

```ts
  render_run_id?: number | null
```

in `ActiveJobEntry`.

- [ ] **Step 4: Normalize render runs in active jobs hook**

Modify `frontend/src/hooks/use-active-jobs.ts` `normalizeActiveJob`:

```ts
    render_run_id: (job as any).render_run_id ?? null,
    render_progress: (job as any).render_progress ?? null,
```

Keep existing comic-derived progress as fallback in `enrichJob`:

```ts
    render_progress: job.render_progress ?? countRenderProgress(resolvedComic),
```

- [ ] **Step 5: Add Abort to progress shelf rows**

In `progress-row.tsx`, accept an `onAbort` prop and render:

```tsx
{job.render_progress && (
  <p className="text-xs text-slate-300">
    {job.render_progress.completed} / {job.render_progress.total} pages
  </p>
)}
{job.render_run_id && ['queued', 'running'].includes(job.status) && (
  <Button
    type="button"
    variant="destructive"
    size="sm"
    onClick={(event) => {
      event.stopPropagation()
      onAbort?.(job.render_run_id!)
    }}
  >
    Abort
  </Button>
)}
```

In `index.tsx`, import `PanelsApi` and add:

```tsx
  const handleAbort = async (renderRunId: number) => {
    await PanelsApi.abortRenderRun(renderRunId)
  }
```

Pass `onAbort={handleAbort}` to `ProgressRow`.

- [ ] **Step 6: Run progress shelf tests**

Run: `cd frontend && npm test -- src/components/progress-shelf/__tests__/progress-shelf.test.tsx src/hooks/__tests__/use-active-jobs.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit progress shelf render runs**

```bash
git add frontend/src/atoms.ts frontend/src/hooks/use-active-jobs.ts frontend/src/components/progress-shelf/index.tsx frontend/src/components/progress-shelf/progress-row.tsx frontend/src/components/progress-shelf/__tests__/progress-shelf.test.tsx
git commit -m "feat: show render runs in progress shelf"
```

## Task 10: Integrated Verification And Polish

**Files:**
- Modify: changed files from prior tasks only when verification exposes defects.
- Test: backend and frontend suites listed below.

- [ ] **Step 1: Run backend focused suite**

Run:

```bash
pytest \
  tests/test_auto_preferences.py \
  tests/test_auto_prep.py \
  tests/test_render_runs.py \
  tests/test_job_routes.py \
  tests/test_story_panel_routes.py \
  tests/test_jobs_workflow.py \
  tests/test_character_routes.py \
  -v
```

Expected: PASS.

- [ ] **Step 2: Run full backend tests**

Run: `pytest -q`

Expected: PASS.

- [ ] **Step 3: Run frontend focused tests**

Run:

```bash
cd frontend && npm test -- \
  src/lib/auto-preferences.test.ts \
  src/pages/comics/__tests__/comics-mode.test.tsx \
  src/pages/comics/auto/__tests__/character-review.test.tsx \
  src/pages/comics/components/__tests__/auto-select-control.test.tsx \
  src/pages/comics/image-generation/__tests__/image-generation.test.tsx \
  src/components/progress-shelf/__tests__/progress-shelf.test.tsx \
  src/hooks/__tests__/use-active-jobs.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `cd frontend && npm run lint`

Expected: PASS.

- [ ] **Step 6: Start the local app for manual smoke**

Run backend and frontend using the project’s usual local commands. If no server is running:

```bash
python app.py
```

and in a second terminal:

```bash
cd frontend && npm run dev
```

Expected: Flask and Vite start without import or type errors.

- [ ] **Step 7: Manual smoke Auto flow**

In the browser:

1. Log in.
2. Open `/comics`.
3. Confirm Auto is selected by default.
4. Paste a short story with two named characters.
5. Click `Prepare characters`.
6. Confirm the review shows reused, created, or conflict states.
7. Resolve conflicts or switch to Pro controls.
8. Generate panels.
9. Click `Generate all pages`.
10. Confirm the progress shelf shows page progress.
11. Click `Abort`.
12. Confirm completed pages remain visible and pending pages stop.

- [ ] **Step 8: Manual smoke Pro flow**

In the browser:

1. Switch to Pro.
2. Confirm style, layout, color, aspect ratio, font, and bubble controls show Auto defaults.
3. Override one layout and one color setting.
4. Generate remaining pages.
5. Confirm the render-run request uses the overridden values.

- [ ] **Step 9: Commit verification fixes**

If verification required fixes:

```bash
git add models.py mangasuperb frontend/src tests
git commit -m "fix: stabilize auto mode generation flow"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: preferences/defaults are covered by Task 1 and Task 4; character extraction/matching/review by Task 2 and Task 6; Auto/Pro UX by Task 5 and Task 7; first/all/remaining render and abort by Task 3 and Task 8; background status panel by Task 9; verification by Task 10.
- Scope: this is one first-iteration plan because each backend foundation feeds the same Auto user path. A separate Auto workspace, publish automation, cross-tab sync, and push notifications are deferred.
- Execution order: backend contracts land before frontend clients; render-run backend lands before render-run UI; progress shelf support lands after render-run API clients.
