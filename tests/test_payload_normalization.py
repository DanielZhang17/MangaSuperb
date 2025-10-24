import importlib.util
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / 'mangasuperb' / 'routes' / '_payloads.py'
SPEC = importlib.util.spec_from_file_location('mangasuperb.routes._payloads', MODULE_PATH)
PAYLOADS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PAYLOADS)
normalize_character_payload = PAYLOADS.normalize_character_payload


def test_normalize_character_payload_accepts_integers():
    payload = normalize_character_payload([3, 1, 2])
    assert payload == [
        {"id": 3, "order": 0, "role": None},
        {"id": 1, "order": 1, "role": None},
        {"id": 2, "order": 2, "role": None},
    ]


def test_normalize_character_payload_accepts_dicts():
    payload = normalize_character_payload(
        [
            {"id": "5", "role": "Hero", "order": "10"},
            {"character_id": 7, "character_role": "Villain"},
        ]
    )

    assert payload == [
        {"id": 5, "order": 10, "role": "Hero"},
        {"id": 7, "order": 1, "role": "Villain"},
    ]


def test_normalize_character_payload_rejects_duplicates():
    with pytest.raises(ValueError, match="Duplicate character id 4 supplied"):
        normalize_character_payload([4, {"id": 4, "order": 2}])


@pytest.mark.parametrize(
    "invalid_entry",
    ["abc", {"role": "No id"}, object()],
)
def test_normalize_character_payload_rejects_invalid_entries(invalid_entry):
    with pytest.raises(ValueError):
        normalize_character_payload([invalid_entry])


@pytest.mark.parametrize("empty_input", [None, "", [], [None, "  "]])
def test_normalize_character_payload_allows_empty(empty_input):
    assert normalize_character_payload(empty_input) == []
