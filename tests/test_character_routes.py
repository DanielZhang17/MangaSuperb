"""Character route behaviour tests."""
from __future__ import annotations

from typing import Any

from flask import Flask

from mangasuperb.extensions import db
from models import Character, Comic, ComicCharacter, Script, User


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


def test_create_character_without_name(auth_client) -> None:
    response = auth_client.post(
        "/api/characters",
        json={
            "description": "A newly conceived character awaiting a proper name.",
            "sex": "non-binary",
        },
    )
    assert response.status_code == 201
    payload = response.get_json()
    character = payload["character"]
    assert character["name"] == "unspecified"
    assert character["description"].startswith("A newly conceived character")
    assert character["sex"] == "non-binary"
    assert character["image_status"] == "pending"


def test_create_character_enqueues_image_job_without_references(
    app: Flask,
    auth_client,
    user: Any,
    dummy_queue,
) -> None:
    response = auth_client.post(
        "/api/characters",
        json={
            "name": "Scout",
            "description": "Keen-eyed pathfinder with sharp instincts.",
            "sex": "female",
        },
    )
    assert response.status_code == 201
    payload = response.get_json()
    assert payload["job_id"] == dummy_queue.jobs[-1].id
    character_payload = payload["character"]
    assert character_payload["image_status"] == "pending"
    assert character_payload["image_job_id"] == payload["job_id"]
    assert dummy_queue.jobs[-1].kwargs["reference_images"] == []

    with app.app_context():
        persisted = db.session.get(Character, character_payload["id"])
        assert persisted is not None
        assert persisted.image_status == "pending"
        assert persisted.image_job_id == payload["job_id"]


def test_create_character_passes_provider_override_to_image_job(
    auth_client,
    dummy_queue,
) -> None:
    response = auth_client.post(
        "/api/characters",
        json={
            "name": "Provider Scout",
            "description": "A pathfinder rendered by the selected provider.",
            "sex": "female",
            "image_provider": "third_party",
            "text_provider": "third_party",
        },
    )

    assert response.status_code == 201
    job = dummy_queue.jobs[-1]
    assert job.kwargs["image_provider"] == "third_party"


def test_update_character_regenerates_image_with_new_profile_and_provider(
    app: Flask,
    auth_client,
    user: Any,
    dummy_queue,
) -> None:
    with app.app_context():
        owner = db.session.get(User, user.id)
        assert owner is not None
        character = _make_character(
            user_id=owner.id,
            name="Old Name",
            description="Old description",
            sex="unspecified",
            style_prompt="Old style",
        )
        character.image_url = "https://cdn.example.com/old.png"
        character.image_status = "completed"
        db.session.commit()
        character_id = character.id

    response = auth_client.patch(
        f"/api/characters/{character_id}",
        json={
            "name": "白石遥",
            "description": "角色名：白石遥。黑发，高中女生，温柔可靠。",
            "sex": "female",
            "style_prompt": "日式校园漫画风格",
            "image_provider": "third_party",
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["character"]["name"] == "白石遥"
    assert payload["character"]["sex"] == "female"
    assert payload["character"]["image_status"] == "pending"
    assert payload["job_id"] == dummy_queue.jobs[-1].id
    assert dummy_queue.jobs[-1].kwargs["image_provider"] == "third_party"
    assert "白石遥" in dummy_queue.jobs[-1].kwargs["description"]

    with app.app_context():
        persisted = db.session.get(Character, character_id)
        assert persisted is not None
        assert persisted.name == "白石遥"
        assert persisted.description.startswith("角色名：白石遥")
        assert persisted.sex == "female"
        assert persisted.style_prompt == "日式校园漫画风格"
        assert persisted.image_status == "pending"
        assert persisted.image_error is None


def test_update_character_requires_owner(app: Flask, auth_client, user: Any) -> None:
    with app.app_context():
        other = _create_user("other-update", "other-update@example.com")
        character = _make_character(user_id=other.id, name="Private")
        db.session.commit()
        character_id = character.id

    response = auth_client.patch(
        f"/api/characters/{character_id}",
        json={"name": "Nope", "description": "Still private."},
    )

    assert response.status_code == 404
    assert response.get_json()["error"] == "Character not found"


def test_rename_character_updates_only_name(app: Flask, auth_client, user: Any) -> None:
    with app.app_context():
        owner = db.session.get(User, user.id)
        assert owner is not None
        character = _make_character(user_id=owner.id, name="Old Alias")
        db.session.commit()
        character_id = character.id

    response = auth_client.patch(
        f"/api/characters/{character_id}/name",
        json={"name": "New Alias"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["character"]["name"] == "New Alias"

    with app.app_context():
        persisted = db.session.get(Character, character_id)
        assert persisted is not None
        assert persisted.name == "New Alias"


def test_rename_character_rejects_blank_name(app: Flask, auth_client, user: Any) -> None:
    with app.app_context():
        owner = db.session.get(User, user.id)
        assert owner is not None
        character = _make_character(user_id=owner.id, name="Nomad")
        db.session.commit()
        character_id = character.id

    response = auth_client.patch(
        f"/api/characters/{character_id}/name",
        json={"name": "   "},
    )
    assert response.status_code == 400
    data = response.get_json()
    assert data["error"] == "Name is required"


def test_rename_character_requires_owner(app: Flask, auth_client, user: Any) -> None:
    with app.app_context():
        other = _create_user("other", "other@example.com")
        character = _make_character(user_id=other.id, name="Shadow")
        db.session.commit()
        character_id = character.id

    response = auth_client.patch(
        f"/api/characters/{character_id}/name",
        json={"name": "Sunrise"},
    )
    assert response.status_code == 404
    data = response.get_json()
    assert data["error"] == "Character not found"


def test_delete_character_removes_owned_character(app: Flask, auth_client, user: Any) -> None:
    with app.app_context():
        owner = db.session.get(User, user.id)
        assert owner is not None
        character = _make_character(user_id=owner.id, name="Disposable Hero")
        db.session.commit()
        character_id = character.id

    response = auth_client.delete(f"/api/characters/{character_id}")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["message"] == "Character deleted"

    with app.app_context():
        assert db.session.get(Character, character_id) is None


def test_delete_character_requires_ownership(app: Flask, auth_client, user: Any) -> None:
    with app.app_context():
        other = _create_user("other", "other-delete@example.com")
        character = _make_character(user_id=other.id, name="Protected")
        db.session.commit()
        character_id = character.id

    response = auth_client.delete(f"/api/characters/{character_id}")
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Character not found"


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
