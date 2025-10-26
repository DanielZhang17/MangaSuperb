"""Routes for managing story scripts."""
from __future__ import annotations

import logging
from typing import Any

from flasgger import swag_from
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from mangasuperb.extensions import db
from models import Script
from swagger import SCRIPT_CREATE_DOC, SCRIPT_DETAIL_DOC, SCRIPT_LIST_DOC

logger = logging.getLogger(__name__)

bp = Blueprint("scripts", __name__, url_prefix="/api/scripts")


@bp.post("")
@login_required
@swag_from(SCRIPT_CREATE_DOC)
def create_script() -> Any:
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()

    if not title:
        return jsonify({"error": "Title is required"}), 400
    if not content:
        return jsonify({"error": "Content is required"}), 400

    script = Script(user_id=current_user.id, title=title, content=content)
    try:
        db.session.add(script)
        db.session.commit()
    except Exception as exc:  # pragma: no cover - database failure
        db.session.rollback()
        logger.exception("Failed to create script: %s", exc)
        return jsonify({"error": "Failed to create script"}), 500

    return jsonify({"script": script.to_dict()}), 201


@bp.get("")
@login_required
@swag_from(SCRIPT_LIST_DOC)
def list_scripts() -> Any:
    limit = max(1, min(100, request.args.get("limit", default=50, type=int)))
    scripts = (
        Script.query.filter_by(user_id=current_user.id)
        .order_by(Script.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({"scripts": [script.to_dict() for script in scripts], "count": len(scripts)})


@bp.get("/<int:script_id>")
@login_required
@swag_from(SCRIPT_DETAIL_DOC)
def get_script(script_id: int) -> Any:
    script = db.session.get(Script, script_id)
    if not script or script.user_id != current_user.id:
        return jsonify({"error": "Script not found"}), 404
    return jsonify({"script": script.to_dict()}), 200
