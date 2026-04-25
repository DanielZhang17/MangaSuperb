# Third-Party AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable third-party OpenAI-compatible API as an alternative to the Google Gemini SDK for image and text generation, switchable independently via `IMAGE_PROVIDER` / `TEXT_PROVIDER` env vars.

**Architecture:** A new `mangasuperb/services/ai_provider.py` module exposes `get_image_provider()` and `get_text_provider()` factories that return the active provider based on config. `jobs.py` and `generation.py` call these factories instead of `google.genai` directly. The Gemini SDK path is preserved unchanged inside `GeminiImageProvider` / `GeminiTextProvider` classes.

**Tech Stack:** Python, Flask, `google-generativeai` (Gemini SDK), `requests` (third-party HTTP calls), pytest, `unittest.mock`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `config.py` | 6 new provider config class vars |
| Modify | `.env.example` | Document new env vars |
| Modify | `tests/conftest.py` | Add new config defaults to `app` fixture |
| Create | `mangasuperb/services/ai_provider.py` | Provider base classes, Gemini + third-party implementations, factory functions |
| Create | `tests/test_ai_provider.py` | Unit tests for all provider classes and factory routing |
| Modify | `mangasuperb/services/jobs.py` | Replace 3 image generation blocks + cover text generation; remove dead helpers |
| Modify | `tests/test_jobs_workflow.py` | Update genai patch target from `jobs.genai` to `ai_provider.genai` |
| Modify | `mangasuperb/services/generation.py` | Replace 3 text generation call sites; remove dead helpers |

---

### Task 1: Add provider config variables

**Files:**
- Modify: `config.py`
- Modify: `.env.example`
- Modify: `tests/conftest.py`

- [ ] **Step 1: Add 6 new vars to `config.py`**

In `config.py`, after the line `GEMINI_IMAGE_MODEL = os.getenv('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image')`, add:

```python
    # AI provider selection ("gemini" or "third_party")
    IMAGE_PROVIDER = os.getenv('IMAGE_PROVIDER', 'gemini')
    TEXT_PROVIDER = os.getenv('TEXT_PROVIDER', 'gemini')

    # Third-party OpenAI-compatible API
    THIRD_PARTY_API_URL = os.getenv('THIRD_PARTY_API_URL', '')
    THIRD_PARTY_API_KEY = os.getenv('THIRD_PARTY_API_KEY', '')
    THIRD_PARTY_IMAGE_MODEL = os.getenv('THIRD_PARTY_IMAGE_MODEL', '')
    THIRD_PARTY_TEXT_MODEL = os.getenv('THIRD_PARTY_TEXT_MODEL', '')
```

- [ ] **Step 2: Add vars to `.env.example`**

After the `# Google Gemini API Configuration` block (after the `GEMINI_IMAGE_MODEL` line), add:

```
# AI Provider Selection
# Set to "gemini" (default) or "third_party" to switch providers independently
IMAGE_PROVIDER=gemini
TEXT_PROVIDER=gemini

# Third-Party OpenAI-Compatible API (used when IMAGE_PROVIDER or TEXT_PROVIDER = "third_party")
THIRD_PARTY_API_URL=https://your-api-endpoint.com
THIRD_PARTY_API_KEY=sk-your-key-here
THIRD_PARTY_IMAGE_MODEL=gemini-3.1-flash-image
THIRD_PARTY_TEXT_MODEL=gemini-3.1-flash
```

- [ ] **Step 3: Add new config defaults to `tests/conftest.py` app fixture**

Inside `app.config.update(...)` in the `app` fixture, after `GEMINI_IMAGE_MODEL="test-image-model"`, add:

```python
        IMAGE_PROVIDER="gemini",
        TEXT_PROVIDER="gemini",
        THIRD_PARTY_API_URL="https://test-api.example.com",
        THIRD_PARTY_API_KEY="test-third-party-key",
        THIRD_PARTY_IMAGE_MODEL="test-image-model-tp",
        THIRD_PARTY_TEXT_MODEL="test-text-model-tp",
```

- [ ] **Step 4: Pin `requests` in `requirements.txt`**

`requests` is a direct dependency of the new third-party provider. It is currently present only as a transitive dependency of `boto3`. Add a pinned version to `requirements.txt`:

```
requests==2.32.5
```

- [ ] **Step 5: Verify existing tests still pass**

```bash
source .venv/bin/activate && python -m pytest -x -q
```

Expected: all tests pass (no behaviour change yet).

- [ ] **Step 6: Commit**

```bash
git add config.py .env.example tests/conftest.py requirements.txt
git commit -m "config: add AI provider selection and third-party API vars"
```

---

### Task 2: Create `ai_provider.py` and its tests

**Files:**
- Create: `mangasuperb/services/ai_provider.py`
- Create: `tests/test_ai_provider.py`

- [ ] **Step 1: Write the test file (all tests will fail — module does not exist yet)**

Create `tests/test_ai_provider.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they all fail with ModuleNotFoundError**

```bash
source .venv/bin/activate && python -m pytest tests/test_ai_provider.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'mangasuperb.services.ai_provider'`

- [ ] **Step 3: Create `mangasuperb/services/ai_provider.py`**

```python
"""AI provider abstraction for image and text generation."""
from __future__ import annotations

import base64
import logging
from io import BytesIO
from typing import Any

import requests
from flask import current_app
from google import genai

from config import Config

logger = logging.getLogger(__name__)


def _cfg(key: str, fallback: str) -> str:
    try:
        return current_app.config.get(key, fallback)
    except RuntimeError:
        return fallback


class ImageProvider:
    def generate_image(
        self, prompt: str, ref_images: list[dict] | None, aspect_ratio: str
    ) -> bytes:
        raise NotImplementedError


class TextProvider:
    def generate_text(self, prompt: str) -> str:
        raise NotImplementedError


class GeminiImageProvider(ImageProvider):
    def generate_image(
        self, prompt: str, ref_images: list[dict] | None, aspect_ratio: str
    ) -> bytes:
        from google.genai import types

        api_key = _cfg("GEMINI_API_KEY", Config.GEMINI_API_KEY)
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        model_name = _cfg("GEMINI_IMAGE_MODEL", Config.GEMINI_IMAGE_MODEL)
        client = genai.Client(api_key=api_key)
        contents: list[Any] = list(ref_images or []) + [prompt]

        gen_config = None
        if aspect_ratio:
            try:
                gen_config = types.GenerateContentConfig(
                    image_config=types.ImageConfig(aspect_ratio=aspect_ratio)
                )
            except Exception:
                pass

        response = client.models.generate_content(
            model=model_name, contents=contents, config=gen_config
        )
        img_data = _extract_gemini_image(response)
        if not img_data:
            raise ValueError("No image data returned")
        return img_data


class GeminiTextProvider(TextProvider):
    def generate_text(self, prompt: str) -> str:
        api_key = _cfg("GEMINI_API_KEY", Config.GEMINI_API_KEY)
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        model_name = _cfg("GEMINI_SCRIPT_MODEL", Config.GEMINI_SCRIPT_MODEL)
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model=model_name, contents=prompt)
        text = _extract_gemini_text(response)
        if not text:
            raise ValueError("Empty text response")
        return text


class ThirdPartyImageProvider(ImageProvider):
    def generate_image(
        self, prompt: str, ref_images: list[dict] | None, aspect_ratio: str
    ) -> bytes:
        api_url = _cfg("THIRD_PARTY_API_URL", Config.THIRD_PARTY_API_URL)
        api_key = _cfg("THIRD_PARTY_API_KEY", Config.THIRD_PARTY_API_KEY)
        model = _cfg("THIRD_PARTY_IMAGE_MODEL", Config.THIRD_PARTY_IMAGE_MODEL)

        if not api_key:
            raise ValueError("THIRD_PARTY_API_KEY is not configured")

        full_prompt = f"{prompt}\nUse a {aspect_ratio} aspect ratio." if aspect_ratio else prompt

        content_parts: list[dict] = []
        for ref in ref_images or []:
            inline = ref.get("inline_data", {})
            data = inline.get("data")
            mime_type = inline.get("mime_type", "image/png")
            if data is None:
                continue
            b64 = base64.b64encode(data).decode() if isinstance(data, (bytes, bytearray)) else data
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{b64}"},
            })
        content_parts.append({"type": "text", "text": full_prompt})

        response = requests.post(
            f"{api_url.rstrip('/')}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": [{"role": "user", "content": content_parts}]},
            timeout=120,
        )
        if not response.ok:
            raise RuntimeError(
                f"Third-party API error {response.status_code}: {response.text[:500]}"
            )

        images = (
            response.json()
            .get("choices", [{}])[0]
            .get("message", {})
            .get("images", [])
        )
        if not images:
            raise ValueError("No image data returned")

        url = images[0].get("image_url", {}).get("url", "")
        if not url:
            raise ValueError("No image data returned")

        _, _, b64_data = url.partition(",")
        return base64.b64decode(b64_data or url)


class ThirdPartyTextProvider(TextProvider):
    def generate_text(self, prompt: str) -> str:
        api_url = _cfg("THIRD_PARTY_API_URL", Config.THIRD_PARTY_API_URL)
        api_key = _cfg("THIRD_PARTY_API_KEY", Config.THIRD_PARTY_API_KEY)
        model = _cfg("THIRD_PARTY_TEXT_MODEL", Config.THIRD_PARTY_TEXT_MODEL)

        if not api_key:
            raise ValueError("THIRD_PARTY_API_KEY is not configured")

        response = requests.post(
            f"{api_url.rstrip('/')}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": [{"role": "user", "content": prompt}]},
            timeout=60,
        )
        if not response.ok:
            raise RuntimeError(
                f"Third-party API error {response.status_code}: {response.text[:500]}"
            )

        content = (
            response.json()
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content") or ""
        )
        if not content:
            raise ValueError("Empty text response")
        return content


def get_image_provider() -> ImageProvider:
    provider = _cfg("IMAGE_PROVIDER", Config.IMAGE_PROVIDER)
    if provider == "gemini":
        return GeminiImageProvider()
    if provider == "third_party":
        return ThirdPartyImageProvider()
    raise ValueError(
        f"Unknown IMAGE_PROVIDER: {provider!r}. Use 'gemini' or 'third_party'."
    )


def get_text_provider() -> TextProvider:
    provider = _cfg("TEXT_PROVIDER", Config.TEXT_PROVIDER)
    if provider == "gemini":
        return GeminiTextProvider()
    if provider == "third_party":
        return ThirdPartyTextProvider()
    raise ValueError(
        f"Unknown TEXT_PROVIDER: {provider!r}. Use 'gemini' or 'third_party'."
    )


def _extract_gemini_image(response: Any) -> bytes | None:
    if getattr(response, "parts", None):
        for part in response.parts:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                data = inline.data
                return base64.b64decode(data) if isinstance(data, str) else data
            if hasattr(part, "as_image"):
                try:
                    buf = BytesIO()
                    part.as_image().save(buf, format="PNG")
                    return buf.getvalue()
                except Exception:
                    continue
    for candidate in getattr(response, "candidates", None) or []:
        for part in getattr(getattr(candidate, "content", None), "parts", None) or []:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                data = inline.data
                return base64.b64decode(data) if isinstance(data, str) else data
            if hasattr(part, "as_image"):
                try:
                    buf = BytesIO()
                    part.as_image().save(buf, format="PNG")
                    return buf.getvalue()
                except Exception:
                    continue
    return None


def _extract_gemini_text(response: Any) -> str:
    text = getattr(response, "text", "") or ""
    if text:
        return text
    for candidate in getattr(response, "candidates", None) or []:
        for part in getattr(getattr(candidate, "content", None), "parts", None) or []:
            part_text = getattr(part, "text", None)
            if part_text:
                text += part_text
    return text
```

- [ ] **Step 4: Run the provider tests to verify they pass**

```bash
source .venv/bin/activate && python -m pytest tests/test_ai_provider.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mangasuperb/services/ai_provider.py tests/test_ai_provider.py
git commit -m "feat: add AI provider abstraction with Gemini and third-party implementations"
```

---

### Task 3: Wire `jobs.py` and fix workflow tests

**Files:**
- Modify: `mangasuperb/services/jobs.py`
- Modify: `tests/test_jobs_workflow.py`

- [ ] **Step 1: Add provider import to `jobs.py`**

At the top of `jobs.py`, after the existing `from mangasuperb.services.generation import (...)` block, add:

```python
from mangasuperb.services.ai_provider import get_image_provider, get_text_provider
```

- [ ] **Step 2: Replace render-page image generation block (around lines 1265–1318)**

Remove:
```python
            model_name = image_model or _config_value(
                "GEMINI_IMAGE_MODEL",
                Config.GEMINI_IMAGE_MODEL,
            )
            image_model_client = _genai_client()
```

And replace the block from `contents: list[Any] = list(ref_parts) + [prompt]` through `raise ValueError("No image data returned from Gemini")` with:

```python
            img_data = get_image_provider().generate_image(
                prompt, ref_parts, normalized_aspect_ratio
            )
```

- [ ] **Step 3: Replace cover generation text + image calls (around lines 1606–1656)**

Replace the entire block from `client = _genai_client()` through `raise ValueError("No cover image data returned from Gemini")` with:

```python
            summary_prompt = (
                "You are a manga editor distilling a finished comic into a single "
                "evocative cover brief.\n"
                f"Title: {comic.title}\n"
                f"Target art style: {comic.style_description}\n"
                "Describe the central conflict, mood, and key characters in under 80 words.\n"
                "Emphasise imagery that would inspire a striking manga cover illustration.\n\n"
                "Story outline:\n"
                + "\n".join(_panel_summary_lines(panels))
            )

            summary_text = get_text_provider().generate_text(summary_prompt)
            if not summary_text:
                raise ValueError("Summary was empty")

            try:
                cover_aspect_ratio = validate_aspect_ratio(
                    comic.aspect_ratio or DEFAULT_ASPECT_RATIO
                )
            except ValueError:
                cover_aspect_ratio = DEFAULT_ASPECT_RATIO

            cover_prompt = (
                f"Design a finished manga cover for '{comic.title}'.\n"
                f"Narrative summary: {summary_text}\n"
                f"Visual direction: {comic.style_description}.\n"
                "Focus on the lead characters in a dramatic composition with space "
                "for title typography at the top."
            )

            img_data = get_image_provider().generate_image(cover_prompt, None, cover_aspect_ratio)
            if not img_data:
                raise ValueError("No cover image data returned")
```

- [ ] **Step 4: Replace character image generation block (around lines 1851–1897)**

Replace from `model_name = _config_value("GEMINI_IMAGE_MODEL", Config.GEMINI_IMAGE_MODEL)` through `raise ValueError("Gemini image generation did not return image data")` with:

```python
            prompt = (
                "Create a polished character concept illustration based on the description below. "
                "Incorporate notable traits and align with the provided reference imagery. "
                "Return a single high-resolution manga/anime style portrait.\n\n"
                f"Character description:\n{prompt_description}"
            )

            ref_image_parts: list[dict] = []
            for idx, ref in enumerate(image_refs):
                data = ref.get("data")
                mime_type = ref.get("mime_type", "image/png")
                if not data:
                    logger.warning("Reference image %s missing data", idx)
                    continue
                try:
                    image_bytes = base64.b64decode(data)
                except Exception:
                    logger.warning("Failed to decode reference image %s", idx)
                    continue
                ref_image_parts.append(
                    {"inline_data": {"mime_type": mime_type, "data": image_bytes}}
                )

            logger.info(
                "Submitting character image prompt job_id=%s character_id=%s reference_count=%s",
                job_id,
                character_id,
                len(ref_image_parts),
            )

            img_data = get_image_provider().generate_image(
                prompt, ref_image_parts, DEFAULT_ASPECT_RATIO
            )
            if not img_data:
                raise ValueError("Image generation did not return image data")
```

- [ ] **Step 5: Remove dead code from `jobs.py`**

Delete the following functions (they are no longer called):
- `_genai_client()` (around line 134)
- `_build_image_generation_config()` (around line 138)
- `_extract_image_bytes()` (around line 151)
- `_extract_text_from_response()` (around line 421)

Remove these now-unused imports from the top of `jobs.py`:
- `from google import genai`
- `from google.genai import types`
- `log_gemini_contents` from the `from mangasuperb.services.generation import (...)` block

- [ ] **Step 6: Fix genai patch in `tests/test_jobs_workflow.py`**

The two `_patch_genai` and `_patch_cover_models` functions currently do:
```python
monkeypatch.setattr(jobs.genai, "Client", lambda api_key: DummyGenAIClient(_generate_content))
```

`jobs.genai` no longer exists. Replace both occurrences with:
```python
from mangasuperb.services import ai_provider
monkeypatch.setattr(ai_provider.genai, "Client", lambda api_key: DummyGenAIClient(_generate_content))
```

The full updated functions look like:

```python
def _patch_genai(monkeypatch: pytest.MonkeyPatch, store: list[str]) -> None:
    from mangasuperb.services import ai_provider

    def _generate_content(*, model: str, contents, config=None):
        store.append(_prompt_text(contents))
        return DummyGenerativeModel(model, []).generate_content(_prompt_text(contents))

    monkeypatch.setattr(ai_provider.genai, "Client", lambda api_key: DummyGenAIClient(_generate_content))


def _patch_cover_models(monkeypatch: pytest.MonkeyPatch, store: list[tuple[str, str]]) -> None:
    from mangasuperb.services import ai_provider

    def _generate_content(*, model: str, contents, config=None):
        prompt = _prompt_text(contents)
        if model == "test-script-model":
            return DummyTextModel(store).generate_content(prompt)
        return DummyCoverImageModel(store).generate_content(prompt)

    monkeypatch.setattr(ai_provider.genai, "Client", lambda api_key: DummyGenAIClient(_generate_content))
```

- [ ] **Step 7: Run the full test suite**

```bash
source .venv/bin/activate && python -m pytest -x -q
```

Expected: all tests pass.

- [ ] **Step 8: Run linter**

```bash
source .venv/bin/activate && ruff check mangasuperb/services/jobs.py
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add mangasuperb/services/jobs.py tests/test_jobs_workflow.py
git commit -m "refactor: wire AI providers into jobs.py, remove dead Gemini helpers"
```

---

### Task 4: Wire `generation.py`

**Files:**
- Modify: `mangasuperb/services/generation.py`

- [ ] **Step 1: Add provider import to `generation.py`**

At the top of `generation.py`, after the existing imports, add:

```python
from mangasuperb.services.ai_provider import get_text_provider
```

- [ ] **Step 2: Replace `generate_script_from_prompt` body**

In `generate_script_from_prompt`, replace from `resolved_model = _resolve_model(...)` through `raw_text = _extract_text_from_response(response)` with:

```python
    prompt_text = build_script_prompt(prompt)
    raw_text = get_text_provider().generate_text(prompt_text)
```

The rest of the function (JSON parsing and validation) stays unchanged.

- [ ] **Step 3: Replace `optimize_character_description` body**

Replace from `resolved_model = _resolve_model(...)` through `optimized = _extract_text_from_response(response).strip()` with:

```python
    prompt_text = CHARACTER_OPTIMIZE_PROMPT.format(description=description)
    optimized = get_text_provider().generate_text(prompt_text).strip()
```

The `if not optimized: raise ValueError(...)` check stays unchanged.

- [ ] **Step 4: Replace `enhance_story_text` body**

Replace from `resolved_model = _resolve_model(...)` through `enhanced = _extract_text_from_response(response).strip()` with:

```python
    enhanced = get_text_provider().generate_text(
        STORY_ENHANCE_PROMPT.format(story=story)
    ).strip()
```

The `if not enhanced: raise ValueError(...)` check stays unchanged.

- [ ] **Step 5: Remove dead code from `generation.py`**

Delete the following now-unused private functions:
- `_genai_client()` (around line 179)
- `_resolve_api_key()` (around line 173)
- `_resolve_model()` (around line 186)
- `_extract_text_from_response()` (around line 89)

Remove the now-unused import:
- `from google import genai`

Keep `log_gemini_contents` (it is defined here and may be used by callers or future logging). Keep all other functions unchanged.

- [ ] **Step 6: Run the full test suite**

```bash
source .venv/bin/activate && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 7: Run linter**

```bash
source .venv/bin/activate && ruff check .
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add mangasuperb/services/generation.py
git commit -m "refactor: wire text provider into generation.py, remove dead Gemini helpers"
```
