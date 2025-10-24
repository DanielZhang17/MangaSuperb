import importlib
import importlib.util
import sys
import types

REQUIRED_MODULES = [
    "flask",
    "flask_sqlalchemy",
    "flask_login",
    "flask_bcrypt",
    "flask_cors",
    "redis",
    "rq",
]

missing = [name for name in REQUIRED_MODULES if importlib.util.find_spec(name) is None]
if missing:
    import pytest

    pytest.skip(
        "Skipping comic serialization tests: missing dependencies " + ", ".join(missing),
        allow_module_level=True,
    )

if "flask_login" not in sys.modules:
    sys.modules["flask_login"] = types.SimpleNamespace(UserMixin=object)

models = importlib.import_module("models")

Character = models.Character
Comic = models.Comic
ComicCharacter = models.ComicCharacter
Script = models.Script


def make_script() -> Script:
    return Script(user_id=1, title="Script", content="{}")


def test_comic_to_dict_includes_character_summaries():
    script = make_script()
    comic = Comic(
        user_id=1,
        script=script,
        title="Heroic Tale",
        status="pending",
        style_description="Bold lines",
        aspect_ratio="16:9",
    )

    hero = Character(user_id=1, name="Rin", description="A daring adventurer")
    hero.id = 101
    mentor = Character(user_id=1, name="Akio", description="Veteran swordsman")
    mentor.id = 102

    hero_link = ComicCharacter(character=hero, sort_order=0, role="protagonist")
    hero_link.character_id = hero.id
    mentor_link = ComicCharacter(character=mentor, sort_order=1, role="mentor")
    mentor_link.character_id = mentor.id

    comic.comic_characters = [mentor_link, hero_link]

    payload = comic.to_dict()

    assert "characters" in payload
    assert [entry["id"] for entry in payload["characters"]] == [hero.id, mentor.id]
    assert payload["characters"][0]["name"] == "Rin"
    assert payload["characters"][0]["role"] == "protagonist"
    assert payload["characters"][0]["order"] == 0
    assert payload["characters"][1]["name"] == "Akio"
    assert payload["characters"][1]["role"] == "mentor"
    assert payload["characters"][1]["order"] == 1
