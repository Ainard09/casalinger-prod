from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy.exc import IntegrityError
import json

db = SQLAlchemy()

class Agent(db.Model):
    __tablename__ = 'agents'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=True)  # For legacy support
    supabase_id = db.Column(db.String, unique=True, nullable=True)  # Supabase auth user ID
    migrated_to_supabase = db.Column(db.Boolean, default=False)
    agent_type = db.Column(db.String(50))
    phone = db.Column(db.String(20))
    address = db.Column(db.String(200))
    photo_url = db.Column(db.String(255), nullable=True)
    languages = db.Column(db.String(255), nullable=True)
    specialty = db.Column(db.String(50), nullable=True)
    listings = db.relationship('Listing', back_populates='agent')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
    onboarding_complete = db.Column(db.Boolean, default=False)

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=True)  # For legacy support
    supabase_id = db.Column(db.String, unique=True, nullable=True)  # Supabase auth user ID
    migrated_to_supabase = db.Column(db.Boolean, default=False)
    interactions = db.relationship('Interaction', back_populates='user', cascade="all, delete-orphan")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
    onboarding_complete = db.Column(db.Boolean, default=False)  

    @property
    def saved_listings(self):
        return [interaction.listing for interaction in self.interactions if interaction.interaction_type == "saved"]

class Listing(db.Model):
    __tablename__ = 'listings'
    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Float, nullable=False)
    bedrooms = db.Column(db.Integer, nullable=True)
    bathrooms = db.Column(db.Float, nullable=True)
    sqft = db.Column(db.Integer, nullable=True)
    city = db.Column(db.String(80), nullable=True)
    state = db.Column(db.String(80), nullable=True)
    area = db.Column(db.String(120), nullable=True)
    address = db.Column(db.String(255), nullable=True)
    tags = db.Column(db.String(255), nullable=True)
    amenities = db.Column(db.Text, nullable=True)
    interior_features = db.Column(db.Text, nullable=True)
    exterior_features = db.Column(db.Text, nullable=True)
    leasing_terms = db.Column(db.Text, nullable=True)
    policy = db.Column(db.Text, nullable=True)
    availability_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
    image_paths = db.Column(db.String(1024), nullable=True)  # JSON array of Supabase storage URLs
    video_path = db.Column(db.String(255), nullable=True)  # Supabase storage URL
    listing_type = db.Column(db.String(50), nullable=False, default='individual')
    rent_period = db.Column(db.String(20), default='year')
    
    # Promotion fields
    is_featured = db.Column(db.Boolean, default=False)
    is_promoted = db.Column(db.Boolean, default=False)
    promoted_until = db.Column(db.DateTime, nullable=True)
    paused_at = db.Column(db.DateTime, nullable=True)
    remaining_days = db.Column(db.Float, nullable=True)
    
    # Relationships
    agent = db.relationship('Agent', back_populates='listings')
    interactions = db.relationship('Interaction', back_populates='listing', cascade="all, delete-orphan")
    units = db.relationship('Unit', backref='listing', cascade="all, delete-orphan")
    reels = db.relationship('Reel', backref='listing', lazy=True)

class Interaction(db.Model):
    __tablename__ = 'interactions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    state = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(255), nullable=True)
    area = db.Column(db.String(255), nullable=True)
    tags = db.Column(db.Text, nullable=True)
    listing_id = db.Column(db.Integer, db.ForeignKey('listings.id'), nullable=False)
    interaction_type = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', back_populates='interactions')
    listing = db.relationship('Listing', back_populates='interactions')

class Reel(db.Model):
    __tablename__ = 'reels'
    id = db.Column(db.Integer, primary_key=True)
    listing_id = db.Column(db.Integer, db.ForeignKey('listings.id'), nullable=False)
    video_path = db.Column(db.String(255), nullable=False)  # Supabase storage URL
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class CommunityPost(db.Model):
    __tablename__ = 'community_posts'
    id = db.Column(db.Integer, primary_key=True)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    author_name = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    category = db.Column(db.String(255), nullable=True)
    comments = db.relationship('CommunityComment', backref='post', cascade="all, delete-orphan")
    likes = db.relationship('CommunityLike', backref='post', cascade="all, delete-orphan")

class CommunityComment(db.Model):
    __tablename__ = 'community_comments'
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('community_posts.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    author_name = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    parent_comment_id = db.Column(db.Integer, db.ForeignKey('community_comments.id'), nullable=True)
    replies = db.relationship('CommunityComment', backref=db.backref('parent', remote_side=[id]), cascade="all, delete-orphan")
    likes = db.relationship('CommunityCommentLike', backref='comment', cascade="all, delete-orphan")

class CommunityLike(db.Model):
    __tablename__ = 'community_likes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey('community_posts.id'), nullable=False)
    __table_args__ = (db.UniqueConstraint('user_id', 'post_id', name='_user_post_uc'),)

class CommunityCommentLike(db.Model):
    __tablename__ = 'community_comment_likes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    comment_id = db.Column(db.Integer, db.ForeignKey('community_comments.id'), nullable=False)
    __table_args__ = (db.UniqueConstraint('user_id', 'comment_id', name='_user_comment_uc'),)

class Unit(db.Model):
    __tablename__ = 'units'
    id = db.Column(db.Integer, primary_key=True)
    listing_id = db.Column(db.Integer, db.ForeignKey('listings.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    bedrooms = db.Column(db.Integer, nullable=False)
    bathrooms = db.Column(db.Float, nullable=False)
    sqft = db.Column(db.Integer, nullable=True)
    price_min = db.Column(db.Float, nullable=False)
    price_max = db.Column(db.Float, nullable=False)
    is_available = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PropertyApplication(db.Model):
    __tablename__ = 'property_applications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(255), nullable=False)
    listing_id = db.Column(db.Integer, db.ForeignKey('listings.id'), nullable=False)
    applicant_name = db.Column(db.String(255), nullable=False)
    applicant_email = db.Column(db.String(255), nullable=False)
    applicant_phone = db.Column(db.String(50), nullable=False)
    monthly_income = db.Column(db.Float, nullable=False)
    employment_status = db.Column(db.String(100), nullable=False)
    move_in_date = db.Column(db.String(20), nullable=False)
    lease_duration = db.Column(db.Integer, nullable=False)
    additional_notes = db.Column(db.Text)
    status = db.Column(db.String(50), default='pending')
    created_at = db.Column(db.String(50), nullable=False)
    updated_at = db.Column(db.String(50))
    
    listing = db.relationship('Listing', backref='applications')

class ViewingBooking(db.Model):
    __tablename__ = 'viewing_bookings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(255), nullable=False)
    listing_id = db.Column(db.Integer, db.ForeignKey('listings.id'), nullable=False)
    viewer_name = db.Column(db.String(255), nullable=False)
    viewer_email = db.Column(db.String(255), nullable=False)
    viewer_phone = db.Column(db.String(50), nullable=False)
    preferred_date = db.Column(db.String(20), nullable=False)
    preferred_time = db.Column(db.String(10), nullable=False)
    alternative_date = db.Column(db.String(20))
    alternative_time = db.Column(db.String(10))
    special_requirements = db.Column(db.Text)
    status = db.Column(db.String(50), default='pending')
    created_at = db.Column(db.String(50), nullable=False)
    updated_at = db.Column(db.String(50))
    
    listing = db.relationship('Listing', backref='bookings')

class Admin(db.Model):
    __tablename__ = 'admins'
    id = db.Column(db.Integer, primary_key=True)
    supabase_id = db.Column(db.String, unique=True, nullable=False)  # Supabase auth user ID
    full_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    role = db.Column(db.String(50), default='admin')
    is_active = db.Column(db.Boolean, default=True)
    permissions = db.Column(db.Text, nullable=True)  # JSON string of permissions
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    onboarding_complete = db.Column(db.Boolean, default=False)  


def upsert_admin_from_onboarding(supabase_id, email, full_name, role, permissions, is_active, onboarding_complete=False, created_at=None, last_login=None):
    admin = Admin.query.filter_by(supabase_id=supabase_id).first()
    if not admin:
        admin = Admin(
            supabase_id=supabase_id,
            full_name=full_name,
            email=email,
            role=role,
            is_active=is_active,
            permissions=json.dumps(permissions),
            created_at=created_at or datetime.utcnow(),
            last_login=last_login,
            onboarding_complete=onboarding_complete
        )
        db.session.add(admin)
    else:
        admin.full_name = full_name
        admin.email = email
        admin.role = role
        admin.is_active = is_active
        admin.permissions = json.dumps(permissions)
        admin.onboarding_complete = onboarding_complete
        if last_login:
            admin.last_login = last_login
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()

def update_admin_last_login(supabase_id):
    admin = Admin.query.filter_by(supabase_id=supabase_id).first()
    if admin:
        admin.last_login = datetime.utcnow()
        db.session.commit()
