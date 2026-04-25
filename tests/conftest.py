"""Shared pytest fixtures for MangaSuperb tests."""
from __future__ import annotations

from typing import Generator
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

    def fetch_job(self, job_id: str | int):
        for job in self.jobs:
            if str(job.id) == str(job_id):
                return SimpleNamespace(
                    id=job.id,
                    get_status=lambda: "queued",
                )
        return None


class DummyStorage:
    """Record uploads to mimic R2 storage interactions."""

    def __init__(self) -> None:
        self.uploads: list[SimpleNamespace] = []
        self.files: dict[str, bytes] = {}
        self.public_url = "https://cdn.example.com"
        self.bucket_name = "dummy"

    def _store(self, filename: str, data: bytes, content_type: str) -> str:
        url = f"{self.public_url}/{filename}"
        entry = SimpleNamespace(
            image_data=data,
            filename=filename,
            content_type=content_type,
            url=url,
        )
        self.uploads.append(entry)
        self.files[url] = data
        self.files[filename] = data
        return url

    def upload_image(
        self,
        image_data: bytes,
        filename: str,
        *,
        content_type: str = "image/png",
    ) -> str:
        return self._store(filename, image_data, content_type)

    def upload_file(
        self,
        file_data: bytes,
        filename: str,
        *,
        content_type: str = "application/octet-stream",
        prefix: str | None = None,
        cache_control: str | None = None,
    ) -> str:
        return self._store(filename, file_data, content_type)

    def download_file(self, url_or_key: str) -> bytes | None:
        return self.files.get(url_or_key)


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
        IMAGE_PROVIDER="gemini",
        TEXT_PROVIDER="gemini",
        THIRD_PARTY_API_URL="https://test-api.example.com",
        THIRD_PARTY_API_KEY="test-third-party-key",
        THIRD_PARTY_IMAGE_MODEL="test-image-model-tp",
        THIRD_PARTY_TEXT_MODEL="test-text-model-tp",
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
