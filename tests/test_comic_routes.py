"""Tests for comic CRUD operations."""
from __future__ import annotations

import json

import pytest
from flask import Flask

from mangasuperb.extensions import db
from models import Comic, Script, User


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


def test_update_comic_is_public(app: Flask, auth_client, user) -> None:
    """Test updating comic public visibility."""
    with app.app_context():
        owner = db.session.get(User, user.id)
        comic = _create_comic_with_script(owner.id)
        assert comic.is_public is False
        db.session.commit()
        comic_id = comic.id

    response = auth_client.patch(
        f"/api/comics/{comic_id}",
        json={"is_public": True}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["comic"]["is_public"] is True

    # Verify persistence
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.is_public is True


def test_update_comic_multiple_fields(app: Flask, auth_client, user) -> None:
    """Test updating multiple comic fields at once."""
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
    assert data["comic"]["is_public"] is True

    # Verify persistence
    with app.app_context():
        persisted = db.session.get(Comic, comic_id)
        assert persisted is not None
        assert persisted.title == "New Title"
        assert persisted.style_description == "Watercolor style"
        assert persisted.is_public is True


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
