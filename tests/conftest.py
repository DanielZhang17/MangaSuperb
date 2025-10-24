"""Shared pytest fixtures for MangaSuperb tests."""
from __future__ import annotations

from collections.abc import Generator
from types import SimpleNamespace

import pytest
from flask import Flask
from sqlalchemy.pool import StaticPool

from mangasuperb.extensions import bcrypt, db, login_manager
from mangasuperb.routes import register_blueprints
from models import User


class DummyJob:
    """Lightweight stand-in for RQ job objects."""

    def __init__(self, index: int, func, args, kwargs):
        self.id = f"dummy-job-{index}"
        self.func = func
        self.args = args
        self.kwargs = kwargs


class DummyQueue:
    """Collect enqueued jobs without requiring Redis."""

    def __init__(self) -> None:
        self.jobs: list[DummyJob] = []

    def enqueue(self, func, *args, **kwargs):
        job = DummyJob(len(self.jobs) + 1, func, args, kwargs)
        self.jobs.append(job)
        return job


class DummyStorage:
    """Record uploads to mimic R2 storage interactions."""

    def __init__(self) -> None:
        self.uploads: list[SimpleNamespace] = []

    def upload_image(
        self,
        image_data: bytes,
        filename: str,
        *,
        content_type: str = "image/png",
    ) -> str:
        self.uploads.append(
            SimpleNamespace(image_data=image_data, filename=filename, content_type=content_type)
        )
        return f"https://cdn.example.com/{filename}"


@pytest.fixture
def app() -> Generator[Flask, None, None]:
    """Create a Flask application configured for tests."""

    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SECRET_KEY="test-secret",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
        SQLALCHEMY_SESSION_OPTIONS={"expire_on_commit": False},
        RQ_JOB_TIMEOUT=30,
        RQ_RESULT_TTL=30,
        GEMINI_API_KEY="test-api-key",
        GEMINI_SCRIPT_MODEL="test-script-model",
        GEMINI_IMAGE_MODEL="test-image-model",
    )

    db.init_app(app)
    bcrypt.init_app(app)
    login_manager.init_app(app)
    login_manager.session_protection = None

    from mangasuperb import _register_login_handlers

    _register_login_handlers()
    register_blueprints(app)

    dummy_queue = DummyQueue()
    dummy_storage = DummyStorage()
    app.extensions["rq_queue"] = dummy_queue
    app.extensions["redis_conn"] = object()
    app.extensions["r2_storage"] = dummy_storage

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app: Flask):
    return app.test_client()


@pytest.fixture
def user(app: Flask) -> SimpleNamespace:
    """Persist a default user for authenticated requests."""

    with app.app_context():
        user = User(
            username="tester",
            email="tester@example.com",
            password_hash="hashed-password",
        )
        db.session.add(user)
        db.session.commit()
        return SimpleNamespace(id=user.id)


@pytest.fixture
def auth_client(client, user: User):
    """Return a test client authenticated as the default user."""

    with client.session_transaction() as session:
        session["_user_id"] = str(user.id)
        session["_fresh"] = True
    return client


@pytest.fixture
def dummy_queue(app: Flask) -> DummyQueue:
    return app.extensions["rq_queue"]


@pytest.fixture
def dummy_storage(app: Flask) -> DummyStorage:
    return app.extensions["r2_storage"]
