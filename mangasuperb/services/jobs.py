"""Background job implementations shared by the API and worker."""
from __future__ import annotations

import base64
import json
import logging
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

import google.generativeai as genai
from flask import current_app

from config import Config
from mangasuperb.extensions import db
from models import Character, Comic, ComicPage, Script

logger = logging.getLogger(__name__)


@contextmanager
def _application_context():
    """Ensure a Flask application context is available."""
    try:
        current_app.name
        yield current_app
        return
    except RuntimeError:
        from mangasuperb import create_app

        app = create_app()
        with app.app_context():
            yield app


def _get_storage():
    storage = current_app.extensions.get("r2_storage")
    if not storage:
        raise RuntimeError("R2 storage is not configured")
    return storage


def _collect_character_context(comic: Comic, script_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return a list of character dictionaries for prompt rendering."""

    characters = script_data.get("characters")
    collected: List[Dict[str, Any]] = []

    if isinstance(characters, Iterable):
        for entry in characters:
            if isinstance(entry, dict):
                collected.append(entry)

    if collected:
        return collected

    return [link.to_summary() for link in comic.comic_characters]


def _render_character_prompt(characters: Iterable[Dict[str, Any]]) -> str:
    """Format characters for inclusion in generation prompts."""

    lines: List[str] = []
    for idx, character in enumerate(characters, start=1):
        name = (character.get("name") or f"Character {idx}").strip()
        role = (character.get("role") or "").strip()
        description = (
            character.get("optimized_description")
            or character.get("description")
            or ""
        ).strip()
        style_prompt = (character.get("style_prompt") or "").strip()

        segments: List[str] = [name]
        if role:
            segments.append(f"Role: {role}")
        if description:
            segments.append(f"Bio: {description}")
        if style_prompt:
            segments.append(f"Visual cues: {style_prompt}")

        lines.append(f"{idx}. {' | '.join(segments)}")

    return "\n".join(lines)


def process_manga_generation(comic_id: int, api_key: str, model_name: str) -> Dict[str, Any]:
    """Generate a full comic page for the provided comic."""
    with _application_context():
        logger.info("=== Starting manga generation for comic_id=%s ===", comic_id)

        try:
            comic = db.session.get(Comic, comic_id)
            if not comic:
                raise ValueError(f"Comic {comic_id} not found")

            script = db.session.get(Script, comic.script_id)
            if not script:
                raise ValueError(f"Script {comic.script_id} not found")

            logger.info("Comic: %s", comic.title)
            logger.info("Script: %s", script.title)

            comic.status = "processing"
            comic.started_at = datetime.utcnow()
            db.session.commit()

            genai.configure(api_key=api_key)
            logger.info("Gemini API configured with model: %s", model_name)

            try:
                script_data = json.loads(script.content)
            except json.JSONDecodeError:
                raise ValueError("Script content is not valid JSON")

            character_context = _collect_character_context(comic, script_data)

            panels = script_data.get("panels", [])
            if not panels:
                raise ValueError("Script has no panels")

            logger.info("Script has %s panels", len(panels))

            image_model_name = Config.GEMINI_IMAGE_MODEL
            image_model = genai.GenerativeModel(image_model_name)

            panels_description = []
            for panel in panels:
                panel_desc = f"Panel {panel['panel_number']}: Scene - {panel['scene']}. "
                if panel.get("dialogue"):
                    panel_desc += f"Dialogue - {panel['dialogue']}. "
                panel_desc += f"Visual details - {panel['visual_notes']}"
                panels_description.append(panel_desc)

            num_panels = len(panels)
            if num_panels <= 3:
                layout_instruction = "Arrange the panels in a vertical single-column layout, reading top to bottom."
            elif num_panels == 4:
                layout_instruction = (
                    "Arrange the panels in a 2x2 grid layout, reading order: top-left, top-right, "
                    "bottom-left, bottom-right."
                )
            elif num_panels == 5:
                layout_instruction = (
                    "Arrange the panels in a mixed layout: 2 panels on top row, 3 panels on bottom row, "
                    "reading left to right, top to bottom."
                )
            else:
                layout_instruction = (
                    "Arrange the panels in a 2x3 grid layout (2 columns, 3 rows), reading order: top to bottom, "
                    "left to right in manga style."
                )

            character_prompt = _render_character_prompt(character_context)

            image_prompt = f"""Generate a complete manga page with {num_panels} panels arranged as follows:

{layout_instruction}

Title: {script_data.get('title', comic.title)}
Overall Style: {script_data.get('style_notes') or comic.style_description}
Preferred Aspect Ratio: {comic.aspect_ratio}

Characters:
{character_prompt or 'Use the established cast from the script and maintain consistent appearances.'}

Panel Details:
{chr(10).join(panels_description)}

Requirements:
- Draw ALL {num_panels} panels on a single manga page
- Use classic manga/anime art style with clean black and white linework
- Include panel borders to clearly separate each scene
- Add dramatic angles and expressive character emotions
- Maintain visual consistency across all panels
- Leave space for dialogue text if needed
- Follow traditional manga composition and layout principles"""

            logger.info("Generating manga page image...")
            result = image_model.generate_content(image_prompt)

            img_data: Optional[bytes] = None
            if result.candidates:
                candidate = result.candidates[0]
                content = getattr(candidate, "content", None)
                if content and content.parts:
                    for part in content.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            image_data = inline.data
                            if isinstance(image_data, str):
                                img_data = base64.b64decode(image_data)
                            else:
                                img_data = image_data
                            break

            if not img_data:
                raise ValueError("No image data found in Gemini response")

            filename = f"manga_page_{comic_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"
            storage = _get_storage()
            r2_url = storage.upload_image(
                image_data=img_data,
                filename=filename,
                content_type="image/png",
            )

            if not r2_url:
                raise ValueError("Failed to upload image to R2")

            comic_page = ComicPage(
                comic_id=comic_id,
                page_number=1,
                image_url=r2_url,
                panel_text=json.dumps(panels),
            )
            db.session.add(comic_page)

            comic.status = "completed"
            comic.completed_at = datetime.utcnow()
            db.session.commit()

            logger.info("=== Manga generation completed successfully ===")

            return {
                "status": "completed",
                "comic_id": comic_id,
                "image_url": r2_url,
                "pages": [comic_page.to_dict()],
            }

        except Exception as exc:
            logger.error("Error processing manga generation: %s", exc)
            logger.exception("Full traceback:")

            try:
                comic = db.session.get(Comic, comic_id)
                if comic:
                    comic.status = "failed"
                    comic.error_message = str(exc)
                    comic.completed_at = datetime.utcnow()
                    db.session.commit()
            except Exception as db_err:
                logger.error("Failed to update comic status: %s", db_err)

            return {"status": "failed", "comic_id": comic_id, "error": str(exc)}


def process_character_image_generation(
    character_id: int,
    api_key: str,
    description: str,
    reference_images: Iterable[Dict[str, str]],
) -> Dict[str, Any]:
    """Generate a character concept illustration using Gemini."""
    with _application_context():
        logger.info("=== Starting character image job character_id=%s ===", character_id)

        character = db.session.get(Character, character_id)
        if not character:
            logger.error("Character %s not found", character_id)
            raise ValueError(f"Character {character_id} not found")

        try:
            character.image_status = "processing"
            character.image_error = None
            db.session.commit()

            genai.configure(api_key=api_key)
            image_model = genai.GenerativeModel(Config.GEMINI_IMAGE_MODEL)

            prompt = (
                "Create a polished character concept illustration based on the description below. "
                "Incorporate notable traits and align with the provided reference imagery. "
                "Return a single high-resolution manga/anime style portrait.\n\n"
                f"Character description:\n{description}"
            )

            parts: list[Dict[str, Any]] = []
            for idx, ref in enumerate(reference_images):
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
                parts.append({"inline_data": {"mime_type": mime_type, "data": image_bytes}})

            response = image_model.generate_content(parts + [{"text": prompt}])

            img_data: Optional[bytes] = None
            if response.candidates:
                candidate = response.candidates[0]
                content = getattr(candidate, "content", None)
                if content and content.parts:
                    for part in content.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            image_data = inline.data
                            if isinstance(image_data, str):
                                img_data = base64.b64decode(image_data)
                            else:
                                img_data = image_data
                            break

            if not img_data:
                raise ValueError("Gemini image generation did not return image data")

            filename = f"character_{character_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"
            storage = _get_storage()
            r2_url = storage.upload_image(
                image_data=img_data,
                filename=filename,
                content_type="image/png",
            )

            if not r2_url:
                raise ValueError("Failed to upload character image to R2")

            character.image_url = r2_url
            character.image_status = "completed"
            character.image_error = None
            db.session.commit()

            logger.info("Character image generated successfully for %s", character_id)
            return {"status": "completed", "character_id": character_id, "image_url": r2_url}

        except Exception as exc:
            logger.exception("Character image generation failed for %s", character_id)
            character.image_status = "failed"
            character.image_error = str(exc)
            db.session.commit()
            raise
