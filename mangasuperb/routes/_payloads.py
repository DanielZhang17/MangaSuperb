"""Shared request payload helpers for route modules."""
from __future__ import annotations

from typing import Any, Dict, List, Sequence


def normalize_character_payload(raw: Any) -> List[Dict[str, Any]]:
    """Normalise character association payloads from API requests.

    Accepts either a list of integers or objects with ``id``/``role``/``order`` keys
    and returns a cleaned list containing ``id``, ``order``, and ``role`` values.
    ``order`` defaults to the original list position when not supplied.
    """

    if raw in (None, ""):
        return []

    if isinstance(raw, dict):
        candidates: Sequence[Any] = [raw]
    elif isinstance(raw, (list, tuple)):
        candidates = list(raw)
    else:
        raise ValueError("Characters must be provided as a list of ids or objects")

    normalized: List[Dict[str, Any]] = []
    seen_ids: set[int] = set()

    for idx, entry in enumerate(candidates):
        if entry is None:
            continue

        character_id: Any
        role: Any = None
        order_value: Any = idx

        if isinstance(entry, dict):
            if "id" in entry:
                character_id = entry.get("id")
            elif "character_id" in entry:
                character_id = entry.get("character_id")
            else:
                raise ValueError(f"Character entry at index {idx} is missing an id")

            role = entry.get("role") or entry.get("character_role")

            if entry.get("order") is not None:
                order_value = entry.get("order")
            elif entry.get("position") is not None:
                order_value = entry.get("position")
        elif isinstance(entry, int):
            character_id = entry
        elif isinstance(entry, str):
            entry_stripped = entry.strip()
            if not entry_stripped:
                continue
            if not entry_stripped.isdigit():
                raise ValueError(f"Character id '{entry}' at index {idx} is not a valid integer")
            character_id = int(entry_stripped)
        else:
            raise ValueError(
                "Each character must be represented by an id or object containing an id"
            )

        try:
            character_id_int = int(character_id)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Character entry at index {idx} has an invalid id") from exc

        if character_id_int in seen_ids:
            raise ValueError(f"Duplicate character id {character_id_int} supplied")
        seen_ids.add(character_id_int)

        try:
            order_int = int(order_value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Character entry at index {idx} has an invalid order value") from exc

        role_value: str | None = None
        if isinstance(role, str):
            role_value = role.strip() or None

        normalized.append({
            "id": character_id_int,
            "order": order_int,
            "role": role_value,
        })

    return normalized
