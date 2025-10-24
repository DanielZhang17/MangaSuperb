"""Character route behaviour tests."""
from __future__ import annotations

from typing import Any

from flask import Flask

from mangasuperb.extensions import db
from models import Character, User


def _create_user(username: str, email: str) -> User:
    user = User(username=username, email=email, password_hash="hashed")
    db.session.add(user)
    db.session.flush()
    return user


def _make_character(
    *,
    user_id: int,
    name: str,
    description: str = "A mysterious wanderer.",
    sex: str = "unspecified",
    is_public: bool = False,
    style_prompt: str | None = None,
    optimized_description: str | None = None,
) -> Character:
    character = Character(
        user_id=user_id,
        name=name,
        description=description,
        sex=sex,
        is_public=is_public,
        style_prompt=style_prompt,
        optimized_description=optimized_description,
    )
    db.session.add(character)
    return character


def test_list_characters_includes_user_and_public(app: Flask, auth_client, user: Any) -> None:
    with app.app_context():
        owner = db.session.get(User, user.id)
        assert owner is not None

        _make_character(user_id=owner.id, name="Private Hero", sex="female", is_public=False)
        _make_character(user_id=owner.id, name="Public Hero", sex="non-binary", is_public=True)

        public_owner = _create_user("public", "public@example.com")
        _make_character(
            user_id=public_owner.id,
            name="Guardian Nova",
            sex="male",
            is_public=True,
            style_prompt="Galactic armor with dramatic cape.",
        )
        _make_character(
            user_id=public_owner.id,
            name="Hidden Shade",
            sex="other",
            is_public=False,
        )
        db.session.commit()

    response = auth_client.get("/api/characters")
    assert response.status_code == 200
    payload = response.get_json()
    assert isinstance(payload, dict)
    characters = payload.get("characters")
    assert isinstance(characters, list)

    names = {item["name"] for item in characters}
    assert "Private Hero" in names, "Expected user-owned character in response"
    assert "Guardian Nova" in names, "Expected public character in response"
    assert "Hidden Shade" not in names, "Private characters from other users must stay hidden"
    public_hero_entries = [item for item in characters if item["name"] == "Public Hero"]
    assert len(public_hero_entries) == 1, "User-owned public characters should not be duplicated"

    for item in characters:
        assert "sex" in item
        assert "is_public" in item


def test_create_character_rejects_invalid_sex(auth_client) -> None:
    response = auth_client.post(
        "/api/characters",
        json={
            "name": "Rogue Agent",
            "description": "Stealth specialist with adaptive goggles.",
            "sex": "alien",
        },
    )
    assert response.status_code == 400
    data = response.get_json()
    assert data["error"].startswith("Sex must be one of")
