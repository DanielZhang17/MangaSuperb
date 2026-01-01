"""Database models for MangaSuperb."""

from datetime import datetime
import json
from typing import Any, Dict, List

from flask_login import UserMixin

from mangasuperb.extensions import db


DEFAULT_STYLE_PRESETS: tuple[Dict[str, Any], ...] = (
    {
        "value": "Classic manga black and white linework.",
        "label": "经典黑白漫画线稿",
        "is_custom": False,
    },
    {
        "value": "High-contrast ink with splashy gradients",
        "label": "高对比墨线 + 渐变",
        "is_custom": False,
    },
    {
        "value": "Moebius-inspired clean lines, minimal shading",
        "label": "莫比乌斯风·干净线条",
        "is_custom": False,
    },
    {
        "value": "Gritty seinen style with textured shading",
        "label": "青年向质感阴影",
        "is_custom": False,
    },
)
DEFAULT_STYLE_VALUES = {preset["value"] for preset in DEFAULT_STYLE_PRESETS}
DEFAULT_LAYOUT_OPTIONS: tuple[str, ...] = ("auto-grid", "grid-2x2", "vertical", "cinematic")
DEFAULT_COLOR_MODES: tuple[str, ...] = ("black-white", "color")


def _default_style_presets() -> List[Dict[str, Any]]:
    return [dict(preset) for preset in DEFAULT_STYLE_PRESETS]


def _default_preferences_dict() -> Dict[str, Any]:
    return {
        "style_presets": _default_style_presets(),
        "selected_style": DEFAULT_STYLE_PRESETS[0]["value"],
        "default_layout": DEFAULT_LAYOUT_OPTIONS[0],
        "color_mode": DEFAULT_COLOR_MODES[0],
    }


def _default_preferences_json() -> str:
    return json.dumps(_default_preferences_dict(), ensure_ascii=False)


def _normalize_style_presets(raw_presets: Any) -> List[Dict[str, Any]]:
    presets = _default_style_presets()
    if not isinstance(raw_presets, list):
        return presets

    seen = {preset["value"] for preset in presets}
    for entry in raw_presets:
        if not isinstance(entry, dict):
            continue
        value_raw = entry.get("value") or entry.get("prompt")
        if not isinstance(value_raw, str):
            continue
        value = value_raw.strip()
        if not value:
            continue

        label_raw = entry.get("label") or entry.get("name")
        label = label_raw.strip() if isinstance(label_raw, str) else ""
        if not label:
            label = "Custom Style"

        is_custom_flag = entry.get("is_custom")
        is_custom = bool(is_custom_flag) or value not in DEFAULT_STYLE_VALUES

        if value in DEFAULT_STYLE_VALUES:
            # Preserve canonical defaults but allow label overrides if provided.
            for preset in presets:
                if preset["value"] == value and label_raw:
                    preset["label"] = label
            continue

        if value in seen:
            # Update existing custom entry label if needed.
            for preset in presets:
                if preset["value"] == value:
                    preset["label"] = label
                    preset["is_custom"] = True
                    break
            continue

        presets.append(
            {
                "value": value,
                "label": label,
                "is_custom": is_custom,
            }
        )
        seen.add(value)

    return presets


def _normalize_preferences(raw: Any) -> Dict[str, Any]:
    base = _default_preferences_dict()
    if raw is None:
        return base

    data: Dict[str, Any]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            parsed = {}
        data = parsed if isinstance(parsed, dict) else {}
    elif isinstance(raw, dict):
        data = raw
    else:
        data = {}

    base["style_presets"] = _normalize_style_presets(data.get("style_presets"))

    selected = data.get("selected_style")
    if isinstance(selected, str) and selected.strip():
        base["selected_style"] = selected.strip()

    preset_values = {preset["value"] for preset in base["style_presets"]}
    if base["selected_style"] not in preset_values:
        base["selected_style"] = base["style_presets"][0]["value"]

    layout = data.get("default_layout")
    if isinstance(layout, str) and layout in DEFAULT_LAYOUT_OPTIONS:
        base["default_layout"] = layout

    color_mode = data.get("color_mode")
    if isinstance(color_mode, str) and color_mode in DEFAULT_COLOR_MODES:
        base["color_mode"] = color_mode

    return base


def _apply_preferences_update(current: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    working = {
        "style_presets": [dict(item) for item in current.get("style_presets", _default_style_presets())],
        "selected_style": current.get("selected_style", DEFAULT_STYLE_PRESETS[0]["value"]),
        "default_layout": current.get("default_layout", DEFAULT_LAYOUT_OPTIONS[0]),
        "color_mode": current.get("color_mode", DEFAULT_COLOR_MODES[0]),
    }

    style_presets_update = updates.get("style_presets")
    if isinstance(style_presets_update, list):
        working["style_presets"] = _normalize_style_presets(style_presets_update)

    selected_update = updates.get("selected_style")
    if isinstance(selected_update, str) and selected_update.strip():
        working["selected_style"] = selected_update.strip()

    preset_values = {preset["value"] for preset in working["style_presets"]}
    if working["selected_style"] not in preset_values:
        working["selected_style"] = working["style_presets"][0]["value"]

    layout_update = updates.get("default_layout")
    if isinstance(layout_update, str) and layout_update in DEFAULT_LAYOUT_OPTIONS:
        working["default_layout"] = layout_update

    color_update = updates.get("color_mode")
    if isinstance(color_update, str) and color_update in DEFAULT_COLOR_MODES:
        working["color_mode"] = color_update

    return working


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
    def default_preferences() -> Dict[str, Any]:
        return _default_preferences_dict()

    def get_preferences(self) -> Dict[str, Any]:
        return _normalize_preferences(self.preferences)

    def set_preferences(self, preferences: Dict[str, Any]) -> None:
        normalized = _apply_preferences_update(_default_preferences_dict(), preferences)
        self.preferences = json.dumps(normalized, ensure_ascii=False)

    def apply_preferences_update(self, updates: Dict[str, Any]) -> Dict[str, Any]:
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
    name = db.Column(db.String(100), nullable=False, default='unspecified', server_default='unspecified')
    description = db.Column(db.Text, nullable=False)
    sex = db.Column(db.String(20), nullable=False, default='unspecified')
    is_public = db.Column(db.Boolean, nullable=False, default=False, index=True)
    style_prompt = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.String(255), nullable=True)
    optimized_description = db.Column(db.Text, nullable=True)
    image_job_id = db.Column(db.String(64), nullable=True, index=True)
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
