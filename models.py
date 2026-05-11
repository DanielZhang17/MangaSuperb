"""Database models for MangaSuperb."""

import json
from datetime import datetime
from typing import Any

from flask_login import UserMixin

from mangasuperb.extensions import db
from mangasuperb.services import auto_preferences as _auto_preferences

DEFAULT_STYLE_PRESETS = _auto_preferences.STYLE_PRESETS
DEFAULT_STYLE_VALUES = {preset["value"] for preset in DEFAULT_STYLE_PRESETS}
DEFAULT_LAYOUT_OPTIONS = _auto_preferences.LAYOUT_OPTIONS
DEFAULT_COLOR_MODES = _auto_preferences.COLOR_MODES


def _default_style_presets() -> list[dict[str, Any]]:
    return [dict(preset) for preset in DEFAULT_STYLE_PRESETS]


def _default_preferences_dict() -> dict[str, Any]:
    return _auto_preferences.default_preferences()


def _default_preferences_json() -> str:
    return json.dumps(_default_preferences_dict(), ensure_ascii=False)


def _normalize_preferences(raw: Any) -> dict[str, Any]:
    return _auto_preferences.normalize_preferences(raw)


def _apply_preferences_update(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    return _auto_preferences.apply_preferences_update(current, updates)


class User(UserMixin, db.Model):
    """User account information"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    avatar_index = db.Column(db.Integer, nullable=False, default=1)
    preferences = db.Column(
        db.Text,
        nullable=False,
        default=_default_preferences_json,
        server_default=db.text("'{}'"),
    )

    # Relationships
    characters = db.relationship(
        'Character',
        backref='user',
        lazy=True,
        cascade='all, delete-orphan',
    )
    scripts = db.relationship(
        'Script',
        backref='user',
        lazy=True,
        cascade='all, delete-orphan',
    )
    comics = db.relationship(
        'Comic',
        backref='user',
        lazy=True,
        cascade='all, delete-orphan',
    )
    comic_likes = db.relationship(
        'ComicLike',
        backref='user',
        lazy=True,
        cascade='all, delete-orphan',
    )

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
            'preferences': self.get_preferences(),
        }

    @staticmethod
    def default_preferences() -> dict[str, Any]:
        return _default_preferences_dict()

    def get_preferences(self) -> dict[str, Any]:
        return _normalize_preferences(self.preferences)

    def set_preferences(self, preferences: dict[str, Any]) -> None:
        normalized = _apply_preferences_update(_default_preferences_dict(), preferences)
        self.preferences = json.dumps(normalized, ensure_ascii=False)

    def apply_preferences_update(self, updates: dict[str, Any]) -> dict[str, Any]:
        current = self.get_preferences()
        merged = _apply_preferences_update(current, updates)
        self.preferences = json.dumps(merged, ensure_ascii=False)
        return merged


class Character(db.Model):
    """User-created characters"""
    __tablename__ = 'characters'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    name = db.Column(
        db.String(100),
        nullable=False,
        default='unspecified',
        server_default='unspecified',
    )
    description = db.Column(db.Text, nullable=False)
    sex = db.Column(db.String(20), nullable=False, default='unspecified')
    is_public = db.Column(db.Boolean, nullable=False, default=False, index=True)
    style_prompt = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.String(255), nullable=True)
    optimized_description = db.Column(db.Text, nullable=True)
    image_job_id = db.Column(db.String(64), nullable=True, index=True)
    optimization_job_id = db.Column(db.String(64), nullable=True, index=True)
    image_status = db.Column(db.String(20), nullable=False, default='idle')
    image_error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # Relationships
    comic_links = db.relationship(
        "ComicCharacter",
        back_populates="character",
        lazy=True,
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f'<Character {self.name}>'

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'sex': self.sex,
            'is_public': self.is_public,
            'style_prompt': self.style_prompt,
            'image_url': self.image_url,
            'optimized_description': self.optimized_description,
            'image_job_id': self.image_job_id,
            'image_status': self.image_status,
            'image_error': self.image_error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

class Script(db.Model):
    """User-created scripts or stories"""
    __tablename__ = 'scripts'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

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
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    script_id = db.Column(
        db.Integer,
        db.ForeignKey('scripts.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(200), nullable=False)

    # Status: 'pending', 'processing', 'completed', 'failed'
    status = db.Column(db.String(20), nullable=False, default='pending')
    workflow_stage = db.Column(db.String(20), nullable=False, default='outline')
    workflow_status = db.Column(db.String(20), nullable=False, default='pending')
    style_description = db.Column(
        db.Text,
        nullable=False,
        default='Classic manga black and white linework',
    )
    aspect_ratio = db.Column(db.String(5), nullable=False, default='2:3')

    pdf_url = db.Column(db.String(255), nullable=True)
    zip_url = db.Column(db.String(255), nullable=True)
    cover_image_url = db.Column(db.String(255), nullable=True)
    is_public = db.Column(db.Boolean, nullable=False, default=False, index=True)
    published_at = db.Column(db.DateTime(timezone=True), nullable=True)
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
    workflow_stages = db.relationship(
        'ComicWorkflowStage',
        backref='comic',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ComicWorkflowStage.id',
    )
    outline_sections = db.relationship(
        'ComicOutlineSection',
        backref='comic',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ComicOutlineSection.order_index',
    )
    panel_shots = db.relationship(
        'ComicPanelShot',
        backref='comic',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ComicPanelShot.sequence_index',
    )
    page_layouts = db.relationship(
        'ComicPageLayout',
        backref='comic',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ComicPageLayout.page_number',
    )
    character_links = db.relationship(
        'ComicCharacter',
        back_populates='comic',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ComicCharacter.order_index',
        single_parent=True,
    )
    likes = db.relationship(
        'ComicLike',
        backref='comic',
        lazy=True,
        cascade='all, delete-orphan',
    )

    def __repr__(self):
        return f'<Comic {self.title} - {self.status}>'

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'script_id': self.script_id,
            'title': self.title,
            'status': self.status,
            'workflow_stage': self.workflow_stage,
            'workflow_status': self.workflow_status,
            'style_description': self.style_description,
            'aspect_ratio': self.aspect_ratio,
            'pdf_url': self.pdf_url,
            'zip_url': self.zip_url,
            'cover_image_url': self.cover_image_url,
            'is_public': self.is_public,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'job_id': self.job_id,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'script': self.script.to_dict() if self.script else None,
            'pages': ([page.to_dict() for page in self.pages] if self.pages else []),
            'workflow_stages': (
                [stage.to_dict() for stage in self.workflow_stages]
                if self.workflow_stages
                else []
            ),
            'outline_sections': (
                [section.to_dict() for section in self.outline_sections]
                if self.outline_sections
                else []
            ),
            'panel_shots': (
                [panel.to_dict() for panel in self.panel_shots]
                if self.panel_shots
                else []
            ),
            'page_layouts': (
                [layout.to_dict() for layout in self.page_layouts]
                if self.page_layouts
                else []
            ),
            'characters': (
                [link.to_dict() for link in self.character_links]
                if self.character_links
                else []
            ),
            'like_count': getattr(self, '_like_count', len(self.likes) if self.likes else 0),
            'user_liked': getattr(self, '_user_liked', False),
        }

    def to_public_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'cover_image_url': self.cover_image_url,
            'pdf_url': self.pdf_url,
            'zip_url': self.zip_url,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'style_description': self.style_description,
            'aspect_ratio': self.aspect_ratio,
            'like_count': getattr(self, '_like_count', len(self.likes) if self.likes else 0),
        }


class ComicLike(db.Model):
    """User likes for comics."""

    __tablename__ = 'comic_likes'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'comic_id', name='uq_comic_like_user_comic'),
    )


class ComicCharacter(db.Model):
    """Association between comics and characters with ordering and role metadata."""

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
    order_index = db.Column(db.Integer, nullable=False, default=1)
    role = db.Column(db.String(50), nullable=True)

    __table_args__ = (
        db.UniqueConstraint('comic_id', 'character_id', name='uq_comic_character_link'),
    )

    comic = db.relationship('Comic', back_populates='character_links')
    character = db.relationship('Character', back_populates='comic_links')

    def __repr__(self):
        return f'<ComicCharacter comic={self.comic_id} character={self.character_id}>'

    def to_dict(self):
        character_data = self.character.to_dict() if self.character else None
        summary = {
            'comic_id': self.comic_id,
            'character_id': self.character_id,
            'order_index': self.order_index,
            'role': self.role,
            'comic_character_id': self.id,
        }
        if character_data:
            summary.update(
                {
                    'id': character_data['id'],
                    'name': character_data.get('name'),
                    'description': character_data.get('description'),
                    'sex': character_data.get('sex'),
                    'is_public': character_data.get('is_public'),
                    'style_prompt': character_data.get('style_prompt'),
                    'image_url': character_data.get('image_url'),
                    'optimized_description': character_data.get('optimized_description'),
                }
            )
        return summary

class ComicPage(db.Model):
    """Individual generated pages of a comic"""
    __tablename__ = 'comic_pages'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    script_id = db.Column(
        db.Integer,
        db.ForeignKey('scripts.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    page_number = db.Column(db.Integer, nullable=False)
    image_url = db.Column(db.String(255), nullable=False)
    panel_text = db.Column(db.Text, nullable=True)

    # Ensure unique page numbers per comic
    __table_args__ = (
        db.UniqueConstraint('comic_id', 'page_number', name='unique_comic_page'),
    )

    script = db.relationship('Script', backref=db.backref('comic_pages', lazy=True))

    def __repr__(self):
        return f'<ComicPage {self.comic_id}-{self.page_number}>'

    def to_dict(self):
        layout = None
        if self.comic and self.comic.page_layouts:
            layout = next(
                (item for item in self.comic.page_layouts if item.page_number == self.page_number),
                None,
            )
        return {
            'id': self.id,
            'script_id': self.script_id,
            'comic_id': self.comic_id,
            'page_number': self.page_number,
            'image_url': self.image_url,
            'panel_text': self.panel_text,
            'layout': layout.to_dict() if layout else None,
        }


class ComicRenderRun(db.Model):
    """Run-level state for first/all/remaining page generation."""

    __tablename__ = 'comic_render_runs'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    mode = db.Column(db.String(30), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='queued', index=True)
    current_page_number = db.Column(db.Integer, nullable=True)
    requested_pages_json = db.Column(db.Text, nullable=False, default='[]')
    completed_pages_json = db.Column(db.Text, nullable=False, default='[]')
    failed_pages_json = db.Column(db.Text, nullable=False, default='[]')
    abort_requested = db.Column(db.Boolean, nullable=False, default=False)
    job_id = db.Column(db.String(36), nullable=True, index=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    comic = db.relationship('Comic', backref=db.backref('render_runs', lazy=True))

    @staticmethod
    def _loads(value: str | None) -> list[int]:
        try:
            parsed = json.loads(value or '[]')
        except (TypeError, ValueError):
            return []
        return [
            int(item)
            for item in parsed
            if isinstance(item, int) or str(item).isdigit()
        ]

    @staticmethod
    def _dumps(values: list[int]) -> str:
        return json.dumps(sorted(set(int(value) for value in values)))

    @classmethod
    def create(
        cls,
        *,
        comic_id: int,
        user_id: int,
        mode: str,
        requested_pages: list[int],
    ):
        return cls(
            comic_id=comic_id,
            user_id=user_id,
            mode=mode,
            requested_pages_json=cls._dumps(requested_pages),
            completed_pages_json='[]',
            failed_pages_json='[]',
        )

    @property
    def requested_pages(self) -> list[int]:
        return self._loads(self.requested_pages_json)

    @property
    def completed_pages(self) -> list[int]:
        return self._loads(self.completed_pages_json)

    @property
    def failed_pages(self) -> list[int]:
        return self._loads(self.failed_pages_json)

    def mark_completed_page(self, page_number: int) -> None:
        self.completed_pages_json = self._dumps([*self.completed_pages, page_number])

    def mark_failed_page(self, page_number: int) -> None:
        self.failed_pages_json = self._dumps([*self.failed_pages, page_number])

    def to_dict(self):
        return {
            'id': self.id,
            'comic_id': self.comic_id,
            'user_id': self.user_id,
            'mode': self.mode,
            'status': self.status,
            'current_page_number': self.current_page_number,
            'requested_pages': self.requested_pages,
            'completed_pages': self.completed_pages,
            'failed_pages': self.failed_pages,
            'abort_requested': self.abort_requested,
            'job_id': self.job_id,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }


class ComicAutoRun(db.Model):
    """Durable state for one-click Auto Mode generation."""

    __tablename__ = 'comic_auto_runs'

    ACTIVE_STATUSES = {'queued', 'running', 'needs_review'}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    status = db.Column(db.String(32), nullable=False, default='queued', index=True)
    current_stage = db.Column(db.String(32), nullable=False, default='story', index=True)
    story_snapshot = db.Column(db.Text, nullable=False)
    title_snapshot = db.Column(db.String(255), nullable=False)
    preferences_snapshot_json = db.Column(db.Text, nullable=False, default='{}')
    character_review_json = db.Column(db.Text, nullable=True)
    selected_character_ids_json = db.Column(db.Text, nullable=False, default='[]')
    render_run_id = db.Column(
        db.Integer,
        db.ForeignKey('comic_render_runs.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    abort_requested = db.Column(db.Boolean, nullable=False, default=False)
    job_id = db.Column(db.String(128), nullable=True, index=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    comic = db.relationship('Comic', backref=db.backref('auto_runs', lazy=True))
    render_run = db.relationship('ComicRenderRun', backref=db.backref('auto_runs', lazy=True))

    @staticmethod
    def _loads_json(raw, fallback):
        try:
            parsed = json.loads(raw or '')
        except (TypeError, ValueError):
            return fallback
        return parsed

    @staticmethod
    def _dumps_json(value) -> str:
        return json.dumps(value, ensure_ascii=False)

    @classmethod
    def create(
        cls,
        *,
        comic_id: int,
        user_id: int,
        story_snapshot: str,
        title_snapshot: str,
        preferences_snapshot: dict[str, Any] | None = None,
    ):
        return cls(
            comic_id=comic_id,
            user_id=user_id,
            status='queued',
            current_stage='story',
            story_snapshot=story_snapshot,
            title_snapshot=title_snapshot,
            preferences_snapshot_json=cls._dumps_json(preferences_snapshot or {}),
            selected_character_ids_json='[]',
        )

    @property
    def preferences_snapshot(self) -> dict[str, Any]:
        parsed = self._loads_json(self.preferences_snapshot_json, {})
        return parsed if isinstance(parsed, dict) else {}

    @preferences_snapshot.setter
    def preferences_snapshot(self, value: dict[str, Any] | None) -> None:
        self.preferences_snapshot_json = self._dumps_json(value or {})

    @property
    def character_review(self) -> dict[str, Any] | None:
        parsed = self._loads_json(self.character_review_json, None)
        return parsed if isinstance(parsed, dict) else None

    @character_review.setter
    def character_review(self, value: dict[str, Any] | None) -> None:
        self.character_review_json = self._dumps_json(value) if value is not None else None

    @property
    def selected_character_ids(self) -> list[int]:
        parsed = self._loads_json(self.selected_character_ids_json, [])
        if not isinstance(parsed, list):
            return []
        ids: list[int] = []
        for item in parsed:
            if isinstance(item, int) or str(item).isdigit():
                ids.append(int(item))
        return ids

    @selected_character_ids.setter
    def selected_character_ids(self, value: list[int] | None) -> None:
        self.selected_character_ids_json = self._dumps_json([
            int(item)
            for item in (value or [])
            if isinstance(item, int) or str(item).isdigit()
        ])

    @property
    def render_progress(self) -> dict[str, int] | None:
        if not self.render_run:
            return None
        requested = self.render_run.requested_pages
        return {
            'completed': len(self.render_run.completed_pages),
            'failed': len(self.render_run.failed_pages),
            'total': len(requested),
            'current_page_number': self.render_run.current_page_number,
        }

    def to_dict(self):
        return {
            'id': self.id,
            'comic_id': self.comic_id,
            'user_id': self.user_id,
            'status': self.status,
            'current_stage': self.current_stage,
            'story_snapshot': self.story_snapshot,
            'title_snapshot': self.title_snapshot,
            'preferences_snapshot': self.preferences_snapshot,
            'character_review': self.character_review,
            'selected_character_ids': self.selected_character_ids,
            'render_run_id': self.render_run_id,
            'render_run': self.render_run.to_dict() if self.render_run else None,
            'render_progress': self.render_progress,
            'abort_requested': self.abort_requested,
            'job_id': self.job_id,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class ComicWorkflowStage(db.Model):
    """Track status and timing of each workflow stage for a comic."""

    __tablename__ = 'comic_workflow_stages'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    stage = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    job_id = db.Column(db.String(36), nullable=True, index=True)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    error_message = db.Column(db.Text, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('comic_id', 'stage', name='unique_comic_stage'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'comic_id': self.comic_id,
            'stage': self.stage,
            'status': self.status,
            'job_id': self.job_id,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message,
        }


class ComicOutlineSection(db.Model):
    """High-level outline sections for a comic."""

    __tablename__ = 'comic_outline_sections'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    order_index = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(200), nullable=True)
    summary = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='draft')
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        db.UniqueConstraint('comic_id', 'order_index', name='unique_outline_order'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'comic_id': self.comic_id,
            'order_index': self.order_index,
            'title': self.title,
            'summary': self.summary,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class ComicPanelShot(db.Model):
    """Detailed panel descriptions derived from the outline."""

    __tablename__ = 'comic_panel_shots'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    outline_section_id = db.Column(
        db.Integer,
        db.ForeignKey('comic_outline_sections.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    sequence_index = db.Column(db.Integer, nullable=False)
    page_number = db.Column(db.Integer, nullable=True)
    panel_number = db.Column(db.Integer, nullable=True)
    description = db.Column(db.Text, nullable=False)
    dialogue = db.Column(db.Text, nullable=True)
    camera_notes = db.Column(db.String(200), nullable=True)
    style_notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='draft')
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    outline_section = db.relationship(
        'ComicOutlineSection',
        backref=db.backref('panel_shots', lazy=True),
        lazy=True,
    )

    __table_args__ = (
        db.UniqueConstraint('comic_id', 'sequence_index', name='unique_panel_sequence'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'comic_id': self.comic_id,
            'outline_section_id': self.outline_section_id,
            'sequence_index': self.sequence_index,
            'page_number': self.page_number,
            'panel_number': self.panel_number,
            'description': self.description,
            'dialogue': self.dialogue,
            'camera_notes': self.camera_notes,
            'style_notes': self.style_notes,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class ComicPageLayout(db.Model):
    """Layout selections for each comic page."""

    __tablename__ = 'comic_page_layouts'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    comic_id = db.Column(
        db.Integer,
        db.ForeignKey('comics.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    page_number = db.Column(db.Integer, nullable=False)
    layout_key = db.Column(db.String(50), nullable=False, default='auto-grid')
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='suggested')
    selected_at = db.Column(db.DateTime(timezone=True), nullable=True)
    comic_page_id = db.Column(
        db.Integer,
        db.ForeignKey('comic_pages.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )

    panel_assignments = db.relationship(
        'ComicPagePanel',
        backref='layout',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ComicPagePanel.position',
    )

    __table_args__ = (
        db.UniqueConstraint('comic_id', 'page_number', name='unique_layout_page'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'comic_id': self.comic_id,
            'page_number': self.page_number,
            'layout_key': self.layout_key,
            'notes': self.notes,
            'status': self.status,
            'selected_at': self.selected_at.isoformat() if self.selected_at else None,
            'comic_page_id': self.comic_page_id,
            'panel_assignments': [assignment.to_dict() for assignment in self.panel_assignments],
        }


class ComicPagePanel(db.Model):
    """Mapping of panel shots to page layout positions."""

    __tablename__ = 'comic_page_panels'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    page_layout_id = db.Column(
        db.Integer,
        db.ForeignKey('comic_page_layouts.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    panel_shot_id = db.Column(
        db.Integer,
        db.ForeignKey('comic_panel_shots.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    position = db.Column(db.Integer, nullable=False)

    panel = db.relationship('ComicPanelShot', backref=db.backref('page_assignments', lazy=True))

    __table_args__ = (
        db.UniqueConstraint('page_layout_id', 'position', name='unique_layout_position'),
        db.UniqueConstraint('page_layout_id', 'panel_shot_id', name='unique_layout_panel'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'page_layout_id': self.page_layout_id,
            'panel_shot_id': self.panel_shot_id,
            'position': self.position,
        }
