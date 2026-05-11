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
        content=json.dumps(
            {
                "story": "A pilot finds a hidden city.",
                "style_description": "Classic manga black and white linework.",
                "aspect_ratio": "16:9",
                "color_mode": "black-white",
            }
        ),
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
        comic_id = comic.id
        run_id = run.id

    assert payload["id"] == run_id
    assert payload["comic_id"] == comic_id
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
