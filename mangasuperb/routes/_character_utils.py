"""Helpers for validating and applying comic character assignments."""
from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from flask_login import current_user
from sqlalchemy import or_

from mangasuperb.extensions import db
from models import Character, Comic, ComicCharacter


@dataclass
class CharacterAssignment:
    """User-selected character assignment for a comic."""

    character: Character
    order_index: int
    role: str | None


def _normalize_character_entries(raw: Sequence[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen: set[int] = set()

    for idx, item in enumerate(raw, start=1):
        order_index = idx
        role: str | None = None

        if isinstance(item, dict):
            char_id = item.get("id") or item.get("character_id")
            if char_id is None:
                raise ValueError("Each character entry must include an 'id'")
            order_value = item.get("order_index") or item.get("order") or item.get("position")
            if order_value is not None:
                try:
                    order_index = int(order_value)
                except (TypeError, ValueError) as exc:
                    raise ValueError("Character order must be an integer") from exc
            role_value = item.get("role") or item.get("character_role")
            if isinstance(role_value, str):
                role_value = role_value.strip()
            role = role_value or None
        else:
            char_id = item

        try:
            char_id_int = int(char_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("Character ids must be integers") from exc

        if char_id_int in seen:
            continue

        seen.add(char_id_int)
        normalized.append(
            {
                "id": char_id_int,
                "order_index": order_index,
                "role": role,
                "position": idx,
            }
        )

    return normalized


def resolve_character_assignments(data: Mapping[str, Any]) -> list[CharacterAssignment]:
    """Extract and validate character assignments from a request payload."""

    raw = data.get("characters")
    if raw is None:
        raw = data.get("character_ids")

    if raw is None:
        return []
    if isinstance(raw, str) or not isinstance(raw, Sequence):
        raise ValueError("characters must be provided as a list")

    normalized = _normalize_character_entries(raw)
    if not normalized:
        return []

    character_ids = [entry["id"] for entry in normalized]
    characters = (
        Character.query.filter(
            Character.id.in_(character_ids),
            or_(Character.user_id == current_user.id, Character.is_public.is_(True)),
        ).all()
    )
    characters_by_id = {character.id: character for character in characters}

    missing = [cid for cid in character_ids if cid not in characters_by_id]
    if missing:
        raise ValueError("One or more characters were not found or are not public")

    assignments: list[CharacterAssignment] = []
    for entry in sorted(normalized, key=lambda item: (item["order_index"], item["position"])):
        character = characters_by_id[entry["id"]]
        assignments.append(
            CharacterAssignment(
                character=character,
                order_index=entry["order_index"],
                role=entry["role"],
            )
        )

    return assignments


def apply_character_assignments(comic: Comic, assignments: Iterable[CharacterAssignment]) -> None:
    """Synchronise the association records for a comic."""

    existing = {link.character_id: link for link in comic.character_links}
    requested_ids = {assignment.character.id for assignment in assignments}

    for link in list(comic.character_links):
        if link.character_id not in requested_ids:
            comic.character_links.remove(link)
            db.session.delete(link)

    for assignment in assignments:
        link = existing.get(assignment.character.id)
        if not link:
            link = ComicCharacter(character=assignment.character)
            comic.character_links.append(link)
        link.order_index = assignment.order_index
        link.role = assignment.role

    db.session.flush()


def build_character_script_payload(
    assignments: Iterable[CharacterAssignment],
) -> list[dict[str, Any]]:
    """Render characters into a serialisable structure for script content."""

    payload: list[dict[str, Any]] = []
    for assignment in assignments:
        character = assignment.character
        payload.append(
            {
                "id": character.id,
                "name": character.name,
                "description": character.description,
                "sex": character.sex,
                "is_public": character.is_public,
                "style_prompt": character.style_prompt,
                "optimized_description": character.optimized_description,
                "order_index": assignment.order_index,
                "role": assignment.role,
            }
        )
    return payload
