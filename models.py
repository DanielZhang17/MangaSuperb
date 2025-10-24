"""Database models for MangaSuperb."""
from datetime import datetime

from typing import Any, Dict, Optional

from flask_login import UserMixin

from mangasuperb.extensions import db

class User(UserMixin, db.Model):
    """User account information"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    avatar_index = db.Column(db.Integer, nullable=False, default=1)

    # Relationships
    characters = db.relationship('Character', backref='user', lazy=True, cascade='all, delete-orphan')
    scripts = db.relationship('Script', backref='user', lazy=True, cascade='all, delete-orphan')
    comics = db.relationship('Comic', backref='user', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<User {self.username}>'

    def to_dict(self):
        """Serialize user for API responses"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'avatar_index': self.avatar_index,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

class Character(db.Model):
    """User-created characters"""
    __tablename__ = 'characters'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    style_prompt = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.String(255), nullable=True)
    optimized_description = db.Column(db.Text, nullable=True)
    image_job_id = db.Column(db.String(64), nullable=True, index=True)
    image_status = db.Column(db.String(20), nullable=False, default='idle')
    image_error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    comic_links = db.relationship(
        "ComicCharacter",
        back_populates="character",
        cascade="all, delete-orphan",
        lazy=True,
    )

    def __repr__(self):
        return f'<Character {self.name}>'

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'style_prompt': self.style_prompt,
            'image_url': self.image_url,
            'optimized_description': self.optimized_description,
            'image_job_id': self.image_job_id,
            'image_status': self.image_status,
            'image_error': self.image_error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_summary(self) -> Dict[str, Any]:
        """Serialize minimal character data for association payloads."""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'style_prompt': self.style_prompt,
            'image_url': self.image_url,
            'optimized_description': self.optimized_description,
        }

class Script(db.Model):
    """User-created scripts or stories"""
    __tablename__ = 'scripts'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    comics = db.relationship('Comic', backref='script', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Script {self.title}>'

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

class Comic(db.Model):
    """Metadata and status for each comic generation task"""
    __tablename__ = 'comics'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    script_id = db.Column(db.Integer, db.ForeignKey('scripts.id', ondelete='CASCADE'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)

    # Status: 'pending', 'processing', 'completed', 'failed'
    status = db.Column(db.String(20), nullable=False, default='pending')
    style_description = db.Column(db.Text, nullable=False, default='Classic manga black and white linework')
    aspect_ratio = db.Column(db.String(5), nullable=False, default='16:9')

    pdf_url = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    # RQ Job tracking
    job_id = db.Column(db.String(36), nullable=True, unique=True, index=True)  # RQ job ID
    error_message = db.Column(db.Text, nullable=True)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # Relationships
    pages = db.relationship(
        'ComicPage',
        backref='comic',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ComicPage.page_number',
    )
    comic_characters = db.relationship(
        'ComicCharacter',
        back_populates='comic',
        cascade='all, delete-orphan',
        order_by='ComicCharacter.sort_order',
        lazy=True,
    )

    def __repr__(self):
        return f'<Comic {self.title} - {self.status}>'

    def to_dict(self):
        payload = {
            'id': self.id,
            'user_id': self.user_id,
            'script_id': self.script_id,
            'title': self.title,
            'status': self.status,
            'style_description': self.style_description,
            'aspect_ratio': self.aspect_ratio,
            'pdf_url': self.pdf_url,
            'job_id': self.job_id,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'pages': [page.to_dict() for page in self.pages] if self.pages else []
        }

        if self.comic_characters:
            payload['characters'] = [link.to_summary() for link in self.comic_characters]
        else:
            payload['characters'] = []

        return payload


class ComicCharacter(db.Model):
    """Association mapping characters to comics with ordering and roles."""

    __tablename__ = 'comic_characters'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    character_id = db.Column(
        db.Integer,
        db.ForeignKey('characters.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    role = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('comic_id', 'character_id', name='uq_comic_character_pair'),
    )

    # Relationships
    comic = db.relationship('Comic', back_populates='comic_characters')
    character = db.relationship('Character', back_populates='comic_links')

    def __repr__(self) -> str:
        return f'<ComicCharacter comic={self.comic_id} character={self.character_id}>'

    def to_dict(self) -> Dict[str, Optional[str]]:
        """Serialize the association including role and ordering."""
        summary = {
            'comic_id': self.comic_id,
            'character_id': self.character_id,
            'role': self.role,
            'order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if self.character:
            summary['character'] = self.character.to_summary()
        return summary

    def to_summary(self) -> Dict[str, Any]:
        """Representation used within comic payloads."""
        base: Dict[str, Any] = {
            'id': self.character_id,
            'role': self.role,
            'order': self.sort_order,
        }
        if self.character:
            base.update(self.character.to_summary())
        return base

class ComicPage(db.Model):
    """Individual generated pages of a comic"""
    __tablename__ = 'comic_pages'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(db.Integer, db.ForeignKey('comics.id', ondelete='CASCADE'), nullable=False, index=True)
    page_number = db.Column(db.Integer, nullable=False)
    image_url = db.Column(db.String(255), nullable=False)
    panel_text = db.Column(db.Text, nullable=True)

    # Ensure unique page numbers per comic
    __table_args__ = (
        db.UniqueConstraint('comic_id', 'page_number', name='unique_comic_page'),
    )

    def __repr__(self):
        return f'<ComicPage {self.comic_id}-{self.page_number}>'

    def to_dict(self):
        return {
            'id': self.id,
            'comic_id': self.comic_id,
            'page_number': self.page_number,
            'image_url': self.image_url,
            'panel_text': self.panel_text,
        }
