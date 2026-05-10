"""Checks that the hand-written schema stays aligned with ORM tables."""
from __future__ import annotations

import re
from pathlib import Path

from mangasuperb.extensions import db
import models  # noqa: F401 - importing registers all model tables


def test_init_sql_creates_every_orm_table() -> None:
    sql = Path("init.sql").read_text(encoding="utf-8")
    created_tables = {
        match.group("name")
        for match in re.finditer(
            r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>[a-zA-Z_][a-zA-Z0-9_]*)",
            sql,
            flags=re.IGNORECASE,
        )
    }
    orm_tables = set(db.metadata.tables)

    assert orm_tables - created_tables == set()
