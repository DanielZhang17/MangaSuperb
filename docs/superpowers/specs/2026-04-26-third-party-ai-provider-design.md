# Third-Party AI Provider Integration

**Date:** 2026-04-26
**Status:** Approved

## Overview

Add support for a third-party OpenAI-compatible API endpoint alongside the existing Google Gemini SDK, switchable independently for image and text generation via environment variables.

The third-party API (`https://ai.anranz.xyz`) accepts OpenAI-style `/v1/chat/completions` requests and returns image data in `choices[0].message.images[0].image_url.url` as a base64 data URL.

---

## Architecture

A new module `mangasuperb/services/ai_provider.py` introduces a thin provider layer:

- `ImageProvider` — base interface: `generate_image(prompt, ref_images, aspect_ratio) -> bytes`
- `TextProvider` — base interface: `generate_text(prompt) -> str`
- `GeminiImageProvider` — wraps existing `google.genai` image generation logic (moved from `jobs.py`)
- `GeminiTextProvider` — wraps existing `google.genai` text generation logic (moved from `generation.py`)
- `ThirdPartyImageProvider` — calls third-party `/v1/chat/completions` via `requests`
- `ThirdPartyTextProvider` — calls third-party `/v1/chat/completions` via `requests`
- `get_image_provider()` — factory: reads `IMAGE_PROVIDER` config, returns correct instance
- `get_text_provider()` — factory: reads `TEXT_PROVIDER` config, returns correct instance

Existing helpers `_genai_client()`, `_build_image_generation_config()`, `_extract_image_bytes()` in `jobs.py` are used internally by `GeminiImageProvider`. No logic is deleted — only relocated.

---

## Configuration

Six new environment variables added to `config.py` and `.env.example`:

```
IMAGE_PROVIDER=gemini           # "gemini" | "third_party"
TEXT_PROVIDER=gemini            # "gemini" | "third_party"

THIRD_PARTY_API_URL=https://ai.anranz.xyz
THIRD_PARTY_API_KEY=sk-...
THIRD_PARTY_IMAGE_MODEL=gemini-3.1-flash-image
THIRD_PARTY_TEXT_MODEL=gemini-3.1-flash
```

Existing `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `GEMINI_SCRIPT_MODEL` are unchanged. Neither provider validates credentials on startup — errors raise at call time only if the provider is active.

---

## Data Flow

### Interface

```python
generate_image(prompt: str, ref_images: list[dict] | None, aspect_ratio: str) -> bytes
generate_text(prompt: str) -> str
```

`ref_images` items are `{mime_type: str, data: str}` dicts (base64-encoded data), matching the format already used in `jobs.py`.

### Gemini providers
Move existing logic verbatim. `GeminiImageProvider` uses `_genai_client()` + `_build_image_generation_config()` + `_extract_image_bytes()`. `GeminiTextProvider` uses `_genai_client()` + `_extract_text_from_response()`. No behaviour change.

### Third-party providers
Use `requests.post` to call `/v1/chat/completions`:

- **Image**: Build OpenAI multimodal message — ref images as `image_url` content parts, prompt as `text` part. Parse `choices[0].message.images[0].image_url.url`, strip the `data:image/...;base64,` prefix, decode to bytes. Aspect ratio appended as a natural-language instruction in the prompt (e.g. `"Use a 2:3 aspect ratio."`).
- **Text**: Standard chat completion. Return `choices[0].message.content`.

### Call site changes

**`jobs.py`** — 3 image blocks (page render, cover generation, character image) each become:
```python
provider = get_image_provider()
img_data = provider.generate_image(prompt, ref_parts, aspect_ratio)
```

**`generation.py`** — text functions each become:
```python
provider = get_text_provider()
return provider.generate_text(prompt_text)
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Unknown `IMAGE_PROVIDER` / `TEXT_PROVIDER` value | `ValueError` at call time with clear message |
| Missing `THIRD_PARTY_API_KEY` | `ValueError("THIRD_PARTY_API_KEY is not configured")` at call time |
| Third-party non-2xx HTTP response | `RuntimeError` with status code and response body |
| Third-party returns no image data | `ValueError("No image data returned")` |
| Third-party returns empty text | `ValueError("Empty text response")` |
| Gemini errors | Unchanged — existing handling untouched |

---

## Testing

New file: `tests/test_ai_provider.py`

- `get_image_provider()` / `get_text_provider()` return correct class for each valid provider value
- Unknown provider value raises `ValueError`
- `ThirdPartyImageProvider.generate_image()` — mock `requests.post`, assert correct payload shape (multimodal message format), assert base64 decoded to bytes
- `ThirdPartyTextProvider.generate_text()` — mock `requests.post`, assert `choices[0].message.content` returned
- HTTP error response raises `RuntimeError`
- Empty image/text response raises `ValueError`

Existing tests stay green — `GeminiImageProvider` / `GeminiTextProvider` wrap the same logic with no behaviour change, so existing `conftest.py` mocks continue to work.

No integration tests against the live third-party URL.

---

## Out of Scope

- Admin panel for runtime provider switching (future work)
- Any changes to the R2 upload pipeline or job orchestration
