"""
Configuration module for MangaSuperb
Loads settings from environment variables
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

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
    _raw_db_url = os.getenv('DATABASE_URL')
    if _raw_db_url and '${' not in _raw_db_url:
        SQLALCHEMY_DATABASE_URI = _raw_db_url
    else:
        SQLALCHEMY_DATABASE_URI = (
            f"postgresql://{os.getenv('POSTGRES_USER', 'manga')}:"
            f"{os.getenv('POSTGRES_PASSWORD', 'mangaSuperb@666')}@"
            f"{os.getenv('POSTGRES_HOST', 'localhost')}:"
            f"{os.getenv('POSTGRES_PORT', '5432')}/"
            f"{os.getenv('POSTGRES_DB', 'manga')}"
        )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
    }

    # Redis
    REDIS_URL = os.getenv(
        'REDIS_URL',
        f"redis://{os.getenv('REDIS_HOST', 'localhost')}:"
        f"{os.getenv('REDIS_PORT', '6379')}/"
        f"{os.getenv('REDIS_DB', '0')}"
    )

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

    # Cloudflare R2
    R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID', '')
    R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', '')
    R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', '')
    R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'manga')
    R2_ENDPOINT_URL = os.getenv(
        'R2_ENDPOINT_URL',
        f"https://{os.getenv('R2_ACCOUNT_ID', '')}.r2.cloudflarestorage.com"
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
