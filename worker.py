"""
RQ Worker for processing manga generation jobs
Run this worker to process background jobs from the Redis queue
"""
import os
import sys
import logging
from datetime import datetime
import base64
import json
import google.generativeai as genai
from redis import Redis
from rq import Worker, Queue, Connection
from config import Config
from models import db, Comic, ComicPage, Script, Character
from storage import R2Storage
from flask import Flask

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app for database context
app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)

# Initialize R2 storage
r2_storage = R2Storage(Config)

def process_manga_generation(comic_id: int, api_key: str, model_name: str):
    """
    Process a manga generation job

    Args:
        comic_id: Database ID of the comic to generate
        api_key: Gemini API key
        model_name: Gemini model to use

    Returns:
        dict: Job result with status and data
    """
    logger.info(f"=== Starting manga generation for comic_id={comic_id} ===")

    with app.app_context():
        try:
            # 1. Load comic and script from database
            comic = db.session.get(Comic, comic_id)
            if not comic:
                raise ValueError(f"Comic {comic_id} not found")

            script = db.session.get(Script, comic.script_id)
            if not script:
                raise ValueError(f"Script {comic.script_id} not found")

            logger.info(f"Comic: {comic.title}")
            logger.info(f"Script: {script.title}")

            # 2. Update status to processing
            comic.status = 'processing'
            comic.started_at = datetime.utcnow()
            db.session.commit()
            logger.info("Status updated to 'processing'")

            # 3. Configure Gemini API
            genai.configure(api_key=api_key)
            logger.info(f"Gemini API configured with model: {model_name}")

            # 4. Parse script content as JSON
            try:
                script_data = json.loads(script.content)
            except json.JSONDecodeError:
                raise ValueError("Script content is not valid JSON")

            panels = script_data.get('panels', [])
            if not panels:
                raise ValueError("Script has no panels")

            logger.info(f"Script has {len(panels)} panels")

            # 5. Generate manga page image
            image_model_name = Config.GEMINI_IMAGE_MODEL
            logger.info(f"Using image model: {image_model_name}")

            image_model = genai.GenerativeModel(image_model_name)

            # Build detailed prompt for complete manga page
            panels_description = []
            for panel in panels:
                panel_desc = f"Panel {panel['panel_number']}: Scene - {panel['scene']}. "
                if panel.get('dialogue'):
                    panel_desc += f"Dialogue - {panel['dialogue']}. "
                panel_desc += f"Visual details - {panel['visual_notes']}"
                panels_description.append(panel_desc)

            num_panels = len(panels)

            # Determine layout based on panel count
            if num_panels <= 3:
                layout_instruction = "Arrange the panels in a vertical single-column layout, reading top to bottom."
            elif num_panels == 4:
                layout_instruction = "Arrange the panels in a 2x2 grid layout, reading order: top-left, top-right, bottom-left, bottom-right."
            elif num_panels == 5:
                layout_instruction = "Arrange the panels in a mixed layout: 2 panels on top row, 3 panels on bottom row, reading left to right, top to bottom."
            else:  # 6 or more
                layout_instruction = "Arrange the panels in a 2x3 grid layout (2 columns, 3 rows), reading order: top to bottom, left to right in manga style."

            image_prompt = f"""Generate a complete manga page with {num_panels} panels arranged as follows:

{layout_instruction}

Title: {script_data.get('title', comic.title)}
Overall Style: {script_data.get('style_notes') or comic.style_description}
Preferred Aspect Ratio: {comic.aspect_ratio}

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

            logger.info(f"Generating manga page image...")
            logger.info(f"Prompt length: {len(image_prompt)} characters")

            result = image_model.generate_content(image_prompt)
            logger.info(f"Image generation API call completed")

            # 6. Extract image data from response
            img_data = None
            if result.candidates and len(result.candidates) > 0:
                candidate = result.candidates[0]
                logger.info(f"Candidate finish_reason: {candidate.finish_reason}")

                if candidate.content and candidate.content.parts:
                    logger.info(f"Found {len(candidate.content.parts)} part(s)")

                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            logger.info(f"Found inline_data with mime_type: {part.inline_data.mime_type}")

                            # Get image data
                            image_data = part.inline_data.data

                            # Convert to bytes if needed
                            if isinstance(image_data, str):
                                img_data = base64.b64decode(image_data)
                            else:
                                img_data = image_data

                            logger.info(f"Extracted image data: {len(img_data)} bytes")
                            break

            if not img_data:
                raise ValueError("No image data found in Gemini response")

            # 7. Upload to Cloudflare R2
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f"manga_page_{comic_id}_{timestamp}.png"

            logger.info(f"Uploading to R2: {filename}")
            r2_url = r2_storage.upload_image(
                image_data=img_data,
                filename=filename,
                content_type='image/png'
            )

            if not r2_url:
                raise ValueError("Failed to upload image to R2")

            logger.info(f"Image uploaded successfully: {r2_url}")

            # 8. Save page to database
            comic_page = ComicPage(
                comic_id=comic_id,
                page_number=1,  # Single page for now
                image_url=r2_url,
                panel_text=json.dumps(panels)
            )
            db.session.add(comic_page)

            # 9. Update comic status to completed
            comic.status = 'completed'
            comic.completed_at = datetime.utcnow()
            db.session.commit()

            logger.info(f"=== Manga generation completed successfully ===")

            return {
                'status': 'completed',
                'comic_id': comic_id,
                'image_url': r2_url,
                'pages': [comic_page.to_dict()]
            }
        except Exception as e:
            logger.error(f"Error processing manga generation: {str(e)}")
            logger.exception("Full traceback:")

            # Update comic status to failed
            try:
                comic = db.session.get(Comic, comic_id)
                if comic:
                    comic.status = 'failed'
                    comic.error_message = str(e)
                    comic.completed_at = datetime.utcnow()
                    db.session.commit()
            except Exception as db_err:
                logger.error(f"Failed to update comic status: {str(db_err)}")

            return {
                'status': 'failed',
                'comic_id': comic_id,
                'error': str(e)
            }


def process_character_image_generation(
    character_id: int,
    api_key: str,
    description: str,
    reference_images: list,
):
    """Generate a character image using reference images and description."""
    logger.info("=== Starting character image job character_id=%s ===", character_id)

    with app.app_context():
        character = db.session.get(Character, character_id)
        if not character:
            logger.error("Character %s not found", character_id)
            raise ValueError(f"Character {character_id} not found")

        try:
            character.image_status = 'processing'
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

            parts = []
            for idx, ref in enumerate(reference_images):
                data = ref.get('data')
                mime_type = ref.get('mime_type', 'image/png')
                if not data:
                    logger.warning("Reference image %s missing data", idx)
                    continue
                try:
                    image_bytes = base64.b64decode(data)
                except Exception:
                    logger.warning("Failed to decode reference image %s", idx)
                    continue
                parts.append({
                    'inline_data': {
                        'mime_type': mime_type,
                        'data': image_bytes
                    }
                })

            response = image_model.generate_content(parts + [{'text': prompt}])

            # Extract image bytes from response
            img_data = None
            if response.candidates:
                candidate = response.candidates[0]
                content = getattr(candidate, 'content', None)
                if content and content.parts:
                    for part in content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            inline = part.inline_data
                            image_data = inline.data
                            if isinstance(image_data, str):
                                img_data = base64.b64decode(image_data)
                            else:
                                img_data = image_data
                            break

            if not img_data:
                raise ValueError("Gemini image generation did not return image data")

            filename = f"character_{character_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"
            r2_url = r2_storage.upload_image(
                image_data=img_data,
                filename=filename,
                content_type='image/png'
            )

            if not r2_url:
                raise ValueError("Failed to upload character image to R2")

            character.image_url = r2_url
            character.image_status = 'completed'
            character.image_error = None
            db.session.commit()

            logger.info("Character image generated successfully for %s", character_id)
            return {
                'status': 'completed',
                'character_id': character_id,
                'image_url': r2_url
            }

        except Exception as exc:
            logger.exception("Character image generation failed for %s", character_id)
            character.image_status = 'failed'
            character.image_error = str(exc)
            db.session.commit()
            raise


def run_worker():
    """Run the RQ worker"""
    redis_url = Config.REDIS_URL
    logger.info(f"Connecting to Redis: {redis_url}")

    with Connection(Redis.from_url(redis_url)):
        queue = Queue(Config.RQ_QUEUE_NAME)
        logger.info(f"Listening on queue: {Config.RQ_QUEUE_NAME}")

        worker = Worker([queue], name=f'manga-worker-{os.getpid()}')

        logger.info("=" * 60)
        logger.info("MangaSuperb RQ Worker Started")
        logger.info("=" * 60)
        logger.info(f"Worker: {worker.name}")
        logger.info(f"Queue: {Config.RQ_QUEUE_NAME}")
        logger.info(f"Job timeout: {Config.RQ_JOB_TIMEOUT}s")
        logger.info("=" * 60)

        worker.work(with_scheduler=True)

if __name__ == '__main__':
    run_worker()
