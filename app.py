"""WSGI entry point for the MangaSuperb application."""
from __future__ import annotations

import os

from mangasuperb import create_app

app = create_app()


if __name__ == "__main__":
    os.makedirs("static", exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    app.run(
        debug=app.config.get("DEBUG", False),
        host=app.config.get("HOST", "0.0.0.0"),
        port=app.config.get("PORT", 5000),
    )
