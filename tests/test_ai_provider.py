"""Tests for the AI provider abstraction layer."""
from __future__ import annotations

import base64
from unittest.mock import MagicMock, patch

import pytest

from mangasuperb.services.ai_provider import (
    GeminiImageProvider,
    GeminiTextProvider,
    ImageProvider,
    TextProvider,
    ThirdPartyImageProvider,
    ThirdPartyTextProvider,
    get_image_provider,
    get_text_provider,
)


# ---------------------------------------------------------------------------
# Factory routing
# ---------------------------------------------------------------------------

def test_get_image_provider_gemini(app):
    with app.app_context():
        app.config["IMAGE_PROVIDER"] = "gemini"
        assert isinstance(get_image_provider(), GeminiImageProvider)


def test_get_image_provider_third_party(app):
    with app.app_context():
        app.config["IMAGE_PROVIDER"] = "third_party"
        assert isinstance(get_image_provider(), ThirdPartyImageProvider)


def test_get_image_provider_unknown_raises(app):
    with app.app_context():
        app.config["IMAGE_PROVIDER"] = "openai"
        with pytest.raises(ValueError, match="Unknown IMAGE_PROVIDER"):
            get_image_provider()


def test_get_text_provider_gemini(app):
    with app.app_context():
        app.config["TEXT_PROVIDER"] = "gemini"
        assert isinstance(get_text_provider(), GeminiTextProvider)


def test_get_text_provider_third_party(app):
    with app.app_context():
        app.config["TEXT_PROVIDER"] = "third_party"
        assert isinstance(get_text_provider(), ThirdPartyTextProvider)


def test_get_text_provider_unknown_raises(app):
    with app.app_context():
        app.config["TEXT_PROVIDER"] = "bard"
        with pytest.raises(ValueError, match="Unknown TEXT_PROVIDER"):
            get_text_provider()


# ---------------------------------------------------------------------------
# GeminiImageProvider
# ---------------------------------------------------------------------------

def test_gemini_image_provider_returns_bytes(app):
    fake_bytes = b"fake_image_data"

    mock_part = MagicMock()
    mock_part.inline_data = MagicMock(data=fake_bytes)
    mock_response = MagicMock()
    mock_response.parts = [mock_part]
    mock_response.candidates = []

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with app.app_context():
        with patch("google.genai.Client", return_value=mock_client):
            result = GeminiImageProvider().generate_image("draw a cat", None, "1:1")

    assert result == fake_bytes


def test_gemini_image_provider_passes_ref_images(app):
    fake_bytes = b"out"

    mock_part = MagicMock()
    mock_part.inline_data = MagicMock(data=fake_bytes)
    mock_response = MagicMock()
    mock_response.parts = [mock_part]
    mock_response.candidates = []

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    ref = {"inline_data": {"mime_type": "image/png", "data": b"ref_bytes"}}

    with app.app_context():
        with patch("google.genai.Client", return_value=mock_client):
            GeminiImageProvider().generate_image("draw a cat", [ref], "2:3")

    call_kwargs = mock_client.models.generate_content.call_args[1]
    assert ref in call_kwargs["contents"]


def test_gemini_image_provider_no_image_raises(app):
    mock_response = MagicMock()
    mock_response.parts = []
    mock_response.candidates = []

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with app.app_context():
        with patch("google.genai.Client", return_value=mock_client):
            with pytest.raises(ValueError, match="No image data returned"):
                GeminiImageProvider().generate_image("draw a cat", None, "1:1")


def test_gemini_image_provider_missing_key_raises(app):
    with app.app_context():
        app.config["GEMINI_API_KEY"] = ""
        with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
            GeminiImageProvider().generate_image("draw a cat", None, "1:1")


# ---------------------------------------------------------------------------
# GeminiTextProvider
# ---------------------------------------------------------------------------

def test_gemini_text_provider_returns_string(app):
    mock_response = MagicMock()
    mock_response.text = "Generated manga script"
    mock_response.candidates = []

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with app.app_context():
        with patch("google.genai.Client", return_value=mock_client):
            result = GeminiTextProvider().generate_text("write a script")

    assert result == "Generated manga script"


def test_gemini_text_provider_empty_response_raises(app):
    mock_response = MagicMock()
    mock_response.text = ""
    mock_response.candidates = []

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with app.app_context():
        with patch("google.genai.Client", return_value=mock_client):
            with pytest.raises(ValueError, match="Empty text response"):
                GeminiTextProvider().generate_text("write a script")


def test_gemini_text_provider_missing_key_raises(app):
    with app.app_context():
        app.config["GEMINI_API_KEY"] = ""
        with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
            GeminiTextProvider().generate_text("write a script")


# ---------------------------------------------------------------------------
# ThirdPartyImageProvider
# ---------------------------------------------------------------------------

def test_third_party_image_provider_returns_bytes(app):
    fake_bytes = b"third_party_image"
    b64 = base64.b64encode(fake_bytes).decode()

    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "images": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                        }
                    ]
                }
            }
        ]
    }

    with app.app_context():
        with patch("requests.post", return_value=mock_resp) as mock_post:
            result = ThirdPartyImageProvider().generate_image("draw a cat", None, "1:1")

    assert result == fake_bytes
    payload = mock_post.call_args[1]["json"]
    assert payload["model"] == "test-image-model-tp"
    text_part = payload["messages"][0]["content"][-1]
    assert text_part["type"] == "text"
    assert "1:1" in text_part["text"]


def test_third_party_image_provider_sends_ref_images(app):
    fake_bytes = b"out"
    b64 = base64.b64encode(fake_bytes).decode()

    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "images": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
                    ]
                }
            }
        ]
    }

    ref = {"inline_data": {"mime_type": "image/png", "data": b"ref_data"}}

    with app.app_context():
        with patch("requests.post", return_value=mock_resp) as mock_post:
            ThirdPartyImageProvider().generate_image("draw", [ref], "2:3")

    content = mock_post.call_args[1]["json"]["messages"][0]["content"]
    image_parts = [p for p in content if p["type"] == "image_url"]
    assert len(image_parts) == 1
    assert image_parts[0]["image_url"]["url"].startswith("data:image/png;base64,")


def test_third_party_image_provider_http_error_raises(app):
    mock_resp = MagicMock()
    mock_resp.ok = False
    mock_resp.status_code = 500
    mock_resp.text = "Internal Server Error"

    with app.app_context():
        with patch("requests.post", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="500"):
                ThirdPartyImageProvider().generate_image("draw a cat", None, "1:1")


def test_third_party_image_provider_no_image_raises(app):
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {"choices": [{"message": {"images": []}}]}

    with app.app_context():
        with patch("requests.post", return_value=mock_resp):
            with pytest.raises(ValueError, match="No image data returned"):
                ThirdPartyImageProvider().generate_image("draw a cat", None, "1:1")


def test_third_party_image_provider_missing_key_raises(app):
    with app.app_context():
        app.config["THIRD_PARTY_API_KEY"] = ""
        with pytest.raises(ValueError, match="THIRD_PARTY_API_KEY"):
            ThirdPartyImageProvider().generate_image("draw a cat", None, "1:1")


# ---------------------------------------------------------------------------
# ThirdPartyTextProvider
# ---------------------------------------------------------------------------

def test_third_party_text_provider_returns_string(app):
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "Generated text"}}]
    }

    with app.app_context():
        with patch("requests.post", return_value=mock_resp) as mock_post:
            result = ThirdPartyTextProvider().generate_text("write a script")

    assert result == "Generated text"
    payload = mock_post.call_args[1]["json"]
    assert payload["model"] == "test-text-model-tp"
    assert payload["messages"][0]["content"] == "write a script"


def test_third_party_text_provider_http_error_raises(app):
    mock_resp = MagicMock()
    mock_resp.ok = False
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized"

    with app.app_context():
        with patch("requests.post", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="401"):
                ThirdPartyTextProvider().generate_text("write a script")


def test_third_party_text_provider_empty_response_raises(app):
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {"choices": [{"message": {"content": ""}}]}

    with app.app_context():
        with patch("requests.post", return_value=mock_resp):
            with pytest.raises(ValueError, match="Empty text response"):
                ThirdPartyTextProvider().generate_text("write a script")


def test_third_party_text_provider_missing_key_raises(app):
    with app.app_context():
        app.config["THIRD_PARTY_API_KEY"] = ""
        with pytest.raises(ValueError, match="THIRD_PARTY_API_KEY"):
            ThirdPartyTextProvider().generate_text("write a script")
