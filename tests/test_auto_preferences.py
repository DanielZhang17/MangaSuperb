from __future__ import annotations

import json

from mangasuperb.extensions import db
from models import User


def test_new_user_preferences_default_to_auto(app):
    with app.app_context():
        user = User(username="auto-new", email="auto-new@example.com", password_hash="x")
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    expected_fields = {
        "character_detection",
        "style",
        "color_mode",
        "aspect_ratio",
        "page_layout",
        "font_family",
        "font_size",
        "bubble_shape",
        "bubble_tail",
        "text_provider",
        "image_provider",
    }
    assert set(prefs["fields"]) == expected_fields
    assert all(value["mode"] == "auto" for value in prefs["fields"].values())


def test_legacy_preferences_become_manual_when_values_are_valid(app):
    legacy = {
        "selected_style": "Classic manga black and white linework.",
        "default_layout": "vertical",
        "color_mode": "color",
    }
    with app.app_context():
        user = User(
            username="legacy",
            email="legacy@example.com",
            password_hash="x",
            preferences=json.dumps(legacy),
        )
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    assert prefs["fields"]["style"] == {
        "mode": "manual",
        "value": "Classic manga black and white linework.",
    }
    assert prefs["fields"]["page_layout"] == {"mode": "manual", "value": "vertical"}
    assert prefs["fields"]["color_mode"] == {"mode": "manual", "value": "color"}
    assert prefs["fields"]["aspect_ratio"]["mode"] == "auto"


def test_legacy_custom_style_preference_is_preserved(app):
    legacy = {
        "style_presets": [
            {
                "value": "Soft watercolor manga panels",
                "label": "Soft Watercolor",
                "is_custom": True,
            }
        ],
        "selected_style": "Soft watercolor manga panels",
    }
    with app.app_context():
        user = User(
            username="legacy-custom",
            email="legacy-custom@example.com",
            password_hash="x",
            preferences=json.dumps(legacy),
        )
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    assert prefs["fields"]["style"] == {
        "mode": "manual",
        "value": "Soft watercolor manga panels",
    }
    custom_presets = [
        preset
        for preset in prefs["style_presets"]
        if preset["value"] == "Soft watercolor manga panels"
    ]
    assert custom_presets == [
        {
            "value": "Soft watercolor manga panels",
            "label": "Soft Watercolor",
            "is_custom": True,
        }
    ]


def test_invalid_preferences_normalize_back_to_auto(app):
    raw = {
        "fields": {
            "style": {"mode": "manual", "value": "unknown style"},
            "page_layout": {"mode": "manual", "value": "spiral"},
            "color_mode": {"mode": "manual", "value": "sepia"},
            "bubble_tail": {"mode": "manual", "value": "yes"},
            "text_provider": {"mode": "manual", "value": "openai"},
        }
    }
    with app.app_context():
        user = User(
            username="invalid",
            email="invalid@example.com",
            password_hash="x",
            preferences=json.dumps(raw),
        )
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    assert prefs["fields"]["style"]["mode"] == "auto"
    assert prefs["fields"]["page_layout"]["mode"] == "auto"
    assert prefs["fields"]["color_mode"]["mode"] == "auto"
    assert prefs["fields"]["bubble_tail"]["mode"] == "auto"
    assert prefs["fields"]["text_provider"]["mode"] == "auto"


def test_numeric_bubble_tail_values_normalize_back_to_auto(app):
    raw = {
        "fields": {
            "bubble_tail": {"mode": "manual", "value": 1},
        }
    }
    with app.app_context():
        user = User(
            username="invalid-bool",
            email="invalid-bool@example.com",
            password_hash="x",
            preferences=json.dumps(raw),
        )
        db.session.add(user)
        db.session.commit()

        prefs = user.get_preferences()

    assert prefs["fields"]["bubble_tail"] == {"mode": "auto"}


def test_update_preferences_accepts_auto_and_valid_manual_values(app, auth_client):
    response = auth_client.put(
        "/api/preferences",
        json={
            "fields": {
                "style": {"mode": "auto"},
                "page_layout": {"mode": "manual", "value": "grid-2x2"},
                "bubble_tail": {"mode": "manual", "value": False},
                "font_size": {"mode": "manual", "value": "24"},
            }
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    fields = payload["preferences"]["fields"]
    assert fields["style"] == {"mode": "auto"}
    assert fields["page_layout"] == {"mode": "manual", "value": "grid-2x2"}
    assert fields["bubble_tail"] == {"mode": "manual", "value": False}
    assert fields["font_size"] == {"mode": "manual", "value": "24"}
    assert "aspect_ratios" in payload["available_options"]
    assert "font_families" in payload["available_options"]
