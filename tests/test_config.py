"""Tests for environment-derived application configuration."""
from __future__ import annotations

from config import resolve_database_uri, resolve_redis_url


def test_database_components_override_stale_database_url_by_default(monkeypatch) -> None:
    monkeypatch.setenv("POSTGRES_USER", "manga")
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("POSTGRES_HOST", "localhost")
    monkeypatch.setenv("POSTGRES_PORT", "5534")
    monkeypatch.setenv("POSTGRES_DB", "changed_db")
    monkeypatch.setenv("DATABASE_URL", "postgresql://manga:secret@localhost:5432/manga_dev")

    assert (
        resolve_database_uri()
        == "postgresql://manga:secret@localhost:5534/changed_db"
    )


def test_database_url_can_be_explicit_source(monkeypatch) -> None:
    monkeypatch.setenv("POSTGRES_USER", "manga")
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("POSTGRES_HOST", "localhost")
    monkeypatch.setenv("POSTGRES_PORT", "5534")
    monkeypatch.setenv("POSTGRES_DB", "changed_db")
    monkeypatch.setenv("DATABASE_URL", "postgresql://manga:secret@db.example.com:5432/url_db")
    monkeypatch.setenv("DATABASE_URL_MODE", "url")

    assert resolve_database_uri() == "postgresql://manga:secret@db.example.com:5432/url_db"


def test_database_url_is_used_when_no_components_are_set(monkeypatch) -> None:
    for name in (
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_HOST",
        "POSTGRES_PORT",
        "POSTGRES_DB",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://manga:secret@db.example.com:5432/url_db")

    assert resolve_database_uri() == "postgresql://manga:secret@db.example.com:5432/url_db"


def test_redis_components_override_stale_redis_url_by_default(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_HOST", "localhost")
    monkeypatch.setenv("REDIS_PORT", "6380")
    monkeypatch.setenv("REDIS_DB", "3")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/1")

    assert resolve_redis_url() == "redis://localhost:6380/3"


def test_redis_url_can_be_explicit_source(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_HOST", "localhost")
    monkeypatch.setenv("REDIS_PORT", "6380")
    monkeypatch.setenv("REDIS_DB", "3")
    monkeypatch.setenv("REDIS_URL", "redis://redis.example.com:6379/2")
    monkeypatch.setenv("REDIS_URL_MODE", "url")

    assert resolve_redis_url() == "redis://redis.example.com:6379/2"


def test_docker_defaults_use_compose_service_hosts(monkeypatch) -> None:
    for name in (
        "POSTGRES_HOST",
        "POSTGRES_PORT",
        "POSTGRES_DB",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "DATABASE_URL",
        "REDIS_HOST",
        "REDIS_PORT",
        "REDIS_DB",
        "REDIS_PASSWORD",
        "REDIS_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("MANGASUPERB_DOCKER", "true")

    assert "postgres:5432/manga" in resolve_database_uri()
    assert resolve_redis_url() == "redis://redis:6379/0"
