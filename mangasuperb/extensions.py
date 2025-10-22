"""Application-wide extensions and shared resources."""
from __future__ import annotations

import logging
from typing import Tuple

from flask import Flask
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy
from redis import Redis
from rq import Queue

logger = logging.getLogger(__name__)


db = SQLAlchemy()
bcrypt = Bcrypt()
login_manager = LoginManager()


def init_extensions(app: Flask) -> Tuple[Redis, Queue]:
    """Initialise core Flask extensions for the application."""
    db.init_app(app)
    bcrypt.init_app(app)
    login_manager.init_app(app)

    login_manager.session_protection = "strong"
    login_manager.login_view = None
    login_manager.login_message = None

    CORS(app, origins=app.config.get("CORS_ORIGINS", "*"))

    redis_conn = Redis.from_url(app.config["REDIS_URL"])
    queue = Queue(
        app.config["RQ_QUEUE_NAME"],
        connection=redis_conn,
        default_timeout=app.config["RQ_JOB_TIMEOUT"],
    )

    app.extensions["redis_conn"] = redis_conn
    app.extensions["rq_queue"] = queue

    logger.debug("Extensions initialised: redis=%s queue=%s", redis_conn, queue)
    return redis_conn, queue
