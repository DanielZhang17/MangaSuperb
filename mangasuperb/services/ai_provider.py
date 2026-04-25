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
