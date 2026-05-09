"""Automatic character extraction, matching, and creation."""
from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from typing import Any

from flask import current_app
from sqlalchemy import or_

from mangasuperb.extensions import db
from models import Character

ALLOWED_SEX_VALUES = {"male", "female", "non-binary", "unspecified", "other"}
DESCRIPTION_MATCH_THRESHOLD = 0.35
NAME_MATCH_THRESHOLD = 0.88


@dataclass(frozen=True)
class CastCandidate:
    name: str
    aliases: tuple[str, ...]
    description: str
    sex: str
    visual_traits: tuple[str, ...]
    role: str
    confidence: float


def _tokenize(text: str) -> set[str]:
    normalized = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", " ", text.lower())
    return {token for token in normalized.split() if token}


def _similarity(left: str, right: str) -> float:
    left_tokens = _tokenize(left)
    right_tokens = _tokenize(right)
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = left_tokens & right_tokens
    return len(overlap) / max(len(left_tokens), len(right_tokens))


def _normalize_name(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", value.lower())


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?", "", stripped).strip()
        stripped = re.sub(r"```$", "", stripped).strip()

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {"characters": []}

    try:
        parsed = json.loads(stripped[start : end + 1])
    except (TypeError, ValueError):
        return {"characters": []}
    return parsed if isinstance(parsed, dict) else {"characters": []}


def _strings_from_list(raw: Any) -> tuple[str, ...]:
    if not isinstance(raw, list | tuple):
        return ()
    return tuple(str(item).strip() for item in raw if str(item).strip())


def parse_cast_candidates(text: str) -> list[CastCandidate]:
    parsed = _extract_json_object(text)
    raw_items = parsed.get("characters")
    if not isinstance(raw_items, list):
        return []

    candidates: list[CastCandidate] = []
    seen: set[str] = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue

        name = str(raw.get("name") or "").strip()
        description = str(raw.get("description") or "").strip()
        if not name or not description:
            continue

        key = _normalize_name(name)
        if not key or key in seen:
            continue
        seen.add(key)

        sex = str(raw.get("sex") or "unspecified").strip().lower()
        if sex not in ALLOWED_SEX_VALUES:
            sex = "unspecified"

        try:
            confidence = float(raw.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0

        candidates.append(
            CastCandidate(
                name=name,
                aliases=_strings_from_list(raw.get("aliases")),
                description=description,
                sex=sex,
                visual_traits=_strings_from_list(raw.get("visual_traits")),
                role=str(raw.get("role") or "supporting").strip() or "supporting",
                confidence=max(0.0, min(1.0, confidence)),
            )
        )
    return candidates


def build_cast_extraction_prompt(story: str, style_preference: str | None = None) -> str:
    style_line = f"\nStyle preference: {style_preference.strip()}" if style_preference else ""
    return (
        "Extract the recurring manga cast from this story. Return only JSON with a "
        "characters array. Each character must include name, aliases, description, "
        "sex, visual_traits, role, and confidence. Keep descriptions visual and "
        "specific enough to create a character image."
        f"{style_line}\n\nStory:\n{story}"
    )


def extract_cast_candidates(
    story: str,
    *,
    text_provider: Any,
    style_preference: str | None = None,
) -> list[CastCandidate]:
    prompt = build_cast_extraction_prompt(story, style_preference)
    response = text_provider.generate_text(prompt)
    return parse_cast_candidates(response)


def _accessible_characters(user_id: int) -> list[Character]:
    characters = (
        Character.query.filter(
            or_(Character.user_id == user_id, Character.is_public.is_(True))
        )
        .order_by(Character.name.asc(), Character.id.asc())
        .all()
    )
    return sorted(
        characters,
        key=lambda character: (
            character.user_id != user_id,
            (character.name or "").lower(),
            character.id or 0,
        ),
    )


def _candidate_names(candidate: CastCandidate) -> set[str]:
    names = {candidate.name, *candidate.aliases}
    return {_normalize_name(name) for name in names if _normalize_name(name)}


def _exact_name_matches(candidate: CastCandidate, character: Character) -> bool:
    character_name = _normalize_name(character.name or "")
    if not character_name:
        return False
    return character_name in _candidate_names(candidate)


def _near_name_matches(candidate: CastCandidate, character: Character) -> bool:
    character_name = _normalize_name(character.name or "")
    if not character_name or _exact_name_matches(candidate, character):
        return False
    candidate_names = _candidate_names(candidate)
    return any(
        SequenceMatcher(None, character_name, candidate_name).ratio()
        >= NAME_MATCH_THRESHOLD
        for candidate_name in candidate_names
    )


def _candidate_payload(candidate: CastCandidate) -> dict[str, Any]:
    return asdict(candidate)


def _character_payload(character: Character, role: str) -> dict[str, Any]:
    return {"character": character.to_dict(), "role": role}


def _create_missing_character(
    *,
    user_id: int,
    candidate: CastCandidate,
    image_provider: str | None,
) -> Character:
    from mangasuperb.routes.characters import _enqueue_character_image

    character = Character(
        user_id=user_id,
        name=candidate.name,
        description=candidate.description,
        sex=candidate.sex if candidate.sex in ALLOWED_SEX_VALUES else "unspecified",
        is_public=False,
        style_prompt=candidate.description,
        image_status="idle",
    )
    db.session.add(character)
    db.session.flush()

    try:
        _enqueue_character_image(
            character=character,
            prompt_for_image=candidate.description,
            reference_images=[],
            image_provider=image_provider,
        )
    except Exception as exc:  # pragma: no cover - exercised through queue failures
        current_app.logger.exception("Auto character image enqueue failed")
        character.image_status = "failed"
        character.image_error = str(exc)

    db.session.flush()
    return character


def prepare_characters_from_candidates(
    *,
    user_id: int,
    candidates: Iterable[CastCandidate],
    image_provider: str | None,
) -> dict[str, Any]:
    accessible = _accessible_characters(user_id)
    reused: list[dict[str, Any]] = []
    created: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    for candidate in candidates:
        exact_name_matches = [
            character
            for character in accessible
            if _exact_name_matches(candidate, character)
        ]
        near_name_matches = [
            character
            for character in accessible
            if _near_name_matches(candidate, character)
        ]
        compatible = [
            character
            for character in exact_name_matches
            if _similarity(candidate.description, character.description or "")
            >= DESCRIPTION_MATCH_THRESHOLD
        ]

        if compatible:
            reused.append(_character_payload(compatible[0], candidate.role))
            continue

        if exact_name_matches:
            conflicts.append(
                {
                    "candidate": _candidate_payload(candidate),
                    "existing_character": exact_name_matches[0].to_dict(),
                    "reason": "name_match_description_conflict",
                    "role": candidate.role,
                }
            )
            continue

        if near_name_matches:
            conflicts.append(
                {
                    "candidate": _candidate_payload(candidate),
                    "existing_character": near_name_matches[0].to_dict(),
                    "reason": "near_name_match_needs_review",
                    "role": candidate.role,
                }
            )
            continue

        try:
            character = _create_missing_character(
                user_id=user_id,
                candidate=candidate,
                image_provider=image_provider,
            )
            db.session.commit()
            created.append(_character_payload(character, candidate.role))
            accessible.append(character)
        except Exception as exc:
            db.session.rollback()
            current_app.logger.exception("Auto character creation failed")
            failed.append(
                {
                    "candidate": _candidate_payload(candidate),
                    "error": str(exc),
                    "role": candidate.role,
                }
            )

    return {
        "reused": reused,
        "created": created,
        "conflicts": conflicts,
        "failed": failed,
        "suggested_roles": {
            item["character"]["id"]: item["role"] for item in [*reused, *created]
        },
    }
