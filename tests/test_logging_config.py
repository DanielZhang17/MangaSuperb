"""Tests for application logging setup."""
from __future__ import annotations

import logging

from flask import Flask

from mangasuperb import _configure_logging


def test_configure_logging_writes_to_configured_log_file(tmp_path) -> None:
    app = Flask(__name__)
    log_file = tmp_path / "external-logs" / "mangasuperb.log"
    app.config.update(LOG_LEVEL="INFO", LOG_FILE=str(log_file))

    _configure_logging(app)

    logging.getLogger("mangasuperb.docker_test").info("docker log mount check")
    for handler in logging.getLogger().handlers:
        handler.flush()

    assert log_file.read_text(encoding="utf-8").find("docker log mount check") != -1
