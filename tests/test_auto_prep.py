"""Auto character preparation service and route tests."""
from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

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


def _character(
    user_id: int,
    name: str,
    description: str,
    *,
    is_public: bool = False,
) -> Character:
    character = Character(
        user_id=user_id,
        name=name,
        description=description,
        sex="unspecified",
        is_public=is_public,
        style_prompt=description,
    )
    db.session.add(character)
    db.session.commit()
    return character


def _candidate(
    name: str,
    description: str,
    *,
    sex: str = "unspecified",
    role: str = "supporting",
    aliases: tuple[str, ...] = (),
    traits: tuple[str, ...] = (),
    confidence: float = 0.9,
) -> CastCandidate:
    return CastCandidate(
        name=name,
        aliases=aliases,
        description=description,
        sex=sex,
        visual_traits=traits,
        role=role,
        confidence=confidence,
    )


def test_auto_prep_reuses_obvious_match(app: Any, user: SimpleNamespace) -> None:
    with app.app_context():
        existing = _character(
            user.id,
            "Mira",
            "A red-haired pilot with a silver jacket.",
        )
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                _candidate(
                    "Mira",
                    "A red-haired pilot wearing a silver jacket.",
                    sex="female",
                    traits=("red hair", "silver jacket"),
                    role="protagonist",
                    confidence=0.95,
                )
            ],
            image_provider=None,
        )

    assert [item["character"]["id"] for item in result["reused"]] == [existing.id]
    assert result["reused"][0]["role"] == "protagonist"
    assert result["created"] == []
    assert result["conflicts"] == []
    assert result["failed"] == []


def test_auto_prep_creates_missing_character(
    app: Any,
    user: SimpleNamespace,
    dummy_queue: Any,
) -> None:
    with app.app_context():
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                _candidate(
                    "Rook",
                    "A masked rival with a black coat.",
                    sex="male",
                    traits=("mask", "black coat"),
                    role="antagonist",
                )
            ],
            image_provider="gemini",
        )
        created = Character.query.filter_by(name="Rook").one()

    assert result["created"][0]["character"]["id"] == created.id
    assert result["created"][0]["role"] == "antagonist"
    assert result["created"][0]["character"]["image_status"] == "pending"
    assert result["failed"] == []
    assert dummy_queue.jobs[-1].kwargs["character_id"] == created.id
    assert dummy_queue.jobs[-1].kwargs["image_provider"] == "gemini"


def test_auto_prep_marks_name_description_conflict(
    app: Any,
    user: SimpleNamespace,
) -> None:
    with app.app_context():
        existing = _character(
            user.id,
            "Mira",
            "A red-haired pilot with a silver jacket.",
        )
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                _candidate(
                    "Mira",
                    "An elderly scholar with white robes.",
                    sex="female",
                    traits=("white robes",),
                    role="supporting",
                )
            ],
            image_provider=None,
        )

    assert result["reused"] == []
    assert result["created"] == []
    assert result["failed"] == []
    assert result["conflicts"][0]["candidate"]["name"] == "Mira"
    assert result["conflicts"][0]["existing_character"]["id"] == existing.id
    assert result["conflicts"][0]["reason"] == "name_match_description_conflict"


def test_auto_prep_near_name_match_requires_review(
    app: Any,
    user: SimpleNamespace,
) -> None:
    with app.app_context():
        existing = _character(
            user.id,
            "Mirae",
            "A red-haired pilot with a silver jacket.",
        )
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                _candidate(
                    "Mira",
                    "A red-haired pilot with a silver jacket.",
                    sex="female",
                    traits=("red hair", "silver jacket"),
                    role="protagonist",
                )
            ],
            image_provider=None,
        )

    assert result["reused"] == []
    assert result["created"] == []
    assert result["failed"] == []
    assert result["conflicts"][0]["candidate"]["name"] == "Mira"
    assert result["conflicts"][0]["existing_character"]["id"] == existing.id
    assert result["conflicts"][0]["reason"] == "near_name_match_needs_review"


def test_auto_prep_does_not_reuse_private_character_from_another_user(
    app: Any,
    user: SimpleNamespace,
    dummy_queue: Any,
) -> None:
    with app.app_context():
        other = User(username="other-auto", email="other-auto@example.com", password_hash="x")
        db.session.add(other)
        db.session.commit()
        hidden = _character(
            other.id,
            "Mira",
            "A red-haired pilot with a silver jacket.",
        )
        hidden_id = hidden.id

        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[
                _candidate(
                    "Mira",
                    "A red-haired pilot with a silver jacket.",
                    sex="female",
                    role="protagonist",
                )
            ],
            image_provider="gemini",
        )
        created = Character.query.filter_by(user_id=user.id, name="Mira").one()

    assert result["reused"] == []
    assert result["conflicts"] == []
    assert result["created"][0]["character"]["id"] == created.id
    assert result["created"][0]["character"]["id"] != hidden_id
    assert dummy_queue.jobs[-1].kwargs["character_id"] == created.id


def test_auto_prep_reports_failed_character_creation(
    app: Any,
    user: SimpleNamespace,
    monkeypatch: Any,
) -> None:
    def fail_add(_instance: Any) -> None:
        raise RuntimeError("database unavailable")

    with app.app_context():
        monkeypatch.setattr("mangasuperb.services.auto_prep.db.session.add", fail_add)
        result = prepare_characters_from_candidates(
            user_id=user.id,
            candidates=[_candidate("Rook", "A masked rival with a black coat.")],
            image_provider=None,
        )

    assert result["reused"] == []
    assert result["created"] == []
    assert result["conflicts"] == []
    assert result["failed"][0]["candidate"]["name"] == "Rook"
    assert "database unavailable" in result["failed"][0]["error"]


def test_auto_prepare_route_extracts_and_prepares_characters(
    app: Any,
    auth_client: Any,
    monkeypatch: Any,
) -> None:
    response_text = json.dumps(
        {
            "characters": [
                {
                    "name": "Mira",
                    "aliases": [],
                    "description": "A red-haired pilot.",
                    "sex": "female",
                    "visual_traits": ["red hair"],
                    "role": "protagonist",
                    "confidence": 0.95,
                }
            ]
        }
    )
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
    assert payload["created"][0]["role"] == "protagonist"
    assert provider.calls
    assert "Mira launches the hidden mech." in provider.calls[0]


def test_auto_prepare_route_uses_current_user_scope(
    app: Any,
    auth_client: Any,
    user: SimpleNamespace,
    monkeypatch: Any,
) -> None:
    with app.app_context():
        other = User(
            username="scope-owner",
            email="scope-owner@example.com",
            password_hash="x",
        )
        db.session.add(other)
        db.session.commit()
        hidden = _character(
            other.id,
            "Mira",
            "A red-haired pilot with a silver jacket.",
        )
        hidden_id = hidden.id

    provider = FakeTextProvider(
        json.dumps(
            {
                "characters": [
                    {
                        "name": "Mira",
                        "aliases": [],
                        "description": "A red-haired pilot with a silver jacket.",
                        "sex": "female",
                        "visual_traits": ["red hair"],
                        "role": "protagonist",
                        "confidence": 0.95,
                    }
                ]
            }
        )
    )
    monkeypatch.setattr(
        "mangasuperb.routes.auto.get_text_provider",
        lambda provider_id=None: provider,
    )

    response = auth_client.post(
        "/api/auto/characters/prepare",
        json={"story": "Mira launches the hidden mech."},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["reused"] == []
    assert payload["conflicts"] == []
    assert payload["created"][0]["character"]["user_id"] == user.id
    assert payload["created"][0]["character"]["id"] != hidden_id


def test_auto_prepare_route_rejects_missing_story(auth_client: Any) -> None:
    response = auth_client.post("/api/auto/characters/prepare", json={"story": " "})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Story is required"


def test_auto_prepare_route_rejects_non_object_payload(auth_client: Any) -> None:
    response = auth_client.post("/api/auto/characters/prepare", json=[])

    assert response.status_code == 400
    assert response.get_json()["error"] == "JSON body must be an object"


def test_auto_prepare_route_rejects_non_string_story(auth_client: Any) -> None:
    response = auth_client.post("/api/auto/characters/prepare", json={"story": 123})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Story must be a string"


def test_auto_prepare_route_rejects_non_string_style_preference(
    auth_client: Any,
) -> None:
    response = auth_client.post(
        "/api/auto/characters/prepare",
        json={"story": "Mira launches the hidden mech.", "style_preference": 123},
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "style_preference must be a string"


def test_auto_prepare_route_rejects_invalid_provider(auth_client: Any) -> None:
    response = auth_client.post(
        "/api/auto/characters/prepare",
        json={"story": "Mira launches the hidden mech.", "image_provider": "bad-ai"},
    )

    assert response.status_code == 400
    assert "image_provider" in response.get_json()["error"]
