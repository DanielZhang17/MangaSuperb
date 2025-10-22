"""Authentication and session management endpoints."""
from __future__ import annotations

import logging
from typing import Any, Dict

from flasgger import swag_from
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy.exc import IntegrityError

from mangasuperb.extensions import bcrypt, db
from models import User
from swagger import AUTH_LOGIN_DOC, AUTH_LOGOUT_DOC, AUTH_ME_DOC, AUTH_REGISTER_DOC

logger = logging.getLogger(__name__)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _parse_auth_payload() -> Dict[str, Any]:
    if not request.is_json:
        return {}
    return request.get_json(silent=True) or {}


def _validate_credentials(username: str, password: str) -> str | None:
    if not username or not password:
        return "Username and password are required"
    if len(username) < 3 or len(username) > 80:
        return "Username must be between 3 and 80 characters"
    if len(password) < 8:
        return "Password must be at least 8 characters long"
    return None


@bp.post("/register")
@swag_from(AUTH_REGISTER_DOC)
def register() -> Any:
    payload = _parse_auth_payload()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    error = _validate_credentials(username, password)
    if error:
        return jsonify({"error": error}), 400

    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    user = User(username=username, password_hash=password_hash)

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        logger.info("Registration attempted with existing username: %s", username)
        return jsonify({"error": "Username already exists"}), 409
    except Exception as exc:  # pragma: no cover - defensive logging
        db.session.rollback()
        logger.exception("Registration failed for username %s: %s", username, exc)
        return jsonify({"error": "Registration failed"}), 500

    login_user(user)
    logger.info("User registered and logged in: %s", username)
    return jsonify({"user": user.to_dict()}), 201


@bp.post("/login")
@swag_from(AUTH_LOGIN_DOC)
def login() -> Any:
    payload = _parse_auth_payload()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        logger.info("Failed login attempt for username: %s", username)
        return jsonify({"error": "Invalid credentials"}), 401

    login_user(user)
    logger.info("User logged in: %s", username)
    return jsonify({"user": user.to_dict()}), 200


@bp.post("/logout")
@swag_from(AUTH_LOGOUT_DOC)
@login_required
def logout() -> Any:
    username = current_user.username
    logout_user()
    logger.info("User logged out: %s", username)
    return jsonify({"message": "Logged out"}), 200


@bp.get("/me")
@swag_from(AUTH_ME_DOC)
def current_user_profile() -> Any:
    if current_user.is_authenticated:
        return jsonify({"user": current_user.to_dict()}), 200
    return jsonify({"user": None}), 200
