"""Database models for MangaSuperb."""

from datetime import datetime

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
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(100), nullable=False)
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
    aspect_ratio = db.Column(db.String(5), nullable=False, default='16:9')

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
        }


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
        layout = None
        if self.comic and self.comic.page_layouts:
            layout = next(
                (item for item in self.comic.page_layouts if item.page_number == self.page_number),
                None,
            )
        return {
            'id': self.id,
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
