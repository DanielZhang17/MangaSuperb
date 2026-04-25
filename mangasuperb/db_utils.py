"""One-off database maintenance helpers."""
from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy import text

from sqlalchemy.exc import SQLAlchemyError

from mangasuperb.extensions import db

logger = logging.getLogger(__name__)


def ensure_aspect_ratio_constraint(app) -> None:
    """Ensure comics.aspect_ratio check allows the full supported set."""
    ctx = None
    if app is not None:
        try:
            ctx = app.app_context()
            ctx.push()
        except Exception:  # pragma: no cover - defensive
            ctx = None

    bind = None
    try:
        bind = db.get_engine(app)
    except Exception:
        try:
            # Fallback to a session-bound connection if engine retrieval fails.
            bind = db.session.connection().engine  # type: ignore[assignment]
        except Exception:
            logger.warning("Skipping aspect_ratio constraint check; database engine unavailable")
            if ctx:
                ctx.pop()
            return

    if bind.dialect.name != "postgresql":
        if ctx:
            ctx.pop()
        return

    desired_values: Iterable[str] = (
        "1:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "9:16",
        "16:9",
        "21:9",
    )
    desired_clause = "CHECK (aspect_ratio IN (" + ",".join(f"'{v}'" for v in desired_values) + "))"

    try:
        with bind.begin() as conn:  # type: ignore[call-arg]
            row = conn.execute(
                text(
                    """
                    SELECT pg_get_constraintdef(oid) AS def
                    FROM pg_constraint
                    WHERE conname = 'comics_aspect_ratio_check'
                    """
                )
            ).mappings().first()

            existing_def = (row or {}).get("def", "") if row else ""
            if existing_def and all(val in existing_def for val in ("1:1", "16:9")):
                if all(val in existing_def for val in desired_values):
                    return  # already updated

            logger.info("Updating comics_aspect_ratio_check to include new ratios")
            conn.execute(text("ALTER TABLE comics DROP CONSTRAINT IF EXISTS comics_aspect_ratio_check"))
            conn.execute(
                text(f"ALTER TABLE comics ADD CONSTRAINT comics_aspect_ratio_check {desired_clause}")
            )
            logger.info("Updated comics_aspect_ratio_check successfully")
    except SQLAlchemyError as exc:  # pragma: no cover - defensive logging
        logger.warning("Failed to update aspect_ratio constraint: %s", exc)
    finally:
        if ctx:
            ctx.pop()
