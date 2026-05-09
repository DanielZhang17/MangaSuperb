"""Tests for comic CRUD operations."""
from __future__ import annotations

import json
from datetime import datetime

from flask import Flask

from mangasuperb.extensions import db
from models import Character, Comic, ComicCharacter, ComicLike, Script, User


def _create_comic_with_script(user_id: int, title: str = "Test Comic") -> Comic:
    """Helper to create a comic with script."""
    script_payload = {
        "story": "A brave hero saves the day.",
        "style_description": "Bold manga style",
        "aspect_ratio": "16:9",
    }
    script = Script(
        user_id=user_id,
        title=title,
        content=json.dumps(script_payload),
    )
    comic = Comic(
        user_id=user_id,
        script=script,
        title=title,
        style_description="Bold manga style",
        aspect_ratio="16:9",
    )
    db.session.add_all([script, comic])
    db.session.flush()
    return comic


def test_get_comic_success(app: Flask, auth_client, user) -> None:
    """Test getting a comic by ID."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id, "Adventure Story")
        db.session.commit()
        comic_id = comic.id

    response = auth_client.get(f"/api/comics/{comic_id}")
    assert response.status_code == 200
    data = response.get_json()
    assert data["id"] == comic_id
    assert data["title"] == "Adventure Story"
    assert data["style_description"] == "Bold manga style"


def test_get_comic_not_found(auth_client) -> None:
    """Test getting a non-existent comic."""
    response = auth_client.get("/api/comics/99999")
    assert response.status_code == 404
    data = response.get_json()
    assert "error" in data


def test_update_comic_title(app: Flask, auth_client, user) -> None:
    """Test updating comic title."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id, "Original Title")
        db.session.commit()
        comic_id = comic.id

    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={"title": "Updated Title"}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["comic"]["title"] == "Updated Title"

    # Verify persistence
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.title == "Updated Title"


def test_update_comic_style_description(app: Flask, auth_client, user) -> None:
    """Test updating comic style description."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id)
        db.session.commit()
        comic_id = comic.id

    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={"style_description": "Dark cyberpunk aesthetic"}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["comic"]["style_description"] == "Dark cyberpunk aesthetic"

    # Verify persistence
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.style_description == "Dark cyberpunk aesthetic"


def test_create_comic_allows_public_character_from_another_user(app: Flask, auth_client) -> None:
    with app.app_context():
        public_owner = User(
            username="public-owner",
            email="public-owner@example.com",
            password_hash="hashed-password",
        )
        db.session.add(public_owner)
        db.session.flush()
        shared_character = Character(
            user_id=public_owner.id,
            name="Shared Hero",
            description="A public character available for reuse.",
            sex="female",
            is_public=True,
            style_prompt="Public visual style.",
            image_status="completed",
        )
        db.session.add(shared_character)
        db.session.commit()
        character_id = shared_character.id

    response = auth_client.post(
        "/api/comics",
        json={
            "title": "Shared Cast",
            "story": "A public hero joins a new adventure.",
            "style_description": "Modern manga",
            "aspect_ratio": "16:9",
            "characters": [{"id": character_id, "role": "supporting"}],
        },
    )

    assert response.status_code == 201
    comic_id = response.get_json()["comic"]["id"]
    with app.app_context():
        link = ComicCharacter.query.filter_by(
            comic_id=comic_id,
            character_id=character_id,
        ).one_or_none()
        assert link is not None
        assert link.role == "supporting"


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


def test_update_comic_multiple_fields(app: Flask, auth_client, user) -> None:
    """Test updating multiple comic fields at once. PATCH never flips is_public."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id, "Old Title")
        db.session.commit()
        comic_id = comic.id

    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={
            "title": "New Title",
            "style_description": "Watercolor style",
            "is_public": True
        }
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["comic"]["title"] == "New Title"
    assert data["comic"]["style_description"] == "Watercolor style"
    assert data["comic"]["is_public"] is False

    # Verify persistence
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.title == "New Title"
        assert persisted.style_description == "Watercolor style"
        assert persisted.is_public is False


def test_update_comic_empty_title_rejected(app: Flask, auth_client, user) -> None:
    """Test that empty title is rejected."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id)
        db.session.commit()
        comic_id = comic.id

    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={"title": "   "}
    )
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data
    assert "empty" in data["error"].lower()


def test_update_comic_empty_style_rejected(app: Flask, auth_client, user) -> None:
    """Test that empty style description is rejected."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id)
        db.session.commit()
        comic_id = comic.id

    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={"style_description": ""}
    )
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data


def test_update_comic_not_found(auth_client) -> None:
    """Test updating a non-existent comic."""
    response = auth_client.patch(
        "/api/comics/99999",
        json={"title": "New Title"}
    )
    assert response.status_code == 404
    data = response.get_json()
    assert "error" in data


def test_update_comic_unauthorized(app: Flask, auth_client, user, client) -> None:
    """Test that users can't update comics they don't own."""
    with app.app_context():
        # Create another user
        other_user = User(
            username="otheruser",
            email="other@example.com",
            password_hash="hashed"
        )
        db.session.add(other_user)
        db.session.flush()

        # Create comic owned by other user
        comic = _create_comic_with_script(other_user.id)
        db.session.commit()
        comic_id = comic.id

    # Try to update with current user (should fail)
    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={"title": "Hacked Title"}
    )
    assert response.status_code == 404  # Returns 404 to avoid leaking existence

    # Verify comic was not changed
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.title == "Test Comic"


def test_delete_comic_success(app: Flask, auth_client, user) -> None:
    """Test deleting a comic."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id, "Comic to Delete")
        db.session.commit()
        comic_id = comic.id

    response = auth_client.delete(f"/api/comics/{comic_id}")
    assert response.status_code == 200
    data = response.get_json()
    assert "message" in data
    assert "deleted" in data["message"].lower()

    # Verify comic was deleted
    with app.app_context():
        deleted = db.session.get(Comic, comic_id)
        assert deleted is None


def test_delete_comic_not_found(auth_client) -> None:
    """Test deleting a non-existent comic."""
    response = auth_client.delete("/api/comics/99999")
    assert response.status_code == 404
    data = response.get_json()
    assert "error" in data


def test_delete_comic_unauthorized(app: Flask, auth_client, user) -> None:
    """Test that users can't delete comics they don't own."""
    with app.app_context():
        # Create another user
        other_user = User(
            username="otheruser2",
            email="other2@example.com",
            password_hash="hashed"
        )
        db.session.add(other_user)
        db.session.flush()

        # Create comic owned by other user
        comic = _create_comic_with_script(other_user.id, "Protected Comic")
        db.session.commit()
        comic_id = comic.id

    # Try to delete with current user (should fail)
    response = auth_client.delete(f"/api/comics/{comic_id}")
    assert response.status_code == 404  # Returns 404 to avoid leaking existence

    # Verify comic was not deleted
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.title == "Protected Comic"


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

    with app.app_context():
        assert ComicLike.query.filter_by(comic_id=comic_id).count() == 0


def test_unlike_private_comic_owned_by_other_user_returns_404(app: Flask, auth_client) -> None:
    with app.app_context():
        other = User(
            username="private-owner-2",
            email="private-owner-2@example.com",
            password_hash="x",
        )
        liker = User(
            username="private-liker",
            email="private-liker@example.com",
            password_hash="x",
        )
        db.session.add_all([other, liker])
        db.session.flush()
        comic = _create_comic_with_script(other.id, "Private Comic")
        comic.is_public = False
        existing_like = ComicLike(comic_id=comic.id, user_id=liker.id)
        db.session.add(existing_like)
        db.session.commit()
        comic_id = comic.id
        like_id = existing_like.id

    response = auth_client.delete(f"/api/comics/{comic_id}/like")

    assert response.status_code == 404
    payload = response.get_json()
    assert payload["error"] == "Comic not found"

    with app.app_context():
        persisted_like = db.session.get(ComicLike, like_id)
        assert persisted_like is not None
        assert persisted_like.comic_id == comic_id


def test_like_public_comic_owned_by_other_user_returns_public_payload(
    app: Flask,
    auth_client,
) -> None:
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
    assert payload["comic"]["like_count"] == 1
    assert set(payload["comic"]) == {
        "id",
        "title",
        "cover_image_url",
        "pdf_url",
        "zip_url",
        "published_at",
        "style_description",
        "aspect_ratio",
        "like_count",
    }


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
        other = User(
            username="unpublish-owner",
            email="unpublish-owner@example.com",
            password_hash="x",
        )
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
