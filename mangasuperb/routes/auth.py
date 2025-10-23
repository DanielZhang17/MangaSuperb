"""Authentication and session management endpoints."""
from __future__ import annotations

import logging
import random
import re
from typing import Any, Dict

from flasgger import swag_from
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy.exc import IntegrityError

from mangasuperb.extensions import bcrypt, db
from models import User
from swagger import (
    AUTH_LOGIN_DOC,
    AUTH_LOGOUT_DOC,
    AUTH_ME_DOC,
    AUTH_REGISTER_DOC,
    AUTH_UPDATE_EMAIL_DOC,
    AUTH_UPDATE_PASSWORD_DOC,
    AUTH_UPDATE_USERNAME_DOC,
)

logger = logging.getLogger(__name__)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _parse_auth_payload() -> Dict[str, Any]:
    if not request.is_json:
        return {}
    return request.get_json(silent=True) or {}


def _validate_username(username: str) -> str | None:
    if not username:
        return "Username is required"
    if len(username) < 3 or len(username) > 80:
        return "Username must be between 3 and 80 characters"
    return None


def _validate_email(email: str) -> str | None:
    if not email:
        return "Email is required"
    if not EMAIL_REGEX.match(email):
        return "Email address is invalid"
    if len(email) > 255:
        return "Email address must be 255 characters or fewer"
    return None


def _validate_password(password: str) -> str | None:
    if not password:
        return "Password is required"
    if len(password) < 8:
        return "Password must be at least 8 characters long"
    return None


def _validate_registration(username: str, email: str, password: str) -> str | None:
    for validator, value in (
        (_validate_username, username),
        (_validate_email, email),
        (_validate_password, password),
    ):
        error = validator(value)
        if error:
            return error
    return None


@bp.post("/register")
@swag_from(AUTH_REGISTER_DOC)
def register() -> Any:
    payload = _parse_auth_payload()
    username = (payload.get("username") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    error = _validate_registration(username, email, password)
    if error:
        return jsonify({"error": error}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 409

    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    avatar_index = random.randint(1, 4)
    user = User(username=username, email=email, password_hash=password_hash, avatar_index=avatar_index)

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        logger.info(
            "Registration attempted with existing username/email (username=%s, email=%s): %s",
            username,
            email,
            exc,
        )
        return jsonify({"error": "Username or email already exists"}), 409
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
    email = (payload.get("email") or "").strip().lower()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if (not email and not username) or not password:
        return jsonify({"error": "Email or username and password are required"}), 400

    user = None
    if email:
        user = User.query.filter_by(email=email).first()
    if not user and username:
        user = User.query.filter_by(username=username).first()

    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        logger.info("Failed login attempt for identifier: email=%s username=%s", email, username)
        return jsonify({"error": "Invalid credentials"}), 401

    login_user(user)
    logger.info("User logged in: %s", user.username)
    return jsonify({"user": user.to_dict()}), 200


@bp.post("/logout")
@swag_from(AUTH_LOGOUT_DOC)
@login_required
def logout() -> Any:
    username = current_user.username
    logout_user()
    logger.info("User logged out: %s", username)
    return jsonify({"message": "Logged out"}), 200


@bp.patch("/username")
@swag_from(AUTH_UPDATE_USERNAME_DOC)
@login_required
def update_username() -> Any:
    payload = _parse_auth_payload()
    new_username = (payload.get("username") or "").strip()

    error = _validate_username(new_username)
    if error:
        return jsonify({"error": error}), 400
    if new_username == current_user.username:
        return jsonify({"error": "New username must be different"}), 400
    if (
        User.query.filter(
            User.username == new_username,
            User.id != current_user.id,
        ).first()
        is not None
    ):
        return jsonify({"error": "Username already exists"}), 409

    current_user.username = new_username
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        logger.info(
            "Username update conflict for user_id %s -> %s: %s",
            current_user.id,
            new_username,
            exc,
        )
        return jsonify({"error": "Username already exists"}), 409

    logger.info("User %s updated username to %s", current_user.id, new_username)
    return jsonify({"user": current_user.to_dict()}), 200


@bp.patch("/email")
@swag_from(AUTH_UPDATE_EMAIL_DOC)
@login_required
def update_email() -> Any:
    payload = _parse_auth_payload()
    new_email = (payload.get("email") or "").strip().lower()

    error = _validate_email(new_email)
    if error:
        return jsonify({"error": error}), 400
    if new_email == current_user.email:
        return jsonify({"error": "New email must be different"}), 400
    if (
        User.query.filter(
            User.email == new_email,
            User.id != current_user.id,
        ).first()
        is not None
    ):
        return jsonify({"error": "Email already exists"}), 409

    current_user.email = new_email
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        logger.info(
            "Email update conflict for user_id %s -> %s: %s",
            current_user.id,
            new_email,
            exc,
        )
        return jsonify({"error": "Email already exists"}), 409

    logger.info("User %s updated email to %s", current_user.id, new_email)
    return jsonify({"user": current_user.to_dict()}), 200


@bp.patch("/password")
@swag_from(AUTH_UPDATE_PASSWORD_DOC)
@login_required
def update_password() -> Any:
    payload = _parse_auth_payload()
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""

    if not current_password or not new_password:
        return jsonify({"error": "Current and new passwords are required"}), 400

    error = _validate_password(new_password)
    if error:
        return jsonify({"error": error}), 400
    if bcrypt.check_password_hash(current_user.password_hash, new_password):
        return jsonify({"error": "New password must be different"}), 400
    if not bcrypt.check_password_hash(current_user.password_hash, current_password):
        return jsonify({"error": "Current password is incorrect"}), 400

    current_user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")

    try:
        db.session.commit()
    except Exception as exc:  # pragma: no cover - defensive logging
        db.session.rollback()
        logger.exception("Password update failed for user_id %s: %s", current_user.id, exc)
        return jsonify({"error": "Password update failed"}), 500

    logger.info("User %s updated password", current_user.id)
    return jsonify({"message": "Password updated"}), 200


@bp.get("/me")
@swag_from(AUTH_ME_DOC)
def current_user_profile() -> Any:
    if current_user.is_authenticated:
        return jsonify({"user": current_user.to_dict()}), 200
    return jsonify({"user": None}), 200
