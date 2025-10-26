"""Blueprint registration helpers."""
from __future__ import annotations

from flask import Flask

from .auth import bp as auth_bp
from .characters import bp as characters_bp
from .comics import bp as comics_bp
from .jobs import bp as jobs_bp
from .panels import bp as panels_bp
from .stories import bp as stories_bp
from .scripts import bp as scripts_bp
from .system import bp as system_bp


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(system_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(characters_bp)
    app.register_blueprint(scripts_bp)
    app.register_blueprint(comics_bp)
    app.register_blueprint(stories_bp)
    app.register_blueprint(panels_bp)
    app.register_blueprint(jobs_bp)
