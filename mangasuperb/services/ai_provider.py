"""AI provider abstraction for image and text generation."""
from __future__ import annotations

import base64
import contextlib
import logging
from io import BytesIO
from typing import Any

import requests
from flask import current_app
from google import genai

from config import Config

logger = logging.getLogger(__name__)


def _cfg(key: str, fallback: Any) -> Any:
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
            with contextlib.suppress(Exception):
                gen_config = types.GenerateContentConfig(
                    image_config=types.ImageConfig(aspect_ratio=aspect_ratio)
                )

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
        timeout = int(
            _cfg(
                "THIRD_PARTY_IMAGE_TIMEOUT_SECONDS",
                Config.THIRD_PARTY_IMAGE_TIMEOUT_SECONDS,
            )
        )

        if not api_key:
            raise ValueError("THIRD_PARTY_API_KEY is not configured")

        full_prompt = f"{prompt}\nUse a {aspect_ratio} aspect ratio." if aspect_ratio else prompt
        refs = list(ref_images or [])

        if model.startswith("gpt-image"):
            return self._generate_with_image_api(
                api_url,
                api_key,
                model,
                full_prompt,
                refs,
                timeout,
            )

        content_parts: list[dict] = []
        for ref in refs:
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
            timeout=timeout,
        )
        if not response.ok:
            raise RuntimeError(_third_party_error_message(response))

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

    def _generate_with_image_api(
        self,
        api_url: str,
        api_key: str,
        model: str,
        prompt: str,
        ref_images: list[dict],
        timeout: int,
    ) -> bytes:
        headers = {"Authorization": f"Bearer {api_key}"}
        if ref_images:
            files = []
            for index, ref in enumerate(ref_images, start=1):
                inline = ref.get("inline_data", {})
                data = inline.get("data")
                if data is None:
                    continue
                image_bytes = (
                    data if isinstance(data, (bytes, bytearray))
                    else base64.b64decode(data)
                )
                mime_type = inline.get("mime_type", "image/png")
                ext = "jpg" if mime_type == "image/jpeg" else "png"
                files.append(
                    (
                        "image[]",
                        (f"reference_{index}.{ext}", bytes(image_bytes), mime_type),
                    )
                )
            if not files:
                raise ValueError("No valid reference image data provided")
            response = requests.post(
                f"{api_url.rstrip('/')}/v1/images/edits",
                headers=headers,
                data={"model": model, "prompt": prompt},
                files=files,
                timeout=timeout,
            )
        else:
            response = requests.post(
                f"{api_url.rstrip('/')}/v1/images/generations",
                headers={**headers, "Content-Type": "application/json"},
                json={"model": model, "prompt": prompt},
                timeout=timeout,
            )

        if not response.ok:
            raise RuntimeError(_third_party_error_message(response, operation="image"))

        image_bytes = _extract_image_api_bytes(response.json())
        if not image_bytes:
            raise ValueError("No image data returned")
        return image_bytes


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
            raise RuntimeError(_third_party_error_message(response, operation="text"))

        content = (
            response.json()
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content") or ""
        )
        if not content:
            raise ValueError("Empty text response")
        return content


PROVIDER_LABELS = {
    "gemini": "Gemini",
    "third_party": "OpenAI",
}


def _configured_provider(raw_provider: str | None, fallback: str) -> str:
    provider = (raw_provider or fallback or "").strip()
    if provider == "openai":
        return "third_party"
    return provider


def _gemini_image_available() -> bool:
    return bool(_cfg("GEMINI_API_KEY", Config.GEMINI_API_KEY)) and bool(
        _cfg("GEMINI_IMAGE_MODEL", Config.GEMINI_IMAGE_MODEL)
    )


def _gemini_text_available() -> bool:
    return bool(_cfg("GEMINI_API_KEY", Config.GEMINI_API_KEY)) and bool(
        _cfg("GEMINI_SCRIPT_MODEL", Config.GEMINI_SCRIPT_MODEL)
    )


def _third_party_image_available() -> bool:
    return all(
        [
            _cfg("THIRD_PARTY_API_URL", Config.THIRD_PARTY_API_URL),
            _cfg("THIRD_PARTY_API_KEY", Config.THIRD_PARTY_API_KEY),
            _cfg("THIRD_PARTY_IMAGE_MODEL", Config.THIRD_PARTY_IMAGE_MODEL),
        ]
    )


def _third_party_text_available() -> bool:
    return all(
        [
            _cfg("THIRD_PARTY_API_URL", Config.THIRD_PARTY_API_URL),
            _cfg("THIRD_PARTY_API_KEY", Config.THIRD_PARTY_API_KEY),
            _cfg("THIRD_PARTY_TEXT_MODEL", Config.THIRD_PARTY_TEXT_MODEL),
        ]
    )


def available_ai_providers() -> dict[str, Any]:
    """Return provider availability without exposing credentials."""

    default_image = _configured_provider(None, Config.IMAGE_PROVIDER)
    default_text = _configured_provider(None, Config.TEXT_PROVIDER)
    return {
        "defaults": {
            "image": _configured_provider(_cfg("IMAGE_PROVIDER", default_image), default_image),
            "text": _configured_provider(_cfg("TEXT_PROVIDER", default_text), default_text),
        },
        "providers": {
            "gemini": {
                "image": _gemini_image_available(),
                "text": _gemini_text_available(),
            },
            "third_party": {
                "image": _third_party_image_available(),
                "text": _third_party_text_available(),
            },
        },
    }


def get_image_provider(provider: str | None = None) -> ImageProvider:
    provider = _configured_provider(provider, _cfg("IMAGE_PROVIDER", Config.IMAGE_PROVIDER))
    if provider == "gemini":
        return GeminiImageProvider()
    if provider == "third_party":
        return ThirdPartyImageProvider()
    raise ValueError(
        f"Unknown IMAGE_PROVIDER: {provider!r}. Use 'gemini' or 'third_party'."
    )


def get_text_provider(provider: str | None = None) -> TextProvider:
    provider = _configured_provider(provider, _cfg("TEXT_PROVIDER", Config.TEXT_PROVIDER))
    if provider == "gemini":
        return GeminiTextProvider()
    if provider == "third_party":
        return ThirdPartyTextProvider()
    raise ValueError(
        f"Unknown TEXT_PROVIDER: {provider!r}. Use 'gemini' or 'third_party'."
    )


def _extract_image_api_bytes(payload: dict[str, Any]) -> bytes | None:
    for item in payload.get("data", []) or []:
        b64_data = item.get("b64_json") or item.get("image_base64")
        if b64_data:
            return base64.b64decode(b64_data)
        url = item.get("url") or ""
        if url.startswith("data:"):
            _, _, encoded = url.partition(",")
            if encoded:
                return base64.b64decode(encoded)
    return None


def _third_party_error_message(response: requests.Response, *, operation: str = "image") -> str:
    if response.status_code == 524:
        return f"Third-party API error 524: upstream {operation} service timed out"
    return f"Third-party API error {response.status_code}: {response.text[:500]}"


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
