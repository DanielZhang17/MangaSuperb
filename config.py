"""
Configuration module for MangaSuperb
Loads settings from environment variables
"""
import os
from urllib.parse import quote_plus

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def _env(name: str, default: str = '') -> str:
    return os.getenv(name, default) or ''


def _valid_explicit_url(value: str) -> bool:
    return bool(value and '${' not in value)


def _any_env_set(names: tuple[str, ...]) -> bool:
    return any(os.getenv(name) not in (None, '') for name in names)


def _is_truthy(name: str) -> bool:
    return _env(name).strip().lower() in {'1', 'true', 'yes', 'on'}


def _build_database_uri() -> str:
    user = quote_plus(_env('POSTGRES_USER', 'manga'))
    password = quote_plus(_env('POSTGRES_PASSWORD', 'mangaSuperb@666'))
    default_host = 'postgres' if _is_truthy('MANGASUPERB_DOCKER') else 'localhost'
    host = _env('POSTGRES_HOST', default_host)
    port = _env('POSTGRES_PORT', '5432')
    database = _env('POSTGRES_DB', 'manga')
    auth = f'{user}:{password}' if password else user
    return f'postgresql://{auth}@{host}:{port}/{database}'


def resolve_database_uri() -> str:
    """Resolve the database URI from env with POSTGRES_* as the default source."""

    raw_url = _env('DATABASE_URL').strip()
    mode = _env('DATABASE_URL_MODE', 'auto').strip().lower()

    if mode in {'url', 'database_url', 'explicit'} and _valid_explicit_url(raw_url):
        return raw_url
    if mode in {'components', 'postgres', 'postgresql'}:
        return _build_database_uri()
    if _valid_explicit_url(raw_url) and not _any_env_set(
        (
            'POSTGRES_USER',
            'POSTGRES_PASSWORD',
            'POSTGRES_HOST',
            'POSTGRES_PORT',
            'POSTGRES_DB',
        )
    ):
        return raw_url

    return _build_database_uri()


def _build_redis_url() -> str:
    password = quote_plus(_env('REDIS_PASSWORD'))
    default_host = 'redis' if _is_truthy('MANGASUPERB_DOCKER') else 'localhost'
    host = _env('REDIS_HOST', default_host)
    port = _env('REDIS_PORT', '6379')
    database = _env('REDIS_DB', '0')
    auth = f':{password}@' if password else ''
    return f'redis://{auth}{host}:{port}/{database}'


def resolve_redis_url() -> str:
    """Resolve Redis URL from env with REDIS_* as the default source."""

    raw_url = _env('REDIS_URL').strip()
    mode = _env('REDIS_URL_MODE', 'auto').strip().lower()

    if mode in {'url', 'redis_url', 'explicit'} and _valid_explicit_url(raw_url):
        return raw_url
    if mode in {'components', 'redis'}:
        return _build_redis_url()
    if _valid_explicit_url(raw_url) and not _any_env_set(
        ('REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD')
    ):
        return raw_url

    return _build_redis_url()


class Config:
    """Application configuration"""

    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    DEBUG = os.getenv('FLASK_DEBUG', 'True') == 'True'
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', '5000'))
    # Max request size: 30MB to accommodate 20MB images encoded as base64 (~27MB) plus JSON overhead
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', str(30 * 1024 * 1024)))
    SESSION_PROTECTION = os.getenv('SESSION_PROTECTION', 'basic') or None

    # Database
    SQLALCHEMY_DATABASE_URI = resolve_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
    }

    # Redis
    REDIS_URL = resolve_redis_url()

    # RQ (Redis Queue)
    RQ_QUEUE_NAME = os.getenv('RQ_QUEUE_NAME', 'manga_generation')
    RQ_JOB_TIMEOUT = int(os.getenv('RQ_JOB_TIMEOUT', '600'))
    RQ_RESULT_TTL = int(os.getenv('RQ_RESULT_TTL', '3600'))

    # Gemini API
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    GEMINI_SCRIPT_MODEL = os.getenv('GEMINI_SCRIPT_MODEL', 'gemini-2.5-pro')
    GEMINI_IMAGE_MODEL = os.getenv('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image')

    # AI provider selection ("gemini" or "third_party")
    IMAGE_PROVIDER = os.getenv('IMAGE_PROVIDER', 'gemini')
    TEXT_PROVIDER = os.getenv('TEXT_PROVIDER', 'gemini')
    GENERATION_PROMPT_OPTIMIZATION_ENABLED = (
        os.getenv("GENERATION_PROMPT_OPTIMIZATION_ENABLED", "false").strip().lower()
        == "true"
    )
    GENERATION_PROMPT_OPTIMIZATION_SCOPES = os.getenv(
        "GENERATION_PROMPT_OPTIMIZATION_SCOPES",
        "shot_split,page_render",
    )

    # Third-party OpenAI-compatible API
    THIRD_PARTY_API_URL = os.getenv('THIRD_PARTY_API_URL', '')
    THIRD_PARTY_API_KEY = os.getenv('THIRD_PARTY_API_KEY', '')
    THIRD_PARTY_IMAGE_MODEL = os.getenv('THIRD_PARTY_IMAGE_MODEL', '')
    THIRD_PARTY_TEXT_MODEL = os.getenv('THIRD_PARTY_TEXT_MODEL', '')
    THIRD_PARTY_IMAGE_TIMEOUT_SECONDS = int(
        os.getenv('THIRD_PARTY_IMAGE_TIMEOUT_SECONDS', '300')
    )

    # Cloudflare R2
    R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID', '')
    R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', '')
    R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', '')
    R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'manga')
    _r2_endpoint_url = os.getenv('R2_ENDPOINT_URL', '')
    R2_ENDPOINT_URL = (
        _r2_endpoint_url
        or (f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else '')
    )
    R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL', '')

    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'logs/mangasuperb.log')

    # Proxy awareness
    PROXY_FIX_ENABLED = os.getenv('PROXY_FIX_ENABLED', 'True') == 'True'
    PROXY_FIX_FOR = int(os.getenv('PROXY_FIX_FOR', '2'))
    PROXY_FIX_PROTO = int(os.getenv('PROXY_FIX_PROTO', '1'))
    PROXY_FIX_HOST = int(os.getenv('PROXY_FIX_HOST', '1'))
    PROXY_FIX_PORT = int(os.getenv('PROXY_FIX_PORT', '1'))
    PROXY_FIX_PREFIX = int(os.getenv('PROXY_FIX_PREFIX', '0'))

    # Rate limiting
    RATE_LIMIT_ENABLED = os.getenv('RATE_LIMIT_ENABLED', 'True') == 'True'
    RATE_LIMIT_PER_MINUTE = int(os.getenv('RATE_LIMIT_PER_MINUTE', '10'))
