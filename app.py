from flask import Flask, request, jsonify, send_from_directory
from flask_bcrypt import Bcrypt
from flask_login import (
    LoginManager,
    login_user,
    logout_user,
    login_required,
    current_user
)
from flasgger import swag_from
import google.generativeai as genai
import os
import json
import base64
import logging
from datetime import datetime
from redis import Redis
from rq import Queue
from rq.job import Job
from sqlalchemy.exc import IntegrityError
from typing import Any, Dict, List, Optional

from config import Config
from models import db, User, Script, Comic, ComicPage, Character
from storage import R2Storage
from swagger import (
    register_swagger,
    AUTH_REGISTER_DOC,
    AUTH_LOGIN_DOC,
    AUTH_LOGOUT_DOC,
    AUTH_ME_DOC,
    CHARACTER_CREATE_DOC,
    CHARACTER_DETAIL_DOC,
    SCRIPT_CREATE_DOC,
    SCRIPT_LIST_DOC,
    SCRIPT_DETAIL_DOC,
    COMIC_CREATE_DOC,
    COMIC_LIST_DOC,
    COMIC_DETAIL_DOC,
    JOB_CREATE_DOC,
    JOB_STATUS_DOC,
)

# Configure logging
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, static_folder='static')
app.config.from_object(Config)

# Attach Swagger documentation
swagger = register_swagger(app)

# Initialize auth utilities
bcrypt = Bcrypt(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.session_protection = 'strong'
login_manager.login_view = None
login_manager.login_message = None

# User loader for Flask-Login
@login_manager.user_loader
def load_user(user_id):
    """Load user for session-based authentication"""
    try:
        return db.session.get(User, int(user_id))
    except (TypeError, ValueError):
        return None

@login_manager.unauthorized_handler
def unauthorized():
    """Consistent JSON response for unauthorized access"""
    return jsonify({'error': 'Authentication required'}), 401

# Initialize database
db.init_app(app)

# Initialize Redis and RQ
redis_conn = Redis.from_url(Config.REDIS_URL)
queue = Queue(Config.RQ_QUEUE_NAME, connection=redis_conn, default_timeout=Config.RQ_JOB_TIMEOUT)

# Initialize R2 storage
r2_storage = R2Storage(Config)

# Configure CORS
from flask_cors import CORS
CORS(app, origins=Config.CORS_ORIGINS)

@app.route('/')
def index():
    """Serve the main application"""
    return send_from_directory('static', 'index.html')

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'database': check_database(),
            'redis': check_redis(),
            'r2': check_r2()
        }
    })

def check_database():
    """Check database connectivity"""
    try:
        db.session.execute(db.text("SELECT 1"))
        return 'connected'
    except Exception as e:
        logger.error(f"Database check failed: {str(e)}")
        return 'disconnected'

def check_redis():
    """Check Redis connectivity"""
    try:
        redis_conn.ping()
        return 'connected'
    except Exception as e:
        logger.error(f"Redis check failed: {str(e)}")
        return 'disconnected'

def check_r2():
    """Check R2 storage connectivity"""
    try:
        if r2_storage.check_bucket_exists():
            return 'connected'
        return 'bucket_not_found'
    except Exception as e:
        logger.error(f"R2 check failed: {str(e)}")
        return 'disconnected'

# ========================================
# SCRIPT GENERATION HELPERS
# ========================================

ALLOWED_ASPECT_RATIOS = {'16:9', '9:16', '1:1'}
DEFAULT_COMIC_STYLE = 'Classic manga black and white linework'
DEFAULT_ASPECT_RATIO = '16:9'

SCRIPT_PROMPT_TEMPLATE = """You are a professional manga scriptwriter. Based on the following idea, create a detailed manga script with:
1. A brief story summary
2. 4-6 panel descriptions with dialogue and scene details
3. Character descriptions
4. Visual style notes that can prompt the image generation model to create fitting manga-style images.

User idea: {idea}

Format your response as JSON with this structure:
{{
    "title": "Manga Title",
    "summary": "Brief story summary",
    "panels": [
        {{
            "panel_number": 1,
            "scene": "Scene description",
            "dialogue": "Character dialogue",
            "visual_notes": "Visual style and composition notes"
        }}
    ],
    "characters": ["Character 1 description", "Character 2 description"],
    "style_notes": "Overall visual style"
}}"""


def _strip_code_fences(payload: str) -> str:
    """Remove markdown code fences from model output."""
    if not payload:
        return payload

    markers = [('```json', '```'), ('```', '```')]
    for start, end in markers:
        if start in payload:
            section = payload.split(start, 1)[1]
            if end in section:
                return section.split(end, 1)[0].strip()
    return payload.strip()


def _extract_text_from_response(response: Any) -> str:
    """Extract text content from Gemini response object."""
    text = getattr(response, 'text', '') or ''
    if text:
        return text

    candidates = getattr(response, 'candidates', None) or []
    for candidate in candidates:
        parts = getattr(getattr(candidate, 'content', None), 'parts', []) or []
        for part in parts:
            part_text = getattr(part, 'text', None)
            if part_text:
                text += part_text
    return text


def build_script_prompt(idea: str) -> str:
    """Render the structured prompt for Gemini script generation."""
    return SCRIPT_PROMPT_TEMPLATE.format(idea=idea)


def generate_script_from_prompt(prompt: str, model_name: str, api_key: str) -> Dict[str, Any]:
    """Call Gemini and return structured manga script data."""
    if not prompt:
        raise ValueError('Prompt is required')

    logger.info("Generating manga script with model: %s", model_name)
    genai.configure(api_key=api_key)
    script_model = genai.GenerativeModel(model_name)
    response = script_model.generate_content(build_script_prompt(prompt))

    raw_text = _extract_text_from_response(response)
    cleaned = _strip_code_fences(raw_text)

    try:
        script_data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.exception("Failed to parse script JSON")
        raise ValueError('Model response is not valid JSON') from exc

    panels = script_data.get('panels')
    if not isinstance(panels, list) or not panels:
        raise ValueError('Generated script does not include panels')

    return script_data


CHARACTER_OPTIMIZE_PROMPT = """You are a creative editor who polishes comic and manga character bios.
Rewrite the following description to be vivid and concise (max 120 words), suitable for guiding an illustrator.
Keep core facts, enhance clarity, and focus on visual traits and personality.

Original description:
{description}

Return only the refined description."""


def optimize_character_description(description: str, api_key: str, model_name: str = Config.GEMINI_SCRIPT_MODEL) -> str:
    """Use Gemini to refine a character description."""
    if not description:
        raise ValueError('Description is required')

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(CHARACTER_OPTIMIZE_PROMPT.format(description=description))
    optimized = _extract_text_from_response(response).strip()
    if not optimized:
        raise ValueError('Optimization returned empty text')
    return optimized


def _normalize_reference_images(images: List[Any]) -> List[Dict[str, str]]:
    """Validate and normalize reference image payloads."""
    normalized: List[Dict[str, str]] = []
    if not images:
        return normalized

    for idx, item in enumerate(images):
        if item is None:
            continue

        data: Optional[str] = None
        mime_type = 'image/png'

        if isinstance(item, dict):
            data = item.get('data') or item.get('base64')
            mime_type = item.get('mime_type') or mime_type
        elif isinstance(item, str):
            if item.startswith('data:'):
                header, _, b64_data = item.partition(',')
                if not b64_data:
                    raise ValueError(f'Reference image at index {idx} is not valid base64 data')
                mime_type = header.split(';')[0].split(':')[-1] or mime_type
                data = b64_data
            else:
                data = item
        else:
            raise ValueError('Reference images must be base64 strings or objects with data fields')

        if not data:
            raise ValueError(f'Reference image at index {idx} is missing data')

        try:
            base64.b64decode(data, validate=True)
        except Exception as exc:
            raise ValueError(f'Reference image at index {idx} is not valid base64 data') from exc

        normalized.append({'mime_type': mime_type, 'data': data})

    return normalized


def _validate_aspect_ratio(value: Optional[str]) -> str:
    """Ensure aspect ratio is one of the allowed values."""
    ratio = (value or DEFAULT_ASPECT_RATIO).strip()
    if ratio not in ALLOWED_ASPECT_RATIOS:
        raise ValueError(f'Aspect ratio must be one of {sorted(ALLOWED_ASPECT_RATIOS)}')
    return ratio

# ========================================
# AUTHENTICATION ENDPOINTS
# ========================================

def _parse_auth_payload():
    """Safely parse incoming JSON payloads for auth routes"""
    if not request.is_json:
        return {}
    return request.get_json(silent=True) or {}

def _validate_credentials(username: str, password: str):
    """Validate credential format; return error message or None"""
    if not username or not password:
        return 'Username and password are required'
    if len(username) < 3 or len(username) > 80:
        return 'Username must be between 3 and 80 characters'
    if len(password) < 8:
        return 'Password must be at least 8 characters long'
    return None

@app.route('/api/auth/register', methods=['POST'])
@swag_from(AUTH_REGISTER_DOC)
def register():
    """Create a new user account and start a session"""
    payload = _parse_auth_payload()
    username = (payload.get('username') or '').strip()
    password = payload.get('password') or ''

    error = _validate_credentials(username, password)
    if error:
        return jsonify({'error': error}), 400

    password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(username=username, password_hash=password_hash)

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        logger.info("Registration attempted with existing username: %s", username)
        return jsonify({'error': 'Username already exists'}), 409
    except Exception as exc:
        db.session.rollback()
        logger.exception("Registration failed for username %s: %s", username, exc)
        return jsonify({'error': 'Registration failed'}), 500

    login_user(user)
    logger.info("User registered and logged in: %s", username)
    return jsonify({'user': user.to_dict()}), 201

@app.route('/api/auth/login', methods=['POST'])
@swag_from(AUTH_LOGIN_DOC)
def login():
    """Authenticate an existing user"""
    payload = _parse_auth_payload()
    username = (payload.get('username') or '').strip()
    password = payload.get('password') or ''

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        logger.info("Failed login attempt for username: %s", username)
        return jsonify({'error': 'Invalid credentials'}), 401

    login_user(user)
    logger.info("User logged in: %s", username)
    return jsonify({'user': user.to_dict()}), 200

@app.route('/api/auth/logout', methods=['POST'])
@swag_from(AUTH_LOGOUT_DOC)
@login_required
def logout():
    """Terminate the current user session"""
    username = current_user.username
    logout_user()
    logger.info("User logged out: %s", username)
    return jsonify({'message': 'Logged out'}), 200

@app.route('/api/auth/me', methods=['GET'])
@swag_from(AUTH_ME_DOC)
def current_user_profile():
    """Return details about the authenticated user"""
    if current_user.is_authenticated:
        return jsonify({'user': current_user.to_dict()}), 200
    return jsonify({'user': None}), 200


@app.route('/api/characters', methods=['POST'])
@login_required
@swag_from(CHARACTER_CREATE_DOC)
def create_character():
    """Create a character and optionally enqueue image generation."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip()
    optimize_flag = bool(data.get('optimize', False))
    style_prompt = (data.get('style_prompt') or '').strip() or None
    reference_images = data.get('reference_images') or []
    api_key = (data.get('api_key') or '').strip()

    if not name:
        return jsonify({'error': 'Name is required'}), 400

    if not description:
        return jsonify({'error': 'Description is required'}), 400

    requires_api = optimize_flag or bool(reference_images)
    if requires_api and not api_key:
        return jsonify({'error': 'API key is required for optimization or image generation'}), 400

    optimized_description = None
    prompt_for_image = description

    if optimize_flag:
        try:
            optimized_description = optimize_character_description(description, api_key)
            prompt_for_image = optimized_description
        except ValueError as ve:
            logger.error("Character optimization failed: %s", ve)
            return jsonify({'error': str(ve)}), 400
        except Exception as exc:
            logger.exception("Character optimization error")
            return jsonify({'error': 'Failed to optimize character description'}), 502

    # Determine style prompt fallback
    resolved_style_prompt = style_prompt or optimized_description or description

    normalized_refs: List[Dict[str, str]] = []
    if reference_images:
        try:
            normalized_refs = _normalize_reference_images(reference_images)
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400

    character = Character(
        user_id=current_user.id,
        name=name,
        description=description,
        style_prompt=resolved_style_prompt,
        optimized_description=optimized_description,
        image_status='idle'
    )

    job_id = None
    try:
        db.session.add(character)
        db.session.flush()

        if normalized_refs:
            from worker import process_character_image_generation

            job = queue.enqueue(
                process_character_image_generation,
                character_id=character.id,
                api_key=api_key,
                description=prompt_for_image,
                reference_images=normalized_refs,
                job_timeout=Config.RQ_JOB_TIMEOUT,
                result_ttl=Config.RQ_RESULT_TTL
            )

            character.image_status = 'pending'
            character.image_job_id = job.id
            character.image_error = None
            job_id = job.id

        db.session.commit()

    except Exception as exc:
        db.session.rollback()
        logger.exception("Failed to create character")
        return jsonify({'error': 'Failed to create character'}), 500

    response = {
        'character': character.to_dict(),
    }
    if job_id:
        response['job_id'] = job_id

    return jsonify(response), 201


@app.route('/api/characters/<int:character_id>', methods=['GET'])
@login_required
@swag_from(CHARACTER_DETAIL_DOC)
def get_character(character_id):
    """Retrieve a character owned by the current user."""
    character = db.session.get(Character, character_id)
    if not character or character.user_id != current_user.id:
        return jsonify({'error': 'Character not found'}), 404
    return jsonify({'character': character.to_dict()}), 200


@app.route('/api/scripts', methods=['POST'])
@login_required
@swag_from(SCRIPT_CREATE_DOC)
def create_script_endpoint():
    """Create a script for the authenticated user."""
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()

    if not title:
        return jsonify({'error': 'Title is required'}), 400

    if not content:
        return jsonify({'error': 'Content is required'}), 400

    script = Script(
        user_id=current_user.id,
        title=title,
        content=content
    )
    try:
        db.session.add(script)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to create script")
        return jsonify({'error': 'Failed to create script'}), 500

    return jsonify({'script': script.to_dict()}), 201


@app.route('/api/scripts', methods=['GET'])
@login_required
@swag_from(SCRIPT_LIST_DOC)
def list_scripts_endpoint():
    """List scripts for the authenticated user."""
    limit = max(1, min(100, request.args.get('limit', default=50, type=int)))
    scripts = (
        Script.query
        .filter_by(user_id=current_user.id)
        .order_by(Script.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({'scripts': [script.to_dict() for script in scripts], 'count': len(scripts)})


@app.route('/api/scripts/<int:script_id>', methods=['GET'])
@login_required
@swag_from(SCRIPT_DETAIL_DOC)
def get_script_endpoint(script_id):
    """Fetch a specific script owned by the current user."""
    script = db.session.get(Script, script_id)
    if not script or script.user_id != current_user.id:
        return jsonify({'error': 'Script not found'}), 404
    return jsonify({'script': script.to_dict()}), 200


@app.route('/api/comics', methods=['POST'])
@login_required
@swag_from(COMIC_CREATE_DOC)
def create_comic_endpoint():
    """Create a comic and associated script for the authenticated user."""
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    story = (data.get('story') or data.get('script_content') or '').strip()
    style_description = (data.get('style') or data.get('style_description') or '').strip()
    aspect_ratio_raw = data.get('aspect_ratio')

    if not title:
        return jsonify({'error': 'Title is required'}), 400

    if not story:
        return jsonify({'error': 'Story content is required'}), 400

    if not style_description:
        return jsonify({'error': 'Style description is required'}), 400

    try:
        resolved_aspect_ratio = _validate_aspect_ratio(aspect_ratio_raw)
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    script_payload = {
        'story': story,
        'style_description': style_description,
        'aspect_ratio': resolved_aspect_ratio
    }

    script = Script(
        user_id=current_user.id,
        title=title,
        content=json.dumps(script_payload)
    )

    comic = Comic(
        user_id=current_user.id,
        script=script,
        title=title,
        status='pending',
        style_description=style_description,
        aspect_ratio=resolved_aspect_ratio
    )

    try:
        db.session.add_all([script, comic])
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to create comic")
        return jsonify({'error': 'Failed to create comic'}), 500

    return jsonify({'comic': comic.to_dict(), 'script': script.to_dict()}), 201

# ========================================
# NEW ASYNC API ENDPOINTS
# ========================================

@app.route('/api/jobs', methods=['POST'])
@login_required
@swag_from(JOB_CREATE_DOC)
def create_job():
    """
    Create a new manga generation job (async)

    Request body:
        {
            "prompt": "story idea",
            "model": "gemini-2.5-pro",
            "api_key": "your_api_key",
            "user_id": 1  (optional)
        }

    Response:
        {
            "job_id": "uuid",
            "comic_id": 123,
            "status": "pending"
        }
    """
    try:
        data = request.get_json(silent=True) or {}
        prompt = data.get('prompt', '').strip()
        model_name = data.get('model', Config.GEMINI_SCRIPT_MODEL)
        api_key = data.get('api_key', '').strip()
        requested_style = (data.get('style') or data.get('style_description') or '').strip()
        aspect_ratio = data.get('aspect_ratio')

        logger.info(f"=== New job request ===")
        logger.info(f"User: %s", current_user.username)
        logger.info(f"Prompt length: {len(prompt)} characters")
        logger.info(f"Model: {model_name}")

        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        if not api_key:
            return jsonify({'error': 'API key is required'}), 400

        # 1. Generate script synchronously (fast operation)
        manga_script = generate_script_from_prompt(prompt, model_name, api_key)
        logger.info("Script generated: %s", manga_script.get('title', 'Untitled'))

        # 2. Persist script and comic for the current user
        script_title = manga_script.get('title') or 'Untitled'
        style_notes = requested_style or manga_script.get('style_notes') or DEFAULT_COMIC_STYLE

        try:
            resolved_aspect_ratio = _validate_aspect_ratio(aspect_ratio)
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400

        try:
            script = Script(
                user_id=current_user.id,
                title=script_title,
                content=json.dumps(manga_script)
            )
            comic = Comic(
                user_id=current_user.id,
                script=script,
                title=script_title,
                status='pending',
                style_description=style_notes,
                aspect_ratio=resolved_aspect_ratio
            )
            db.session.add_all([script, comic])
            db.session.flush()  # Assign IDs before enqueueing

            # 3. Enqueue background job for image generation
            from worker import process_manga_generation

            job = queue.enqueue(
                process_manga_generation,
                comic_id=comic.id,
                api_key=api_key,
                model_name=model_name,
                job_timeout=Config.RQ_JOB_TIMEOUT,
                result_ttl=Config.RQ_RESULT_TTL
            )

            comic.job_id = job.id
            db.session.commit()

        except Exception as exc:
            db.session.rollback()
            logger.exception("Failed to persist job resources")
            raise

        logger.info("Job enqueued: %s", job.id)
        logger.info("=== Job created successfully ===")

        return jsonify({
            'job_id': job.id,
            'comic_id': comic.id,
            'script_id': script.id,
            'status': 'pending',
            'script': manga_script
        }), 201

    except ValueError as ve:
        logger.error("Script generation failed: %s", ve)
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logger.error(f"Error creating job: {str(e)}")
        logger.exception("Full traceback:")
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<job_id>', methods=['GET'])
@swag_from(JOB_STATUS_DOC)
def get_job_status(job_id):
    """
    Get status of a specific job

    Response:
        {
            "job_id": "uuid",
            "status": "pending" | "processing" | "completed" | "failed",
            "comic": {...},
            "created_at": "...",
            "started_at": "...",
            "completed_at": "..."
        }
    """
    try:
        # Get job from RQ
        try:
            job = Job.fetch(job_id, connection=redis_conn)
            rq_status = job.get_status()
        except Exception as e:
            logger.error(f"Failed to fetch RQ job: {str(e)}")
            rq_status = 'unknown'

        # Get comic from database
        comic = Comic.query.filter_by(job_id=job_id).first()
        if comic:
            response = {
                'job_id': job_id,
                'rq_status': rq_status,
                'comic': comic.to_dict()
            }
            return jsonify(response)

        character = Character.query.filter_by(image_job_id=job_id).first()
        if character:
            response = {
                'job_id': job_id,
                'rq_status': rq_status,
                'character': character.to_dict()
            }
            return jsonify(response)

        return jsonify({'error': 'Job not found'}), 404

    except Exception as e:
        logger.error(f"Error getting job status: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/comics/<int:comic_id>', methods=['GET'])
@login_required
@swag_from(COMIC_DETAIL_DOC)
def get_comic(comic_id):
    """Get a specific comic with all its pages"""
    try:
        comic = db.session.get(Comic, comic_id)

        if not comic or comic.user_id != current_user.id:
            return jsonify({'error': 'Comic not found'}), 404

        return jsonify(comic.to_dict())

    except Exception as e:
        logger.error(f"Error getting comic: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/comics', methods=['GET'])
@login_required
@swag_from(COMIC_LIST_DOC)
def list_comics():
    """List all comics (with optional user filtering)"""
    try:
        user_id = request.args.get('user_id', type=int)

        query = Comic.query.filter_by(user_id=current_user.id)
        if user_id and user_id != current_user.id:
            return jsonify({'error': 'Forbidden'}), 403

        comics = query.order_by(Comic.created_at.desc()).limit(50).all()

        return jsonify({
            'comics': [comic.to_dict() for comic in comics],
            'count': len(comics)
        })

    except Exception as e:
        logger.error(f"Error listing comics: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ========================================
# LEGACY ENDPOINTS (for backwards compatibility)
# ========================================

@app.route('/api/generate-script', methods=['POST'])
def generate_script():
    """
    Legacy endpoint: Generate manga script only (synchronous)
    """
    try:
        data = request.get_json(silent=True) or {}
        prompt = data.get('prompt', '').strip()
        model_name = data.get('model', Config.GEMINI_SCRIPT_MODEL)
        api_key = data.get('api_key', '').strip()

        logger.info("=== Script Generation Request ===")
        logger.info("Model: %s", model_name)
        logger.info("Prompt length: %d characters", len(prompt))

        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        if not api_key:
            return jsonify({'error': 'API key is required'}), 400

        manga_script = generate_script_from_prompt(prompt, model_name, api_key)
        logger.info("Script generated successfully")

        return jsonify({'success': True, 'script': manga_script})

    except ValueError as ve:
        logger.error("Script generation failed: %s", ve)
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        logger.exception("Full traceback:")
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """
    Legacy endpoint: Generate image synchronously (not recommended for production)
    """
    logger.warning("Using legacy synchronous image generation endpoint")
    # Implementation similar to before, but use R2 storage
    # Omitted for brevity - recommend using async endpoint instead
    return jsonify({'error': 'Use /api/jobs endpoint for async processing'}), 400

@app.route('/api/test-api-key', methods=['POST'])
def test_api_key():
    """Test if the provided API key is valid"""
    try:
        data = request.json
        api_key = data.get('api_key', '')
        model_name = data.get('model', Config.GEMINI_SCRIPT_MODEL)

        if not api_key:
            return jsonify({'valid': False, 'error': 'API key is required'}), 400

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        model.generate_content("Hello")

        return jsonify({'valid': True, 'message': 'API key is valid'})

    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 400

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs('static', exist_ok=True)
    os.makedirs('logs', exist_ok=True)

    # Run app
    app.run(
        debug=Config.DEBUG,
        host=Config.HOST if hasattr(Config, 'HOST') else '0.0.0.0',
        port=Config.PORT if hasattr(Config, 'PORT') else 5000
    )
