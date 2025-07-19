from flask import Flask, request, render_template, redirect, url_for, flash, session, jsonify, make_response, send_from_directory, g
from flask_cors import CORS, cross_origin
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, case, distinct
from langchain_core.messages import HumanMessage
from supabase_models import db, Agent, User, Listing, Interaction, Reel, CommunityPost, CommunityComment, CommunityLike, CommunityCommentLike, PropertyApplication, ViewingBooking, Unit, Admin, upsert_admin_from_onboarding, update_admin_last_login
import os
import re
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import os
import json
import subprocess
import mimetypes
import random
import traceback
from datetime import datetime, timedelta, timezone
from recommender import Recommender
from helpers import clear_user_memory
from settings import settings
import nest_asyncio
import asyncio
from sqlalchemy import create_engine
from collections import Counter
from email_service import email_service
from redis_helper import (
    cache_response, 
    invalidate_cache_pattern, 
    invalidate_user_cache, 
    invalidate_listing_cache, 
    invalidate_agent_cache,
    invalidate_all_agent_caches,
    invalidate_cache_by_prefix,
    get_cache_stats, 
    clear_all_cache
)
from functools import wraps
from jose import jwt
import requests
from sqlalchemy.exc import IntegrityError
import time
from apscheduler.schedulers.background import BackgroundScheduler

nest_asyncio.apply()


ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'mov', 'avi', 'webm', 'quicktime'}



SUPABASE_JWT_SECRET = settings.SUPABASE_JWT_SECRET  # Add this to your settings

# Cache database URI in memory for better performance
DATABASE_URI = settings.SUPABASE_SQLALCHEMY_DATABASE_URI

# Use Supabase database for engine creation
engine = create_engine(DATABASE_URI)






# Decorator to require Supabase Auth
def require_supabase_authenticated(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
        
            return jsonify({'error': 'Missing or invalid token'}), 401
        token = auth_header.split(' ')[1]
        try:
            # Decode JWT (Supabase uses HS256 by default)
          
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=['HS256'], options={"verify_aud": False})
          
            g.supabase_id = payload['sub']
        except Exception as e:
         
            return jsonify({'error': 'Invalid Supabase token', 'details': str(e)}), 401
        return f(*args, **kwargs)
    return decorated_function

# Initialize Flask app
def create_app():
    app = Flask(__name__)
    CORS(app, supports_credentials=True, resources={r"/*": {"origins": settings.cors_origins}})
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
    app.config['SESSION_COOKIE_SECURE'] = True  # Set to True in production with HTTPS
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = "Lax"  # Allow cross-origin requests in development
    app.config['SESSION_COOKIE_DOMAIN'] = None  # Let Flask handle it
    app.secret_key = settings.APP_SECRET_KEY
  

    # Initialize SQLAlchemy
    db.init_app(app)

    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    # Do NOT run db.create_all() in production with Supabase
    # with app.app_context():
    #     db.create_all()

    mimetypes.add_type('video/mp4', '.mp4')
    mimetypes.add_type('video/quicktime', '.mov')  

    # Register a custom filter for loading JSON
    @app.template_filter('load_json')
    def load_json_filter(value):
        """Convert a JSON string into a Python object (list, dict, etc.)."""
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return []  # Return an empty list if there's an issue with parsing
    
    @app.route('/')
    def index():
        return 'Welcome to Casalinger API'

    def make_homepage_cache_key():
        user_id = request.args.get('user_id', 'anon')
        page = request.args.get('page', 1)
        return f"featured_properties:{user_id}:{page}"

   

    @app.route('/api/featured-properties')
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def api_featured_properties():
        # Try to get Supabase user ID from JWT
        auth_header = request.headers.get('Authorization', '')
        user_id = None
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            try:
                payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=['HS256'], options={"verify_aud": False})
                supabase_id = payload['sub']
                user = User.query.filter_by(supabase_id=supabase_id).first()
                if user:
                    user_id = user.id
            except Exception:
                user_id = None
        # Fallback to query param for guest/legacy
        if not user_id:
            user_id = request.args.get('user_id', 'anon')
        page = request.args.get('page', 1, type=int)
        search_location = request.args.get('location', '', type=str).lower().strip()

        cache_key = f"featured_properties:{user_id}:{page}:{search_location}"
        
        @cache_response(expiry=300, key_prefix=cache_key)
        def inner():
            per_page = 16
            saved_listing_ids = []

            if user_id and user_id != 'anon':
                saved_listing_ids = [
                    interaction.listing_id
                    for interaction in Interaction.query.filter_by(user_id=user_id, interaction_type="saved").all()
                ]

          
            from datetime import datetime, timedelta
            session_key = f'property_order_v5:{user_id}:{search_location or "global"}'
            session_time_key = f'{session_key}_ts'
            now = int(time.time())
            expire_seconds = 30 * 60

            pagewise_order = session.get(session_key)
            order_ts = session.get(session_time_key)

            if not pagewise_order or not order_ts or now - order_ts > expire_seconds or page == 1:
                def location_filter(query):
                    if search_location:
                        return query.filter(
                            (Listing.city.ilike(f"%{search_location}%")) | 
                            (Listing.state.ilike(f"%{search_location}%"))
                        )
                    return query

                # Get all properties with location filter
                all_props = list(location_filter(Listing.query).order_by(Listing.created_at.desc()).all())
                
                # Get user preferences for personalization
                user_preferences = {}
                if user_id and user_id != 'anon':
                    # Get user's saved listings to understand preferences
                    saved_listings = Interaction.query.filter_by(
                        user_id=user_id, 
                        interaction_type="saved"
                    ).all()
                    
                    # Extract preferences from saved listings
                    preferred_locations = set()
                    preferred_tags = set()
                    for saved in saved_listings:
                        if saved.state:
                            preferred_locations.add(saved.state.lower())
                        if saved.city:
                            preferred_locations.add(saved.city.lower())
                        if saved.tags:  # Now using the new tags field
                            tags = [tag.strip().lower() for tag in saved.tags.split(',')]
                            preferred_tags.update(tags)
                    
                    user_preferences = {
                        'locations': list(preferred_locations),
                        'tags': list(preferred_tags)
                    }

                # Separate properties by type
                featured = [p for p in all_props if getattr(p, 'is_featured', False)]
                promoted = [p for p in all_props if getattr(p, 'is_promoted', False) and not getattr(p, 'is_featured', False)]
                
                # Get old listings (not viewed in 15 days)
                fifteen_days_ago = datetime.now(timezone.utc) - timedelta(days=60)
                old_listings = [p for p in all_props if p.created_at < fifteen_days_ago]
                
                # Get newest listings (excluding featured/promoted/old)
                newest = [p for p in all_props if p not in featured and p not in promoted and p not in old_listings]

                # Personalize newest listings based on user preferences
                if user_preferences:
                    def preference_score(prop):
                        score = 0
                        # Location preference
                        if user_preferences['locations']:
                            prop_location = f"{prop.city} {prop.state}".lower()
                            for loc in user_preferences['locations']:
                                if loc in prop_location:
                                    score += 2
                                    break
                        # Tag preference
                        if user_preferences['tags'] and prop.tags:
                            prop_tags = [tag.strip().lower() for tag in prop.tags.split(',')]
                            for pref_tag in user_preferences['tags']:
                                if pref_tag.lower() in prop_tags:
                                    score += 1
                        return score
                    
                    newest.sort(key=preference_score, reverse=True)

                # Deduplicate
                seen = set()
                def dedup(lst):
                    out = []
                    for l in lst:
                        if l.id not in seen:
                            out.append(l)
                            seen.add(l.id)
                    return out

                featured = dedup(featured)
                promoted = dedup(promoted)
                newest = dedup(newest)
                old_listings = dedup(old_listings)

                # Build pages with new algorithm
                total_props = len(set([l.id for l in featured + promoted + newest + old_listings]))
                total_pages = (total_props + per_page - 1) // per_page
                pagewise_order = []
                used_ids = set()

                # Build a single prioritized list: interleave newest, featured, promoted, and up to 2 old per cycle
                prioritized_list = []
                idx_newest, idx_featured, idx_promoted, idx_old = 0, 0, 0, 0
                len_newest, len_featured, len_promoted, len_old = len(newest), len(featured), len(promoted), len(old_listings)
                used_ids = set()
                while (
                    idx_newest < len_newest or
                    idx_featured < len_featured or
                    idx_promoted < len_promoted or
                    idx_old < len_old
                ):
                    if idx_newest < len_newest:
                        prop = newest[idx_newest]
                        if prop.id not in used_ids:
                            prioritized_list.append(prop)
                            used_ids.add(prop.id)
                        idx_newest += 1
                    if idx_featured < len_featured:
                        prop = featured[idx_featured]
                        if prop.id not in used_ids:
                            prioritized_list.append(prop)
                            used_ids.add(prop.id)
                        idx_featured += 1
                    if idx_promoted < len_promoted:
                        prop = promoted[idx_promoted]
                        if prop.id not in used_ids:
                            prioritized_list.append(prop)
                            used_ids.add(prop.id)
                        idx_promoted += 1
                    # Interleave up to 2 old properties per cycle
                    old_added = 0
                    while idx_old < len_old and old_added < 2:
                        prop = old_listings[idx_old]
                        if prop.id not in used_ids:
                            prioritized_list.append(prop)
                            used_ids.add(prop.id)
                            old_added += 1
                        idx_old += 1
                # If any old properties remain, append them at the end
                while idx_old < len_old:
                    prop = old_listings[idx_old]
                    if prop.id not in used_ids:
                        prioritized_list.append(prop)
                        used_ids.add(prop.id)
                    idx_old += 1

                # Paginate the prioritized list
                for pg in range(total_pages):
                    page_start = pg * per_page
                    page_end = page_start + per_page
                    page_props = prioritized_list[page_start:page_end]
                    
                    # Apply slotting and boosting logic to this page
                    final_page_props = page_props.copy()
                    
                    # Slot featured/promoted at every 2nd position (index 1, 3, 5, ...)
                    featured_promoted = [p for p in final_page_props if getattr(p, 'is_featured', False) or getattr(p, 'is_promoted', False)]
                    others = [p for p in final_page_props if not getattr(p, 'is_featured', False) and not getattr(p, 'is_promoted', False)]
                    
                    # Reconstruct page with featured/promoted at every 2nd position
                    final_page_props = []
                    fp_idx = 0
                    other_idx = 0
                    
                    for i in range(len(page_props)):
                        if i % 2 == 1 and fp_idx < len(featured_promoted):  # Every 2nd position
                            final_page_props.append(featured_promoted[fp_idx])
                            fp_idx += 1
                        elif other_idx < len(others):
                            final_page_props.append(others[other_idx])
                            other_idx += 1
                        elif fp_idx < len(featured_promoted):
                            final_page_props.append(featured_promoted[fp_idx])
                            fp_idx += 1
                    
                    # Boost old listings to positions 3 and 7 (index 2 and 6) if available
                    old_in_page = [p for p in final_page_props if p.created_at < fifteen_days_ago]
                    non_old_in_page = [p for p in final_page_props if p.created_at >= fifteen_days_ago]
                    
                    if len(old_in_page) >= 2 and len(final_page_props) >= 7:
                        # Insert old listings at positions 3 and 7
                        temp_props = final_page_props.copy()
                        old_inserted = 0
                        for idx in [2, 6]:
                            if idx < len(temp_props) and old_inserted < len(old_in_page):
                                temp_props.insert(idx, old_in_page[old_inserted])
                                old_inserted += 1
                        final_page_props = temp_props[:per_page]  # Keep only per_page items
                    
                    seen_ids = set()
                    unique_final_page_props = []
                    for prop in final_page_props:
                        if prop.id not in seen_ids:
                            unique_final_page_props.append(prop)
                            seen_ids.add(prop.id)
                        if len(unique_final_page_props) == per_page:
                            break
                    # Backfill with more unique properties from prioritized_list if needed
                    if len(unique_final_page_props) < per_page:
                        next_idx = page_end
                        while len(unique_final_page_props) < per_page and next_idx < len(prioritized_list):
                            prop = prioritized_list[next_idx]
                            if prop.id not in seen_ids:
                                unique_final_page_props.append(prop)
                                seen_ids.add(prop.id)
                            next_idx += 1
                    final_page_props = unique_final_page_props
                    
                    page_ids = [prop.id for prop in final_page_props]
                    pagewise_order.append(page_ids)

                session[session_key] = pagewise_order
                session[session_time_key] = now

            total_pages = len(pagewise_order)
            page_idx = max(0, min(page - 1, total_pages - 1))
            paginated_ids = pagewise_order[page_idx] if pagewise_order and page_idx < len(pagewise_order) else []

            if paginated_ids:
                id_to_listing = {l.id: l for l in Listing.query.filter(Listing.id.in_(paginated_ids)).all()}
                paginated = [id_to_listing[pid] for pid in paginated_ids if pid in id_to_listing]
            else:
                paginated = []

            def serialize_property(prop):
                try:
                    images = json.loads(prop.image_paths) if prop.image_paths else []
                except Exception:
                    images = []
                images = [to_supabase_url(img, 'listings') for img in images if img]
                video_path = to_supabase_url(prop.video_path, 'listing-videos') if prop.video_path else None
                try:
                    tags = [tag.strip() for tag in prop.tags.split(',')] if prop.tags else []
                except Exception:
                    tags = []
                # --- Add units for complex listings ---
                units = []
                if getattr(prop, 'listing_type', None) == 'complex' and hasattr(prop, 'units') and prop.units:
                    for unit in prop.units:
                        units.append({
                            'id': unit.id,
                            'name': unit.name,
                            'bedrooms': unit.bedrooms,
                            'bathrooms': unit.bathrooms,
                            'sqft': unit.sqft,
                            'price_min': unit.price_min,
                            'price_max': unit.price_max,
                            'is_available': unit.is_available
                        })
                return {
                    "id": prop.id,
                    "title": prop.title,
                    "description": prop.description,
                    "price": prop.price,
                    "state": prop.state,
                    "city": prop.city,
                    "area": prop.area,
                    "bedrooms": prop.bedrooms,
                    "bathrooms": prop.bathrooms,
                    "listing_type": prop.listing_type,
                    "rent_period": getattr(prop, 'rent_period', 'month'),
                    "image_paths": images,
                    "video_path": video_path,
                    "tags": tags,
                    "is_featured": getattr(prop, 'is_featured', False),
                    "is_promoted": getattr(prop, 'is_promoted', False),
                    "created_at": prop.created_at.isoformat() if prop.created_at else None,
                    "updated_at": prop.updated_at.isoformat() if prop.updated_at else None,
                    "is_favorite": prop.id in saved_listing_ids,
                    "units": units if units else None
                }

            listings = [serialize_property(p) for p in final_page_props]

            return jsonify({
                "listings": listings,
                "page": page,
                "total_pages": total_pages,
                "has_prev": page > 1,
                "has_next": page < total_pages
            })

        return inner()

    @app.route('/api/register', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def api_register():
        data = request.json
        name = data.get('name')
        email = data.get('email')
        password = generate_password_hash(data.get('password'))

        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already registered"}), 400

        new_user = User(name=name, email=email, password=password)
        db.session.add(new_user)
        db.session.commit()

        # Set up session after successful registration
        session.permanent = True
        session['user_id'] = new_user.id
        session['user_name'] = new_user.name
        session.modified = True

        response = make_response(jsonify({
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email
        }))
        response.set_cookie('user_id', str(new_user.id), max_age=1800)  # 30 mins
        return response

    @app.route('/api/login', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def api_login():
        data = request.json
        email = data.get('email')
        password = data.get('password')

        print(f"Login attempt for email: {email}")
        print(f"Request cookies: {dict(request.cookies)}")

        user = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password, password):
            session.permanent = True
            session['user_id'] = user.id
            session['user_name'] = user.name
            session.modified = True

            print(f"Login successful for user_id: {user.id}")
            print(f"Session after login: {dict(session)}")

            response = make_response(jsonify({
                "id": user.id,
                "name": user.name,
                "email": user.email
            }))
            response.set_cookie('user_id', str(user.id), max_age=1800)  # 30 mins
            response.set_cookie('session', request.cookies.get('session', ''), max_age=1800)
            
            print(f"Response cookies: {dict(response.headers)}")
            return response

        print(f"Login failed for email: {email}")
        return jsonify({"error": "Invalid credentials"}), 401
    
    @app.before_request
    def make_session_permanent():
        session.permanent = True


    @app.route('/agent/login', methods=['GET', 'POST'])
    def agent_login():
        if request.method == 'POST':
            email = request.form['email']
            password = request.form['password']
            agent = Agent.query.filter_by(email=email).first()

            if agent and check_password_hash(agent.password, password):
                session['agent_id'] = agent.id
                session['agent_name'] = agent.name
                flash(f"Welcome back, {agent.name}!", "success")
                return redirect(url_for('agent_dashboard'))
            else:
                flash("Invalid credentials", "danger")

        return render_template('agent_login.html')

    
    @app.route('/api/agent/login', methods=['POST'])
    def login_agent():
        data = request.get_json()

        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'message': 'Email and password are required.'}), 400

        agent = Agent.query.filter_by(email=email).first()

        if not agent or not check_password_hash(agent.password, password):
            return jsonify({'message': 'Invalid email or password.'}), 401

        return jsonify({
            'message': 'Login successful',
            'agent_id': agent.id,
            'name': agent.name,
            'agent_type': agent.agent_type,
            'photo_url': agent.photo_url
            # 'token': token
        }), 200

    @app.route('/api/agent/register', methods=['POST'])
    @require_supabase_authenticated
    def register_agent():
        data = request.get_json()
        supabase_id = g.supabase_id
        # Get email from JWT payload
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.split(' ')[1]
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=['HS256'], options={"verify_aud": False})
        email = payload.get('email')
        if not email:
            return jsonify({'error': 'Email not found in Supabase token'}), 400
        name = data.get('name')
        agent_type = data.get('agent_type')
        phone = data.get('phone')
        address = data.get('address')
        specialty = data.get('specialty')
        languages = data.get('languages', [])
        languages_str = ','.join(languages) if languages else None
        photo_url = data.get('photo_url')
        if not all([name, email, agent_type]):
            return jsonify({'message': 'Missing required fields'}), 400
        if Agent.query.filter_by(supabase_id=supabase_id).first() or Agent.query.filter_by(email=email).first():
            return jsonify({'message': 'Agent with this Supabase ID or email already exists'}), 409
        new_agent = Agent(
            name=name,
            email=email,
            supabase_id=supabase_id,
            password='',
            agent_type=agent_type,
            phone=phone,
            address=address,
            photo_url=photo_url,
            languages=languages_str,
            specialty=specialty
        )
        db.session.add(new_agent)
        db.session.commit()
        return jsonify({
            'message': 'Agent registered successfully',
            'agent': {
                'id': new_agent.id,
                'name': new_agent.name,
                'email': new_agent.email,
                'supabase_id': new_agent.supabase_id,
                'agent_type': new_agent.agent_type,
                'phone': new_agent.phone,
                'address': new_agent.address,
                'photo_url': new_agent.photo_url,
                'languages': new_agent.languages,
                'specialty': new_agent.specialty
            }
        }), 201

    @app.route('/agent/register', methods=['GET', 'POST'])
    def agent_register():
        if request.method == 'POST':
            name = request.form['name']
            email = request.form['email']
            password = request.form['password']
            agent_type = request.form['agent_type']
            phone = request.form.get('phone')
            address = request.form.get('address')

            if Agent.query.filter_by(email=email).first():
                flash("An agent with this email already exists.", "danger")
                return redirect(url_for('agent_register'))

            new_agent = Agent(
                name=name,
                email=email,
                password=generate_password_hash(password),
                agent_type=agent_type,
                phone=phone,
                address=address
            )

            db.session.add(new_agent)
            db.session.commit()
            flash("Agent registration successful! Please log in.", "success")
            return redirect(url_for('agent_login'))

        return render_template('agent_register.html')

    # @app.route('/logout', methods=['POST'])
    # @cross_origin(origins=["http://localhost:5173"], supports_credentials=True)
    # def logout():
    #     user_id = session.pop('user_id', None)
    #     session.pop('user_name', None)

    #     if user_id:
    #         clear_user_memory(
    #             db_path=settings.DATABASE_PATH,
    #             thread_id=user_id
    #         )

    #     return jsonify({"message": "Logged out successfully"}), 200

    
    @app.route('/api/search-properties', methods=['GET'])
    @cache_response(expiry=180, key_prefix="search_properties")
    def api_search_properties():
        search = request.args.get('search', '', type=str)
        area = request.args.get('search_area', '', type=str)
        price_min = request.args.get('price_min', 0, type=int)
        price_max = request.args.get('price_max', 1_000_000_000, type=int)
        bedrooms = request.args.get('bedrooms', type=int)
        bathrooms = request.args.get('bathrooms', type=int)
        sort_by = request.args.get('sort_by', '', type=str)
        tags = request.args.get('tags', '', type=str)
        locked_location = request.args.get('locked_location', '', type=str)

        query = Listing.query
        if locked_location:
            query = query.filter((Listing.state.ilike(f"%{locked_location}%")) | (Listing.city.ilike(f"%{locked_location}%")))
        elif search:
            query = query.filter((Listing.state.ilike(f"%{search}%")) | (Listing.city.ilike(f"%{search}%")))
        if area:
            query = query.filter(Listing.area.ilike(f"%{area}%"))
        if price_min is not None:
            query = query.filter(Listing.price >= price_min)
        if price_max is not None:
            query = query.filter(Listing.price <= price_max)
        if bedrooms is not None:
            query = query.filter(Listing.bedrooms == bedrooms)
        if bathrooms is not None:
            query = query.filter(Listing.bathrooms == bathrooms)
        if tags:
            tag_list = [t.strip() for t in tags.split(',') if t.strip()]
            for tag in tag_list:
                query = query.filter(Listing.tags.ilike(f"%{tag}%"))

        results = query.all()

        # --- Round-robin mixing logic ---
        featured = [l for l in results if getattr(l, 'is_featured', False)]
        promoted = [l for l in results if getattr(l, 'is_promoted', False) and l not in featured]
        newest = sorted([l for l in results if l not in featured and l not in promoted], key=lambda x: x.created_at or datetime.min, reverse=True)
        random_old = [l for l in results if l not in featured and l not in promoted and l not in newest]

        import random
        random.shuffle(featured)
        random.shuffle(promoted)
        random.shuffle(newest)
        random.shuffle(random_old)

        max_results = 16
        idx_featured, idx_promoted, idx_newest, idx_old = 0, 0, 0, 0
        len_featured, len_promoted, len_newest, len_old = len(featured), len(promoted), len(newest), len(random_old)
        seen_ids = set()
        mixed = []
        while len(mixed) < max_results and (
            idx_featured < len_featured or idx_promoted < len_promoted or idx_newest < len_newest or idx_old < len_old
        ):
            if idx_featured < len_featured and len(mixed) < max_results:
                prop = featured[idx_featured]
                if prop.id not in seen_ids:
                    mixed.append(prop)
                    seen_ids.add(prop.id)
                idx_featured += 1
            if idx_promoted < len_promoted and len(mixed) < max_results:
                prop = promoted[idx_promoted]
                if prop.id not in seen_ids:
                    mixed.append(prop)
                    seen_ids.add(prop.id)
                idx_promoted += 1
            if idx_newest < len_newest and len(mixed) < max_results:
                prop = newest[idx_newest]
                if prop.id not in seen_ids:
                    mixed.append(prop)
                    seen_ids.add(prop.id)
                idx_newest += 1
            if idx_old < len_old and len(mixed) < max_results:
                prop = random_old[idx_old]
                if prop.id not in seen_ids:
                    mixed.append(prop)
                    seen_ids.add(prop.id)
                idx_old += 1

        def serialize(prop):
            try:
                images = json.loads(prop.image_paths) if prop.image_paths else []
            except Exception:
                images = []
            try:
                tags = [tag.strip() for tag in prop.tags.split(',')] if prop.tags else []
            except Exception:
                tags = []
            units_data = []
            if prop.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=prop.id).all()
                units_data = [
                    {
                        "id": unit.id,
                        "name": unit.name,
                        "bedrooms": unit.bedrooms,
                        "bathrooms": unit.bathrooms,
                        "sqft": unit.sqft,
                        "price_min": unit.price_min,
                        "price_max": unit.price_max,
                        "is_available": unit.is_available
                    } for unit in units
                ]
            return {
                "id": prop.id,
                "title": prop.title,
                "price": prop.price,
                "city": prop.city,
                "state": prop.state,
                "area": prop.area,
                "bedrooms": prop.bedrooms,
                "bathrooms": prop.bathrooms,
                "image_paths": images,
                "tags": tags,
                "listing_type": prop.listing_type,
                "rent_period": prop.rent_period,
                "units": units_data,
                "is_featured": getattr(prop, 'is_featured', False),
                "is_promoted": getattr(prop, 'is_promoted', False),
                "created_at": prop.created_at.isoformat() if prop.created_at else None
            }

        return jsonify({"listings": [serialize(l) for l in mixed]})
    

    @app.route('/api/upload-reel', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def upload_reel():
        try:
            data = request.get_json()
            listing_id = data.get('listing_id')
            reel_url = data.get('reel_url')

            if not listing_id or not reel_url:
                return jsonify({"error": "listing_id and reel_url are required"}), 400

            # Save the Supabase Storage URL to database
            new_reel = Reel(listing_id=listing_id, video_path=reel_url)
            db.session.add(new_reel)
            db.session.commit()

            # Invalidate cache after adding new reel
            invalidate_listing_cache(listing_id)

            return jsonify({
                "message": "Reel uploaded successfully",
                "reel_url": reel_url
            }), 201

        except Exception as e:
            print("Upload Reel Error:", traceback.format_exc())
            return jsonify({"error": "Internal Server Error"}), 500
        
    @app.route('/api/user-reels', methods=['GET'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)  # Cache for 10 minutes
    def get_user_reels():
        # Always use last 50 interactions from all users (not the current user)
        interactions = (
            Interaction.query
            .order_by(Interaction.created_at.desc())
            .limit(50)
            .all()
        )
        if not interactions:
            return jsonify({"reels": []})

        interacted_ids = [i.listing_id for i in interactions]
        listings = Listing.query.filter(Listing.id.in_(interacted_ids)).all()

        # Aggregate most common bedrooms, tags, city, state, area
        bedroom_counter = Counter()
        tag_counter = Counter()
        city_counter = Counter()
        state_counter = Counter()
        area_counter = Counter()
        for l in listings:
            if l.bedrooms is not None:
                bedroom_counter[l.bedrooms] += 1
            if l.tags:
                tag_counter.update([t.strip() for t in l.tags.split(',') if t.strip()])
            if l.city:
                city_counter[l.city] += 1
            if l.state:
                state_counter[l.state] += 1
            if l.area:
                area_counter[l.area] += 1

        top_bedrooms = [b for b, _ in bedroom_counter.most_common(2)]
        top_tags = [t for t, _ in tag_counter.most_common(2)]
        top_cities = [c for c, _ in city_counter.most_common(2)]
        top_states = [s for s, _ in state_counter.most_common(2)]
        top_areas = [a for a, _ in area_counter.most_common(2)]

        # Find listings with reels that match these attributes
        query = Listing.query
        filters = []
        if top_bedrooms:
            filters.append(Listing.bedrooms.in_(top_bedrooms))
        if top_tags:
            filters.append(db.or_(*[Listing.tags.ilike(f'%{tag}%') for tag in top_tags]))
        if top_cities:
            filters.append(Listing.city.in_(top_cities))
        if top_states:
            filters.append(Listing.state.in_(top_states))
        if top_areas:
            filters.append(Listing.area.in_(top_areas))
        if filters:
            query = query.filter(db.or_(*filters))
        query = query.filter(Listing.reels.any())

        listings_with_reels = query.order_by(Listing.id.desc()).limit(20).all()
        reels = []
        for l in listings_with_reels:
            # Get units data for complex listings
            units_data = []
            min_bedrooms = None
            max_bedrooms = None
            if l.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=l.id).all()
                units_data = [
                    {
                        "id": unit.id,
                        "name": unit.name,
                        "bedrooms": unit.bedrooms,
                        "bathrooms": unit.bathrooms,
                        "sqft": unit.sqft,
                        "price_min": unit.price_min,
                        "price_max": unit.price_max,
                        "is_available": unit.is_available
                    }
                    for unit in units
                ]
                if units_data:
                    min_bedrooms = min(u["bedrooms"] for u in units_data)
                    max_bedrooms = max(u["bedrooms"] for u in units_data)
            for reel in l.reels:
                reels.append({
                    'listing_id': l.id,
                    'video_url': reel.video_path,  # Now using Supabase Storage URL directly
                    'title': l.title,
                    'location': f'{l.area}, {l.city}, {l.state}',
                    'tags': [t.strip() for t in l.tags.split(',')] if l.tags else [],
                    'bedrooms': l.bedrooms,
                    'listing_type': l.listing_type,
                    'units': units_data,
                    'bedroom_range': f"{min_bedrooms}-{max_bedrooms}" if min_bedrooms is not None and max_bedrooms is not None and min_bedrooms != max_bedrooms else (str(min_bedrooms) if min_bedrooms is not None else None)
                })
        return jsonify({'reels': reels})


    @app.route('/api/listing/<int:listing_id>', methods=['PUT'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def update_listing(listing_id):
        listing = Listing.query.get_or_404(listing_id)
        # TODO: Add check to ensure the current_user (agent) owns this listing

        def safe_float(val, default=0.0):
            try:
                return float(val) if val is not None and val != '' else default
            except (ValueError, TypeError):
                return default

        def safe_int(val, default=0):
            try:
                return int(val) if val is not None and val != '' else default
            except (ValueError, TypeError):
                return default

        try:
            # Get JSON data from frontend (Supabase Storage URLs)
            data = request.get_json()

            listing.title = data.get('title')
            listing.description = data.get('description')
            listing.price = safe_float(data.get('price'))
            listing.bedrooms = safe_int(data.get('bedrooms'))
            listing.bathrooms = safe_float(data.get('bathrooms'))
            listing.sqft = safe_int(data.get('sqft'))
            listing.city = data.get('city')
            listing.state = data.get('state')
            listing.area = data.get('area')
            listing.address = data.get('address')
            listing.tags = data.get('tags')
            listing.amenities = data.get('amenities')
            listing.interior_features = data.get('interior_features')
            listing.exterior_features = data.get('exterior_features')
            listing.leasing_terms = data.get('leasing_terms')
            listing.policy = data.get('policy')
            listing.listing_type = data.get('listing_type')
            listing.rent_period = data.get('rent_period')
            availability_date_str = data.get('availability_date')
            if availability_date_str:
                try:
                    listing.availability_date = datetime.strptime(availability_date_str, '%Y-%m-%d')
                except Exception:
                    pass

            # --- Handle images and video (Supabase Storage URLs only) ---
            image_paths = data.get('image_paths', [])
            video_path = data.get('video_path')
            listing.image_paths = json.dumps(image_paths) if image_paths else None
            listing.video_path = video_path

            # Always update updated_at
            listing.updated_at = datetime.utcnow()

            db.session.commit()

            # Handle units for complex listings
            if listing.listing_type == 'complex':
                # First, delete existing units for this listing
                Unit.query.filter_by(listing_id=listing.id).delete()
                
                units_data = data.get('units')
                if units_data:
                    try:
                        if isinstance(units_data, str):
                            floorplans = json.loads(units_data)
                        else:
                            floorplans = units_data
                        
                        units_to_add = []
                        for fp in floorplans:
                            # Create parent unit (floorplan)
                            parent_unit = Unit(
                                listing_id=listing.id,
                                name=fp.get('name'),
                                bedrooms=safe_int(fp.get('beds') or fp.get('bedrooms')),
                                bathrooms=safe_float(fp.get('baths') or fp.get('bathrooms')),
                                sqft=safe_int(fp.get('sqft')),
                                price_min=safe_float(fp.get('price_min')),
                                price_max=safe_float(fp.get('price_max')),
                                is_available=any(unit.get('availability', False) for unit in fp.get('units', []))
                            )
                            units_to_add.append(parent_unit)

                            # Create child units
                            for unit_data in fp.get('units', []):
                                child_unit = Unit(
                                    listing_id=listing.id,
                                    name=f"{fp.get('name')} - {unit_data.get('name')}",
                                    bedrooms=safe_int(fp.get('beds') or fp.get('bedrooms')),
                                    bathrooms=safe_float(fp.get('baths') or fp.get('bathrooms')),
                                    sqft=safe_int(fp.get('sqft')),
                                    price_min=safe_float(unit_data.get('price')),
                                    price_max=safe_float(unit_data.get('price')),
                                    is_available=unit_data.get('availability', False)
                                )
                                units_to_add.append(child_unit)

                        db.session.bulk_save_objects(units_to_add)
                        db.session.commit()
                    except Exception as e:
                        print("Error parsing units data:", e)
            
            return jsonify({'message': 'Listing updated successfully'}), 200
        except Exception as e:
            db.session.rollback()
            print(f"Error updating listing: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/agent/<int:agent_id>/listings', methods=['GET'])
    @cache_response(expiry=300, key_prefix="agent_listings")  # Cache for 5 minutes
    def get_agent_listings(agent_id):
        listings = Listing.query.filter_by(agent_id=agent_id).order_by(Listing.id.desc()).all()
        listing_data = []

        for listing in listings:
            try:
                images = json.loads(listing.image_paths) if listing.image_paths else []
            except json.JSONDecodeError:
                images = []
            
            # Count views for this specific listing
            view_count = Interaction.query.filter_by(listing_id=listing.id, interaction_type='view').count()

            try:
                if listing.tags:
                    tags = [tag.strip() for tag in listing.tags.split(',')]
                else:
                    tags = []
            except Exception:
                tags = []

            # ✅ Fetch all reel paths related to this listing
            reels = Reel.query.filter_by(listing_id=listing.id).all()
            reel_video_paths = [reel.video_path for reel in reels if reel.video_path]

            # Calculate price range for complex listings
            price_display = listing.price
            bed_display = listing.bedrooms
            bath_display = listing.bathrooms
            
            if listing.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=listing.id).all()
                if units:
                    prices = [unit.price_min for unit in units if unit.price_min > 0]
                    beds = [unit.bedrooms for unit in units if unit.bedrooms > 0]
                    baths = [unit.bathrooms for unit in units if unit.bathrooms > 0]
                    
                    if prices:
                        min_price = min(prices)
                        max_price = max(prices)
                        price_display = f"{min_price}-{max_price}" if min_price != max_price else str(min_price)
                    
                    if beds:
                        min_beds = min(beds)
                        max_beds = max(beds)
                        bed_display = f"{int(min_beds)}-{int(max_beds)}" if min_beds != max_beds else str(int(min_beds))
                    
                    if baths:
                        min_baths = min(baths)
                        max_baths = max(baths)
                        bath_display = f"{int(min_baths)}-{int(max_baths)}" if min_baths != max_baths else str(int(min_baths))

            listing_data.append({
                "id": listing.id,
                "title": listing.title,
                "description": listing.description,
                "price": listing.price,
                "price_display": price_display,
                "state": listing.state,
                "city": listing.city,
                "area": listing.area,
                "bedrooms": listing.bedrooms,
                "bathrooms": listing.bathrooms,
                "bed_display": bed_display,
                "bath_display": bath_display,
                "listing_type": listing.listing_type,
                "image_paths": images,
                "video_path": listing.video_path,
                "tags": tags,
                "reels": reel_video_paths,
                "views": view_count,
                # Promotion fields
                "is_promoted": listing.is_promoted,
                "promoted_until": listing.promoted_until.isoformat() if listing.promoted_until else None,
                "paused_at": listing.paused_at.isoformat() if listing.paused_at else None,
                "remaining_days": listing.remaining_days
            })

        return jsonify({"listings": listing_data})

    @app.route('/toggle_save_listing/<int:listing_id>', methods=['POST'])
    def toggle_save_listing(listing_id):
        # Check if the user is logged in (via session)
        user_id = session.get('user_id', None)
        print(f"User ID: {user_id}")
        if not user_id:
            flash("You must be logged in to save listings!", "danger")
            return jsonify({"success": False, "message": "User not logged in"}), 401

        # Fetch the user and listing from the database
        user = User.query.get_or_404(user_id)
        listing = Listing.query.get_or_404(listing_id)
        title = listing.title
        state = listing.state
        city = listing.city
        area = listing.area

        # Check for an existing 'saved' interaction
        interaction = next(
            (i for i in user.interactions if i.listing_id == listing_id and i.interaction_type == "saved"),
            None
        )

        if interaction:
            # Unsave the listing
            db.session.delete(interaction)
            db.session.commit()
            return jsonify({"success": True, "action": "unsaved"})
        else:
            # Save the listing
            new_interaction = Interaction(
                user_id=user_id, 
                listing_id=listing_id, 
                interaction_type="saved",
                title=title,
                state=state,
                city=city,
                area=area,
                tags=request.json.get('tags', '')  # Save tags for personalization
            )
            db.session.add(new_interaction)
            db.session.commit()
            return jsonify({"success": True, "action": "saved"})

    @app.route('/api/interaction', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def save_interaction():
        data = request.json
        listing_id = data.get('listing_id')
        interaction_type = data.get('interaction_type')
        user_id = data.get('user_id')

        # Optional listing info (for enriched interaction logging)
        title = data.get('title')
        city = data.get('city')
        state = data.get('state')
        area = data.get('area')

        if not listing_id or not interaction_type or not user_id:
            return jsonify({"error": "Missing required fields"}), 400

        if interaction_type == 'unsave':
            # 🔴 Remove 'saved' interaction
            Interaction.query.filter_by(
                user_id=user_id,
                listing_id=listing_id,
                interaction_type='saved'
            ).delete()
            db.session.commit()
            
            # Invalidate relevant caches
            invalidate_user_cache(user_id)
            invalidate_listing_cache(listing_id)
            
            return jsonify({"message": "Unsave successful"}), 200

        # 🔁 Prevent duplicates (e.g. multiple "view" logs in a row is fine, but multiple "saved" is not)
        if interaction_type == 'saved':
            existing = Interaction.query.filter_by(
                user_id=user_id,
                listing_id=listing_id,
                interaction_type='saved'
            ).first()
            if existing:
                return jsonify({"message": "Already saved"}), 200

        # ✅ Save new interaction
        interaction = Interaction(
            listing_id=listing_id,
            interaction_type=interaction_type,
            user_id=user_id,
            title=title,
            city=city,
            state=state,
            area=area,
            tags=data.get('tags', '')  # Save tags for personalization
        )

        db.session.add(interaction)
        db.session.commit()

        # Invalidate relevant caches
        invalidate_user_cache(user_id)
        invalidate_listing_cache(listing_id)

        return jsonify({"message": f"{interaction_type.capitalize()} interaction saved"}), 201

    
    @app.route('/reset_chat', methods=['POST'])
    def reset_chat():
        user_id = request.json.get('user_id')
        if not user_id:
            return jsonify({"error": "User ID required"}), 400

        reset_history(user_id)
        return jsonify({"message": "Chat history reset"}), 200


    @app.route('/api/listing/<int:listing_id>')
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @cache_response(expiry=300, key_prefix="listing_details")  # Cache for 5 minutes
    def get_listing_by_id(listing_id):
        listing = Listing.query.get_or_404(listing_id)
        
        # Get user_id from query parameter to check if listing is saved
        user_id = request.args.get('user_id', type=int)
        is_favorite = False
        if user_id:
            saved_interaction = Interaction.query.filter_by(
                user_id=user_id, 
                listing_id=listing_id, 
                interaction_type="saved"
            ).first()
            is_favorite = saved_interaction is not None

        try:
            images = json.loads(listing.image_paths) if listing.image_paths else []
        except json.JSONDecodeError:
            images = []

        images = [to_supabase_url(img, 'listings') for img in images if img]
        video_path = to_supabase_url(listing.video_path, 'listing-videos') if listing.video_path else None

        try:
            tags = [tag.strip() for tag in listing.tags.split(',')] if listing.tags else []
        except Exception:
            tags = []

        # === RECOMMENDATIONS ===
        recommendations_query = Listing.query.filter(
            Listing.id != listing.id,
            Listing.city == listing.city
        ).order_by(Listing.id.desc()).limit(4)

        recommendations = []
        for rec in recommendations_query:
            try:
                rec_images = json.loads(rec.image_paths) if rec.image_paths else []
            except json.JSONDecodeError:
                rec_images = []
            rec_images = [to_supabase_url(img, 'listings') for img in rec_images if img]
            # Get units data for complex listings
            units_data = []
            if rec.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=rec.id).all()
                units_data = [
                    {
                        "id": unit.id,
                        "name": unit.name,
                        "bedrooms": unit.bedrooms,
                        "bathrooms": unit.bathrooms,
                        "sqft": unit.sqft,
                        "price_min": unit.price_min,
                        "price_max": unit.price_max,
                        "is_available": unit.is_available
                    }
                    for unit in units
                ]
            recommendations.append({
                "id": rec.id,
                "title": rec.title,
                "price": rec.price,
                "city": rec.city,
                "state": rec.state,
                "area": rec.area,
                "bedrooms": rec.bedrooms,
                "bathrooms": rec.bathrooms,
                "image_paths": rec_images,
                "listing_type": rec.listing_type,
                "rent_period": rec.rent_period,
                "units": units_data
            })

        # === Agent Info ===
        agent_info = None
        if listing.agent_id:
            agent = Agent.query.get(listing.agent_id)
            if agent:
                agent_info = {
                    "id": agent.id,
                    "name": agent.name,
                    "email": agent.email,
                    "phone": getattr(agent, "phone", None),
                    "agent_type": getattr(agent, "agent_type", None)
                }

        # === Units Data for Complex Listings ===
        units_data = []
        if listing.listing_type == 'complex':
            units = Unit.query.filter_by(listing_id=listing.id).all()
            units_data = [
                {
                    "id": unit.id,
                    "name": unit.name,
                    "bedrooms": unit.bedrooms,
                    "bathrooms": unit.bathrooms,
                    "sqft": unit.sqft,
                    "price_min": unit.price_min,
                    "price_max": unit.price_max,
                    "is_available": unit.is_available
                }
                for unit in units
            ]

        return jsonify({
            "id": listing.id,
            "title": listing.title,
            "price": listing.price,
            "city": listing.city,
            "state": listing.state,
            "area": listing.area,
            "address": listing.address,
            "bedrooms": listing.bedrooms,
            "bathrooms": listing.bathrooms,
            "description": listing.description,
            "agent_id": listing.agent_id,
            "image_paths": images,
            "video_path": video_path,
            "tags": tags,
            "recommendations": recommendations,
            "listing_type": listing.listing_type,
            "rent_period": listing.rent_period,
            "units": units_data,
            "created_at": listing.created_at.isoformat() if listing.created_at else None,
            "updated_at": listing.updated_at.isoformat() if listing.updated_at else None,
            "availability_date": listing.availability_date.isoformat() if listing.availability_date else None,
            # ✅ New Optional Fields
            "amenities": listing.amenities,
            "interior_features": listing.interior_features,
            "exterior_features": listing.exterior_features,
            "leasing_terms": listing.leasing_terms,
            "policy": listing.policy,
            # ✅ Agent Full Details
            "agent": agent_info,
            # ✅ Favorite Status
            "is_favorite": is_favorite
        })
        
     
    @app.route('/user_profile')
    def user_profile():
        user_id = session.get('user_id')
        
        if not user_id:
            flash("You must be logged in to access the user profile!", "danger")
            return redirect(url_for('login'))

        user = User.query.get_or_404(user_id)
        saved_listings = user.saved_listings

        interactions = Interaction.query.filter_by(user_id=user_id).all()
        recommender = Recommender(user_id=user_id, data=filepath)

        if not interactions:
            recommendations = recommender.rank_based()
        else:
            recommendations = recommender.user_rec()

        return render_template(
            'user_profile.html',
            user=user,
            saved_listings=saved_listings,
            recommendations=recommendations
        )
    
    @app.route('/api/user/<int:user_id>/dashboard')
    @cache_response(expiry=120, key_prefix="user_dashboard")  # Cache for 2 minutes
    def user_dashboard(user_id):
        user = User.query.get_or_404(user_id)

        # Saved listings
        saved_interactions = Interaction.query.filter_by(user_id=user_id, interaction_type="saved").all()
        saved_listing_ids = [i.listing_id for i in saved_interactions]
        saved_listings = Listing.query.filter(Listing.id.in_(saved_listing_ids)).all()

        # Format saved
        formatted_saved = []
        for prop in saved_listings:
            try:
                images = json.loads(prop.image_paths) if prop.image_paths else []
            except json.JSONDecodeError:
                images = []

            # Get units data for complex listings
            units_data = []
            if prop.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=prop.id).all()
                units_data = [
                    {
                        "id": unit.id,
                        "name": unit.name,
                        "bedrooms": unit.bedrooms,
                        "bathrooms": unit.bathrooms,
                        "sqft": unit.sqft,
                        "price_min": unit.price_min,
                        "price_max": unit.price_max,
                        "is_available": unit.is_available
                    }
                    for unit in units
                ]

            formatted_saved.append({
                "id": prop.id,
                "title": prop.title,
                "price": prop.price,
                "city": prop.city,
                "state": prop.state,
                "area": prop.area,
                "bedrooms": prop.bedrooms,
                "bathrooms": prop.bathrooms,
                "image_paths": images,
                "listing_type": prop.listing_type,
                "rent_period": prop.rent_period,
                "units": units_data
            })

        # Recommended listings
        interactions = Interaction.query.filter_by(user_id=user_id).all()
        recommender = Recommender(user_id=user_id, data=filepath)

        if not interactions:
            recommended = recommender.rank_based()
        else:
            recommended = recommender.user_rec()

        formatted_recs = []
        for rec in recommended:
            try:
                images = json.loads(rec.image_paths) if rec.image_paths else []
            except json.JSONDecodeError:
                images = []

            # Get units data for complex listings
            units_data = []
            if rec.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=rec.id).all()
                units_data = [
                    {
                        "id": unit.id,
                        "name": unit.name,
                        "bedrooms": unit.bedrooms,
                        "bathrooms": unit.bathrooms,
                        "sqft": unit.sqft,
                        "price_min": unit.price_min,
                        "price_max": unit.price_max,
                        "is_available": unit.is_available
                    }
                    for unit in units
                ]

            formatted_recs.append({
                "id": rec.id,
                "title": rec.title,
                "price": rec.price,
                "city": rec.city,
                "state": rec.state,
                "area": rec.area,
                "bedrooms": rec.bedrooms,
                "bathrooms": rec.bathrooms,
                "image_paths": images,
                "listing_type": rec.listing_type,
                "rent_period": rec.rent_period,
                "units": units_data
            })

        return jsonify({
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email
            },
            "saved_properties": formatted_saved,
            "recommendations": formatted_recs
        })

    # Temporarily disabled to reduce memory usage
    # @app.route('/ask_ai', methods=['POST'])
    # def ask_ai():
    #     data = request.get_json()
    #     user_id = data.get("user_id")
    #     user_query = data.get("query")

    #     if not user_id:
    #         return jsonify({"error": "User ID is required"}), 401
    #     if not user_query:
    #         return jsonify({"error": "No query provided"}), 400

    #     try:
    #         # Lazy import to prevent memory issues on startup
    #         from langchain_chatbot import langchain_bot
    #         response = langchain_bot(user_query, user_id)
    #         return jsonify({"response": response.strip()})
    #     except Exception as e:
    #         # Log the full error for debugging
    #         print("Error in /ask_ai:", traceback.format_exc())
    #         # Return a generic error to the user
    #         return jsonify({"error": "Sorry, something went wrong. Please try again later."}), 500

    @app.route('/api/cache/stats', methods=['GET'])
    def cache_stats():
        """Get Redis cache statistics for monitoring"""
        return jsonify(get_cache_stats())

    @app.route('/api/cache/clear', methods=['POST'])
    def clear_cache():
        try:
            clear_all_cache()
            return jsonify({"message": "All cache cleared successfully"})
        except Exception as e:
            return jsonify({"error": f"Failed to clear cache: {str(e)}"}), 500

    @app.route('/api/cache/clear-agent/<int:agent_id>', methods=['POST'])
    def clear_agent_cache(agent_id):
        try:
            invalidate_all_agent_caches(agent_id)
            return jsonify({"message": f"Agent {agent_id} cache cleared successfully"})
        except Exception as e:
            return jsonify({"error": f"Failed to clear agent cache: {str(e)}"}), 500
    
    @app.route('/api/delete-reel', methods=['DELETE'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def delete_reel():
        data = request.get_json()
        reel_url = data.get('reel_url')
        listing_id = data.get('listing_id')

        if not reel_url or not listing_id:
            return jsonify({"error": "Missing reel_url or listing_id"}), 400

        # Delete from DB (file deletion is handled by frontend)
        try:
            reel = Reel.query.filter_by(video_path=reel_url, listing_id=listing_id).first()
            if reel:
                db.session.delete(reel)
                db.session.commit()
            return jsonify({"message": "Reel deleted successfully"}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": f"DB error: {str(e)}"}), 500

    
    @app.route('/api/test-session', methods=['GET'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def test_session():
        user_id = request.args.get('user_id', type=int)
        print(f"Test session - Request cookies: {dict(request.cookies)}")
        print(f"Test session - User ID from query param: {user_id}")
        return jsonify({
            "cookies": dict(request.cookies),
            "user_id_from_query": user_id,
            "message": "Now using query parameters instead of sessions (like ask_ai endpoint)"
        })

    @app.route('/api/set_session', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def set_session():
        data = request.get_json()
        user_id = data.get('user_id')
        role = data.get('role')  # "user" or "agent"

        if not user_id:
            return jsonify({"error": "user_id is required"}), 400

        session['user_id'] = user_id
        session['role'] = role
        session.modified = True
        return jsonify({"message": "Session set"}), 200

   
    # Helper function to validate file type 
    def allowed_file(filename, file_type='image'):

        """
        Validate file extensions for images and videos.
        
        Args:
            filename (str): The name of the file to validate.
            file_type (str): Either 'image' or 'video' to indicate the type of file.
        
        Returns:
            bool: True if the file extension is allowed, False otherwise.
        """
        if '.' not in filename:
            return False
        
        ext = filename.rsplit('.', 1)[1].lower()
        if file_type == 'image':
            return ext in ALLOWED_IMAGE_EXTENSIONS
        elif file_type == 'video':
            return ext in ALLOWED_VIDEO_EXTENSIONS
        return False

    # --- Community API ---
    def serialize_comment(comment, user_id=None):
        return {
            'id': comment.id,
            'author': comment.author_name,
            'content': comment.content,
            'timestamp': comment.timestamp.isoformat(),
            'likes': len(comment.likes),
            'liked': user_id in [like.user_id for like in comment.likes] if user_id else False,
            'replies': [serialize_comment(reply, user_id) for reply in comment.replies]
        }

    @app.route('/api/community', methods=['GET'])
    @cache_response(expiry=180, key_prefix="community_posts")  # Cache for 3 minutes
    def get_community_posts():
        user_id = request.args.get('user_id', type=int) # For checking 'liked' status
        posts = CommunityPost.query.order_by(CommunityPost.timestamp.desc()).all()
        return jsonify({
            'posts': [
                {
                    'id': post.id,
                    'author_id': post.author_id,
                    'author': post.author_name,
                    'content': post.content,
                    'timestamp': post.timestamp.isoformat(),
                    'category': json.loads(post.category) if post.category else [],
                    'comments': len(post.comments),
                    'likes': len(post.likes),
                    'liked': user_id in [like.user_id for like in post.likes] if user_id else False,
                    'replies': [
                        serialize_comment(c, user_id) for c in post.comments if c.parent_comment_id is None
                    ]
                }
                for post in posts
            ]
        })

    @app.route('/api/community/post', methods=['POST'])
    def create_community_post():
        data = request.json
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({'error': 'User ID not provided'}), 401

        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        content = data.get('content')
        category = data.get('category', [])

        post = CommunityPost(
            author_id=user_id,
            author_name=user.name,  
            content=content,
            category=json.dumps(category)
        )
        db.session.add(post)
        db.session.commit()

        # Invalidate community cache after creating new post
        invalidate_cache_by_prefix("community_posts")

        return jsonify({'success': True, 'id': post.id})

    @app.route('/api/community/comment', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def add_comment():
        data = request.json
        user_id = data.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Not logged in'}), 401

        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        post_id = data.get('post_id')
        content = data.get('content')
        parent_comment_id = data.get('parent_comment_id')  # optional for replies

        if not post_id or not content:
            return jsonify({'error': 'Missing required fields'}), 400

        comment = CommunityComment(
            post_id=post_id,
            user_id=user_id,
            author_name=user.name,
            content=content,
            parent_comment_id=parent_comment_id
        )

        db.session.add(comment)
        db.session.commit()

        # Invalidate community cache after adding comment
        invalidate_cache_by_prefix("community_posts")

        return jsonify({
            'success': True,
            'comment': {
                'id': comment.id,
                'author': comment.author_name,
                'content': comment.content,
                'timestamp': comment.timestamp.isoformat(),
                'likes': 0,
                'liked': False,
                'replies': []
            }
        })

    @app.route('/api/community/comment/like', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def like_community_comment():
        data = request.json
        user_id = data.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Not logged in'}), 401
        
        comment_id = data.get('comment_id')
        if not comment_id:
            return jsonify({'error': 'Comment ID is required'}), 400

        like = CommunityCommentLike.query.filter_by(user_id=user_id, comment_id=comment_id).first()

        if like:
            db.session.delete(like)
            db.session.commit()
            # Invalidate community cache after removing like
            invalidate_cache_by_prefix("community_posts")
            return jsonify({'success': True, 'liked': False})
        else:
            new_like = CommunityCommentLike(user_id=user_id, comment_id=comment_id)
            db.session.add(new_like)
            db.session.commit()
            # Invalidate community cache after adding like
            invalidate_cache_by_prefix("community_posts")
            return jsonify({'success': True, 'liked': True})

    @app.route('/api/community/like', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def like_community_post():
        data = request.json
        user_id = data.get('user_id') or session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Not logged in'}), 401
        post_id = data.get('post_id')
        like = CommunityLike.query.filter_by(user_id=user_id, post_id=post_id).first()
        if like:
            db.session.delete(like)
            db.session.commit()
            # Invalidate community cache after removing like
            invalidate_cache_by_prefix("community_posts")
            return jsonify({'success': True, 'liked': False})
        else:
            like = CommunityLike(user_id=user_id, post_id=post_id)
            db.session.add(like)
            db.session.commit()
            # Invalidate community cache after adding like
            invalidate_cache_by_prefix("community_posts")
            return jsonify({'success': True, 'liked': True})

    @app.route('/api/community/post/<int:post_id>', methods=['PUT'])
    @require_supabase_authenticated
    def update_community_post(post_id):
        data = request.json
        post = CommunityPost.query.get_or_404(post_id)
        
        # Get user from Supabase ID
        user = User.query.filter_by(supabase_id=g.supabase_id).first()
        if not user or post.author_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403
            
        post.content = data.get('content', post.content)
        post.category = json.dumps(data.get('category', json.loads(post.category)))
        db.session.commit()
        return jsonify({'success': True})

    @app.route('/api/community/post/<int:post_id>', methods=['DELETE'])
    @require_supabase_authenticated
    def delete_community_post(post_id):
        post = CommunityPost.query.get_or_404(post_id)
        
        # Get user from Supabase ID
        user = User.query.filter_by(supabase_id=g.supabase_id).first()
        if not user or post.author_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403
            
        db.session.delete(post)
        db.session.commit()
        return jsonify({'success': True})

    @app.route('/api/agents', methods=['GET'])
    @cache_response(expiry=600, key_prefix="all_agents")  # Cache for 10 minutes
    def get_all_agents():
        agents = Agent.query.all()
        agent_list = []
        for agent in agents:
            # Build full photo URL if needed
            photo_url = getattr(agent, 'photo_url', None)
            if photo_url and not (photo_url.startswith('http://') or photo_url.startswith('https://')):
                photo_url = f"/uploads/{photo_url}"
            agent_list.append({
                'id': agent.id,
                'name': agent.name,
                'email': agent.email,
                'phone': getattr(agent, 'phone', None),
                'address': getattr(agent, 'address', None),
                'agent_type': getattr(agent, 'agent_type', None),
                'photo_url': photo_url,
                'specialty': getattr(agent, 'specialty', None),
                'languages': getattr(agent, 'languages', None),
                # Add placeholders for frontend compatibility
                'badges': [],
                'rating': None,
                'reviews': None,
              
                'company': None
            })
        return jsonify(agent_list)

    @app.route('/api/agent/profile/update', methods=['GET', 'POST'])
    def agent_profile_update():
        if request.method == 'POST':
            # Accept JSON payload
            data = request.get_json()
            if not data:
                return jsonify({'message': 'Invalid JSON payload.'}), 400
            agent_id = data.get('agent_id')
            if not agent_id:
                return jsonify({'message': 'Agent ID is required.'}), 400

            agent = Agent.query.get(agent_id)
            if not agent:
                return jsonify({'message': 'Agent not found.'}), 404

            # Update text fields
            agent.name = data.get('name', agent.name)
            agent.phone = data.get('phone', agent.phone)
            agent.address = data.get('address', agent.address)

            # Handle languages (array or comma-separated string)
            languages = data.get('languages')
            if languages:
                if isinstance(languages, list):
                    agent.languages = ','.join(languages)
                else:
                    agent.languages = languages

            # Handle specialty
            agent.specialty = data.get('specialty', agent.specialty)

            # Handle photo_url (Supabase URL)
            photo_url = data.get('photo_url')
            if photo_url:
                agent.photo_url = photo_url

            db.session.commit()

            # Return the updated agent data
            return jsonify({
                'message': 'Profile updated successfully!',
                'agent': {
                    'id': agent.id,
                    'name': agent.name,
                    'email': agent.email,
                    'phone': agent.phone,
                    'address': agent.address,
                    'agent_type': agent.agent_type,
                    'photo_url': agent.photo_url,
                    'languages': agent.languages,
                    'specialty': agent.specialty
                }
            }), 200

        else:
            # --- GET AGENT ---
            agent_id = request.args.get('agent_id')
            if not agent_id:
                return jsonify({'message': 'Agent ID is required.'}), 400

            agent = Agent.query.get(agent_id)
            if not agent:
                return jsonify({'message': 'Agent not found.'}), 404
            
            return jsonify({
                'id': agent.id,
                'name': agent.name,
                'email': agent.email,
                'phone': agent.phone,
                'address': agent.address,
                'agent_type': agent.agent_type,
                'photo_url': agent.photo_url,
                'languages': agent.languages,
                'specialty': agent.specialty
            }), 200

    @app.route('/api/agent/profile', methods=['GET'])
    @require_supabase_authenticated
    def get_agent_profile():
        supabase_id = g.supabase_id
        agent = Agent.query.filter_by(supabase_id=supabase_id).first()
        if agent:
            agent_data = {
                'id': agent.id,
                'name': agent.name,
                'email': agent.email,
                'supabase_id': agent.supabase_id,
                'phone': agent.phone,
                'address': agent.address,
                'agent_type': agent.agent_type,
                'languages': agent.languages,
                'specialty': agent.specialty,
                'photo_url': agent.photo_url,
                'onboarding_complete': getattr(agent, 'onboarding_complete', True)
            }
            return jsonify(agent_data), 200
        else:
            return jsonify({'error': 'Agent not found'}), 404

    @app.route('/api/agent/<int:agent_id>/analytics')
    @cache_response(expiry=600, key_prefix="agent_analytics")  # Cache for 10 minutes
    def get_agent_analytics(agent_id):
        try:
            # Get filter parameters from request
            city_filter = request.args.get('city', '')
            area_filter = request.args.get('area', '')
            start_date_str = request.args.get('startDate')
            end_date_str = request.args.get('endDate')
            from datetime import datetime, timedelta
            import traceback
            if start_date_str and end_date_str:
                start_date = datetime.fromisoformat(start_date_str.rstrip('Z'))
                end_date = datetime.fromisoformat(end_date_str.rstrip('Z'))
            else:
                now = datetime.utcnow()
                start_date = now - timedelta(days=30)
                end_date = now
            print(f"[analytics] start_date: {start_date}, end_date: {end_date}")

            # Base query for listings by this agent
            base_listing_query = db.session.query(Listing.id).filter(Listing.agent_id == agent_id)
            if city_filter:
                base_listing_query = base_listing_query.filter(Listing.city == city_filter)
            if area_filter:
                base_listing_query = base_listing_query.filter(Listing.area == area_filter)
            filtered_listing_ids = [row[0] for row in base_listing_query.all()]
            print(f"[analytics] filtered_listing_ids: {filtered_listing_ids}")

            def interaction_date_filter(query):
                return query.filter(Interaction.created_at >= start_date, Interaction.created_at <= end_date)

            total_views = db.session.query(func.count(Interaction.id)).filter(
                Interaction.listing_id.in_(filtered_listing_ids),
                Interaction.interaction_type == 'view'
            )
            total_views = interaction_date_filter(total_views).scalar() or 0
            print(f"[analytics] total_views: {total_views}")

            total_saves = db.session.query(func.count(Interaction.id)).filter(
                Interaction.listing_id.in_(filtered_listing_ids),
                Interaction.interaction_type == 'saved'
            )
            total_saves = interaction_date_filter(total_saves).scalar() or 0
            print(f"[analytics] total_saves: {total_saves}")

            total_listings = db.session.query(func.count(Listing.id)).filter(
                Listing.agent_id == agent_id
            )
            if city_filter:
                total_listings = total_listings.filter(Listing.city == city_filter)
            if area_filter:
                total_listings = total_listings.filter(Listing.area == area_filter)
            total_listings = total_listings.scalar() or 0
            print(f"[analytics] total_listings: {total_listings}")

            most_viewed_query = db.session.query(
                Listing,
                func.count(Interaction.id).label('view_count')
            ).join(
                Interaction,
                Interaction.listing_id == Listing.id
            ).filter(
                Listing.agent_id == agent_id,
                Interaction.interaction_type == 'view',
                Interaction.listing_id.in_(filtered_listing_ids)
            )
            most_viewed_query = interaction_date_filter(most_viewed_query)
            if city_filter:
                most_viewed_query = most_viewed_query.filter(Listing.city == city_filter)
            if area_filter:
                most_viewed_query = most_viewed_query.filter(Listing.area == area_filter)
            most_viewed = most_viewed_query.group_by(
                Listing.id
            ).order_by(
                func.count(Interaction.id).desc()
            ).first()
            print(f"[analytics] most_viewed: {most_viewed}")

            listings_query = db.session.query(
                Listing,
                func.count(case((Interaction.interaction_type == 'view', 1))).label('views'),
                func.count(case((Interaction.interaction_type == 'saved', 1))).label('saves')
            ).outerjoin(
                Interaction,
                Interaction.listing_id == Listing.id
            ).filter(
                Listing.agent_id == agent_id
            )
            if city_filter:
                listings_query = listings_query.filter(Listing.city == city_filter)
            if area_filter:
                listings_query = listings_query.filter(Listing.area == area_filter)
            # Only count interactions in date range
            listings_query = listings_query.filter(
                db.or_(Interaction.id == None, db.and_(Interaction.created_at >= start_date, Interaction.created_at <= end_date))
            )
            listings_data = listings_query.group_by(
                Listing.id
            ).all()
            print(f"[analytics] listings_data: {listings_data}")

            listings = [{
                'id': listing.id,
                'title': listing.title,
                'views': views or 0,
                'saves': saves or 0
            } for listing, views, saves in listings_data]

            city_breakdown_query = db.session.query(
                Listing.city,
                func.count(Interaction.id).label('total_interactions')
            ).join(
                Interaction,
                Interaction.listing_id == Listing.id
            ).filter(
                Listing.agent_id == agent_id,
                Interaction.listing_id.in_(filtered_listing_ids),
                Interaction.created_at >= start_date,
                Interaction.created_at <= end_date
            )
            if city_filter:
                city_breakdown_query = city_breakdown_query.filter(Listing.city == city_filter)
            if area_filter:
                city_breakdown_query = city_breakdown_query.filter(Listing.area == area_filter)
            city_breakdown = city_breakdown_query.group_by(
                Listing.city
            ).all()
            print(f"[analytics] city_breakdown: {city_breakdown}")

            area_breakdown_query = db.session.query(
                Listing.area,
                func.count(Interaction.id).label('total_interactions')
            ).join(
                Interaction,
                Interaction.listing_id == Listing.id
            ).filter(
                Listing.agent_id == agent_id,
                Interaction.listing_id.in_(filtered_listing_ids),
                Interaction.created_at >= start_date,
                Interaction.created_at <= end_date
            )
            if city_filter:
                area_breakdown_query = area_breakdown_query.filter(Listing.city == city_filter)
            if area_filter:
                area_breakdown_query = area_breakdown_query.filter(Listing.area == area_filter)
            area_breakdown = area_breakdown_query.group_by(
                Listing.area
            ).all()
            print(f"[analytics] area_breakdown: {area_breakdown}")

            max_area_interactions = max([area[1] for area in area_breakdown]) if area_breakdown else 1
            print(f"[analytics] max_area_interactions: {max_area_interactions}")

            return jsonify({
                'total_views': total_views,
                'total_saves': total_saves,
                'total_listings': total_listings,
                'most_viewed_listing': {
                    'id': most_viewed[0].id,
                    'title': most_viewed[0].title,
                    'views': most_viewed[1]
                } if most_viewed else None,
                'listings': listings,
                'city_breakdown': [{
                    'city': city,
                    'total_interactions': count
                } for city, count in city_breakdown],
                'area_breakdown': [{
                    'area': area,
                    'total_interactions': count
                } for area, count in area_breakdown],
                'max_area_interactions': max_area_interactions
            })
        except Exception as e:
            import traceback
            print(f"Error fetching analytics: {str(e)}")
            print(traceback.format_exc())
            return jsonify({'error': 'Failed to fetch analytics'}), 500

    @app.route('/api/agent/<int:agent_id>/trends')
    def get_agent_trends(agent_id):
        try:
            # Get filter parameters from request
            city_filter = request.args.get('city', '')
            area_filter = request.args.get('area', '')
            start_date_str = request.args.get('startDate')
            end_date_str = request.args.get('endDate')
            from datetime import datetime, timedelta
            if start_date_str and end_date_str:
                start_date = datetime.fromisoformat(start_date_str.rstrip('Z'))
                end_date = datetime.fromisoformat(end_date_str.rstrip('Z'))
            else:
                now = datetime.utcnow()
                start_date = now - timedelta(days=30)
                end_date = now

            # Base query for listings by this agent
            base_listing_query = db.session.query(Listing.id).filter(Listing.agent_id == agent_id)
            if city_filter:
                base_listing_query = base_listing_query.filter(Listing.city == city_filter)
            if area_filter:
                base_listing_query = base_listing_query.filter(Listing.area == area_filter)
            filtered_listing_ids = [row[0] for row in base_listing_query.all()]

            # Get all relevant interactions for these listings in the date range
            interactions = db.session.query(Interaction).filter(
                Interaction.listing_id.in_(filtered_listing_ids),
                Interaction.created_at >= start_date,
                Interaction.created_at <= end_date
            ).all()

            # Tag trends
            tag_trends = {}
            for inter in interactions:
                listing = Listing.query.get(inter.listing_id)
                if not listing or not listing.tags:
                    continue
                for tag in listing.tags.split(','):
                    tag = tag.strip()
                    if tag:
                        tag_trends[tag] = tag_trends.get(tag, 0) + 1
            sorted_tag_trends = dict(sorted(tag_trends.items(), key=lambda x: x[1], reverse=True)[:10])

            # Area demand
            area_demand = {}
            for inter in interactions:
                listing = Listing.query.get(inter.listing_id)
                if not listing or not listing.area:
                    continue
                area = listing.area
                area_demand[area] = area_demand.get(area, 0) + 1

            # Bedroom demand
            bedroom_demand = {}
            for inter in interactions:
                listing = Listing.query.get(inter.listing_id)
                if not listing or not listing.bedrooms:
                    continue
                bedrooms = str(listing.bedrooms)
                bedroom_demand[bedrooms] = bedroom_demand.get(bedrooms, 0) + 1

            return jsonify({
                'tag_trends': sorted_tag_trends,
                'area_demand': area_demand,
                'bedroom_demand': bedroom_demand
            })
        except Exception as e:
            print(f"Error fetching trends: {str(e)}")
            return jsonify({'error': 'Failed to fetch trends data'}), 500

    @app.route('/uploads/<path:filename>')
    def uploaded_file(filename):
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    @app.route('/api/agent/<int:agent_id>/locations')
    def get_agent_locations(agent_id):
        try:
            # Get all cities for this agent
            cities = db.session.query(Listing.city).filter(
                Listing.agent_id == agent_id,
                Listing.city.isnot(None)
            ).distinct().all()
            
            # Get all areas for this agent
            areas = db.session.query(Listing.area).filter(
                Listing.agent_id == agent_id,
                Listing.area.isnot(None)
            ).distinct().all()
            
            return jsonify({
                'cities': [city[0] for city in cities if city[0]],
                'areas': [area[0] for area in areas if area[0]]
            })
            
        except Exception as e:
            print(f"Error fetching locations: {str(e)}")
            return jsonify({'error': 'Failed to fetch locations'}), 500

    # Property Application and Viewing Booking endpoints
    @app.route('/api/property-applications', methods=['POST'])
    @cross_origin()
    def submit_property_application():
        """Submit a property application"""
        try:
            data = request.get_json()
            
            # Validate required fields
            required_fields = [
                'user_id', 'listing_id', 'applicant_name', 'applicant_email', 
                'applicant_phone', 'monthly_income', 'employment_status', 
                'move_in_date', 'lease_duration'
            ]
            
            for field in required_fields:
                if field not in data or not data[field]:
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            
            # Validate listing exists
            listing = Listing.query.get(data['listing_id'])
            if not listing:
                return jsonify({'error': 'Property listing not found'}), 404
            
            # Create application with proper type conversion
            try:
                # Handle monthly income conversion
                monthly_income = data['monthly_income']
                if isinstance(monthly_income, str):
                    # Enhanced currency parsing for Nigerian Naira and other formats
                    clean_value = monthly_income.lower()
                    # Remove common currency words and symbols
                    clean_value = clean_value.replace('naira', '').replace('₦', '').replace('n', '').replace('ngn', '')
                    # Remove commas and other non-numeric characters except dots
                    clean_value = re.sub(r'[^\d.]', '', clean_value)
                    if not clean_value:
                        return jsonify({'error': 'Invalid monthly income format. Please enter a valid number.'}), 400
                    monthly_income = float(clean_value)
                else:
                    monthly_income = float(monthly_income)
                
                # Validate monthly income is positive
                if monthly_income <= 0:
                    return jsonify({'error': 'Monthly income must be greater than 0.'}), 400
                
                # Handle lease duration conversion
                lease_duration = data['lease_duration']
                if isinstance(lease_duration, str):
                    # Extract number from lease duration (e.g., "12 months" -> 12)
                    duration_match = re.search(r'(\d+)', lease_duration)
                    if duration_match:
                        lease_duration = int(duration_match.group(1))
                    else:
                        try:
                            lease_duration = int(lease_duration)
                        except ValueError:
                            return jsonify({'error': 'Invalid lease duration format. Please enter a valid number of months.'}), 400
                else:
                    lease_duration = int(lease_duration)
                
                # Validate lease duration is reasonable
                if lease_duration < 1 or lease_duration > 60:
                    return jsonify({'error': 'Lease duration must be between 1 and 60 months.'}), 400
                
                application = PropertyApplication(
                    user_id=data['user_id'],
                    listing_id=data['listing_id'],
                    applicant_name=data['applicant_name'],
                    applicant_email=data['applicant_email'],
                    applicant_phone=data['applicant_phone'],
                    monthly_income=monthly_income,
                    employment_status=data['employment_status'],
                    move_in_date=data['move_in_date'],
                    lease_duration=lease_duration,
                    additional_notes=data.get('additional_notes', ''),
                    created_at=datetime.now().isoformat()
                )
            except (ValueError, TypeError) as e:
                return jsonify({'error': f'Invalid data format: {str(e)}. Please check your input.'}), 400
            
            db.session.add(application)
            db.session.commit()
            
            # Get agent information
            agent = Agent.query.get(listing.agent_id)
            
            # --- Price range logic for complex listings ---
            if listing.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=listing.id).all()
                prices = [unit.price_min for unit in units if isinstance(unit.price_min, (int, float)) and unit.price_min > 0]
                prices += [unit.price_max for unit in units if isinstance(unit.price_max, (int, float)) and unit.price_max > 0]
                if prices:
                    min_price = min(prices)
                    max_price = max(prices)
                    if min_price == max_price:
                        price_display = f"{int(min_price)}"
                    else:
                        price_display = f"{int(min_price)}-{int(max_price)}"
                else:
                    price_display = 'Price on request'
            else:
                price_display = str(int(listing.price)) if listing.price else 'Price on request'
            
            # Send email notification to agent (property application)
            if agent and agent.email:
                try:
                    listing_data = {
                        'title': listing.title,
                        'area': listing.area,
                        'city': listing.city,
                        'state': listing.state,
                        'price': price_display
                    }
                    # Replace with your actual property application email function
                    email_service.send_application_notification(
                        agent_email=agent.email,
                        agent_name=agent.name,
                        application_data=data,
                        listing_data=listing_data
                    )
                except Exception as e:
                    # Log email error but don't fail the request
                    print(f"Failed to send property application email notification: {str(e)}")
            
            return jsonify({
                'success': True,
                'application_id': application.id,
                'message': 'Application submitted successfully! The agent will contact you soon.',
                'property_title': listing.title,
                'agent_name': agent.name if agent else 'Not specified',
                'agent_email': agent.email if agent else 'Not specified',
                'agent_phone': agent.phone if agent else 'Not specified'
            }), 201
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'Failed to submit application: {str(e)}'}), 500

    @app.route('/api/viewing-bookings', methods=['POST'])
    @cross_origin()
    def book_property_viewing():
        """Book a property viewing"""
        try:
            data = request.get_json()
            
            # Validate required fields
            required_fields = [
                'user_id', 'listing_id', 'viewer_name', 'viewer_email', 
                'viewer_phone', 'preferred_date', 'preferred_time'
            ]
            
            for field in required_fields:
                if field not in data or not data[field]:
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            
            # Validate listing exists
            listing = Listing.query.get(data['listing_id'])
            if not listing:
                return jsonify({'error': 'Property listing not found'}), 404
            
            # Check for scheduling conflicts
            existing_booking = ViewingBooking.query.filter_by(
                listing_id=data['listing_id'],
                preferred_date=data['preferred_date'],
                preferred_time=data['preferred_time'],
                status='pending'
            ).first()
            
            if existing_booking:
                return jsonify({
                    'error': f'Time slot {data["preferred_time"]} on {data["preferred_date"]} is already booked. Please choose another time.'
                }), 409
            
            # Create booking
            booking = ViewingBooking(
                user_id=data['user_id'],
                listing_id=data['listing_id'],
                viewer_name=data['viewer_name'],
                viewer_email=data['viewer_email'],
                viewer_phone=data['viewer_phone'],
                preferred_date=data['preferred_date'],
                preferred_time=data['preferred_time'],
                alternative_date=data.get('alternative_date', ''),
                alternative_time=data.get('alternative_time', ''),
                special_requirements=data.get('special_requirements', ''),
                created_at=datetime.now().isoformat()
            )
            
            db.session.add(booking)
            db.session.commit()
            
            # Get agent information
            agent = Agent.query.get(listing.agent_id)
            
            # --- Price range logic for complex listings ---
            if listing.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=listing.id).all()
                prices = [unit.price_min for unit in units if isinstance(unit.price_min, (int, float)) and unit.price_min > 0]
                prices += [unit.price_max for unit in units if isinstance(unit.price_max, (int, float)) and unit.price_max > 0]
                if prices:
                    min_price = min(prices)
                    max_price = max(prices)
                    if min_price == max_price:
                        price_display = f"{int(min_price)}"
                    else:
                        price_display = f"{int(min_price)}-{int(max_price)}"
                else:
                    price_display = 'Price on request'
            else:
                price_display = str(int(listing.price)) if listing.price else 'Price on request'
            
            # Send email notification to agent
            if agent and agent.email:
                try:
                    listing_data = {
                        'title': listing.title,
                        'area': listing.area,
                        'city': listing.city,
                        'state': listing.state,
                        'price': price_display
                    }
                    email_service.send_viewing_booking_notification(
                        agent_email=agent.email,
                        agent_name=agent.name,
                        booking_data=data,
                        listing_data=listing_data
                    )
                except Exception as e:
                    # Log email error but don't fail the request
                    print(f"Failed to send email notification: {str(e)}")
            
            return jsonify({
                'success': True,
                'booking_id': booking.id,
                'message': 'Inspection booked successfully! The agent will confirm your appointment soon.',
                'property_title': listing.title,
                'agent_name': agent.name if agent else 'Not specified',
                'agent_email': agent.email if agent else 'Not specified',
                'agent_phone': agent.phone if agent else 'Not specified',
                'viewing_date': data['preferred_date'],
                'viewing_time': data['preferred_time']
            }), 201
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'Failed to book viewing: {str(e)}'}), 500

    @app.route('/api/property-applications/<user_id>', methods=['GET'])
    @cross_origin()
    def get_user_applications(user_id):
        """Get all property applications for a user"""
        try:
            applications = PropertyApplication.query.filter_by(user_id=user_id).order_by(PropertyApplication.created_at.desc()).all()
            
            app_list = []
            for app in applications:
                listing = Listing.query.get(app.listing_id)
                app_list.append({
                    'application_id': app.id,
                    'listing_id': app.listing_id,
                    'property_title': listing.title if listing else 'Unknown Property',
                    'status': app.status,
                    'created_at': app.created_at,
                    'applicant_name': app.applicant_name,
                    'monthly_income': app.monthly_income,
                    'employment_status': app.employment_status
                })
            
            return jsonify({
                'success': True,
                'applications': app_list,
                'count': len(app_list)
            }), 200
            
        except Exception as e:
            return jsonify({'error': f'Failed to get applications: {str(e)}'}), 500

    

    @app.route('/api/personalized-reels')
    @cache_response(expiry=300, key_prefix="personalized_reels")  # Cache for 5 minutes
    def personalized_reels():
        user_id = request.args.get('user_id', type=int)
        if not user_id:
            return jsonify({'reels': []})

        # Get recent interactions
        recent_interactions = (
            Interaction.query
            .filter_by(user_id=user_id)
            .order_by(Interaction.created_at.desc())
            .limit(20)
            .all()
        )
        listing_ids = [i.listing_id for i in recent_interactions]

        # Get tags and locations from those listings
        listings = Listing.query.filter(Listing.id.in_(listing_ids)).all()
        tag_counter = Counter()
        city_counter = Counter()
        state_counter = Counter()
        area_counter = Counter()
        for l in listings:
            if l.tags:
                tag_counter.update([t.strip() for t in l.tags.split(',') if t.strip()])
            if l.city: city_counter[l.city] += 1
            if l.state: state_counter[l.state] += 1
            if l.area: area_counter[l.area] += 1

        # Get top tags/locations
        top_tags = [t for t, _ in tag_counter.most_common(5)]
        top_cities = [c for c, _ in city_counter.most_common(2)]
        top_states = [s for s, _ in state_counter.most_common(2)]
        top_areas = [a for a, _ in area_counter.most_common(2)]

        # Find listings with reels that match these tags/locations
        query = Listing.query
        filters = []
        if top_tags:
            filters.append(db.or_(*[Listing.tags.ilike(f'%{tag}%') for tag in top_tags]))
        if top_cities:
            filters.append(Listing.city.in_(top_cities))
        if top_states:
            filters.append(Listing.state.in_(top_states))
        if top_areas:
            filters.append(Listing.area.in_(top_areas))
        if filters:
            query = query.filter(db.or_(*filters))
        # Only listings with reels
        query = query.filter(Listing.reels.any())

        # Get up to 20 reels
        listings_with_reels = query.order_by(Listing.id.desc()).limit(20).all()
        reels = []
        for l in listings_with_reels:
            # Get units data for complex listings
            units_data = []
            min_bedrooms = None
            max_bedrooms = None
            if l.listing_type == 'complex':
                units = Unit.query.filter_by(listing_id=l.id).all()
                units_data = [
                    {
                        "id": unit.id,
                        "name": unit.name,
                        "bedrooms": unit.bedrooms,
                        "bathrooms": unit.bathrooms,
                        "sqft": unit.sqft,
                        "price_min": unit.price_min,
                        "price_max": unit.price_max,
                        "is_available": unit.is_available
                    }
                    for unit in units
                ]
                if units_data:
                    min_bedrooms = min(u["bedrooms"] for u in units_data)
                    max_bedrooms = max(u["bedrooms"] for u in units_data)
            for reel in l.reels:
                reels.append({
                    'listing_id': l.id,
                    'video_url': reel.video_path,  # Now using Supabase Storage URL directly
                    'title': l.title,
                    'location': f'{l.area}, {l.city}, {l.state}',
                    'tags': [t.strip() for t in l.tags.split(',')] if l.tags else [],
                    'bedrooms': l.bedrooms,
                    'listing_type': l.listing_type,
                    'units': units_data,
                    'bedroom_range': f"{min_bedrooms}-{max_bedrooms}" if min_bedrooms is not None and max_bedrooms is not None and min_bedrooms != max_bedrooms else (str(min_bedrooms) if min_bedrooms is not None else None)
                })
        return jsonify({'reels': reels})

    @app.route('/api/market/analytics')
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @cache_response(expiry=600, key_prefix="market_analytics")  # Cache for 10 minutes
    def market_analytics():
        try:
            start_date_str = request.args.get('startDate')
            end_date_str = request.args.get('endDate')
            if start_date_str and end_date_str:
                # Remove trailing 'Z' if present (JS ISO format)
                start_date = datetime.fromisoformat(start_date_str.rstrip('Z'))
                end_date = datetime.fromisoformat(end_date_str.rstrip('Z'))
            else:
                now = datetime.utcnow()
                start_date = now - timedelta(days=30)
                end_date = now
            print(f"[market_analytics] start_date: {start_date}, end_date: {end_date}")
            interactions = db.session.query(Interaction).filter(Interaction.created_at >= start_date, Interaction.created_at <= end_date).all()
            print(f"[market_analytics] interactions found: {len(interactions)}")
            # City/Area demand
            city_area_counter = {}
            for inter in interactions:
                listing = Listing.query.get(inter.listing_id)
                if not listing:
                    continue
                city = listing.city or 'Unknown'
                area = listing.area or 'Unknown'
                if city not in city_area_counter:
                    city_area_counter[city] = {'demand': 0, 'areas': {}}
                city_area_counter[city]['demand'] += 1
                if area not in city_area_counter[city]['areas']:
                    city_area_counter[city]['areas'][area] = 0
                city_area_counter[city]['areas'][area] += 1

            # Top 10 cities, each with top 10 areas
            top_cities = sorted(city_area_counter.items(), key=lambda x: x[1]['demand'], reverse=True)[:10]
            cities_result = []
            for city, data in top_cities:
                areas_sorted = sorted(data['areas'].items(), key=lambda x: x[1], reverse=True)[:10]
                areas_result = [{'name': area, 'demand': demand} for area, demand in areas_sorted]
                cities_result.append({'name': city, 'demand': data['demand'], 'areas': areas_result})

            # Bedroom demand
            bedroom_counter = {}
            for inter in interactions:
                listing = Listing.query.get(inter.listing_id)
                if not listing:
                    continue
                bedrooms = str(listing.bedrooms) if listing.bedrooms else 'Unknown'
                if bedrooms not in bedroom_counter:
                    bedroom_counter[bedrooms] = 0
                bedroom_counter[bedrooms] += 1
            top_bedrooms = sorted(bedroom_counter.items(), key=lambda x: x[1], reverse=True)[:10]
            bedrooms_result = [{'name': name, 'demand': demand} for name, demand in top_bedrooms]

            return jsonify({
                'cities': cities_result,
                'bedrooms': bedrooms_result
            })
        except Exception as e:
            print(f"Error in market_analytics: {str(e)}")
            return jsonify({'error': 'Failed to fetch market analytics'}), 500

    @app.route('/api/listing/<int:listing_id>/promote', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def promote_listing(listing_id):
        try:
            listing = Listing.query.get_or_404(listing_id)
            # Handle empty request body gracefully
            data = {}
            if request.content_length and request.content_length > 0:
                try:
                    data = request.get_json() or {}
                except Exception:
                    data = {}
            # Allow custom promoted_until date, else default to 7 days
            promoted_until = data.get('promoted_until') if data else None
            if promoted_until:
                from dateutil.parser import parse as parse_date
                listing.promoted_until = parse_date(promoted_until)
            else:
                listing.promoted_until = datetime.utcnow() + timedelta(days=7)
            listing.is_promoted = True
            db.session.commit()
            invalidate_listing_cache()
            invalidate_all_agent_caches(listing.agent_id)
            invalidate_cache_pattern("*listing_details*")
            invalidate_cache_pattern("*agent_listings*")
            return jsonify({"success": True, "message": "Listing promoted.", "promoted_until": listing.promoted_until.isoformat()})
        except Exception as e:
            print("Promote Listing Error:", traceback.format_exc())
            return jsonify({"error": "Failed to promote listing."}), 500

    @app.route('/api/listing/<int:listing_id>/pause-promotion', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def pause_promotion(listing_id):
        try:
            listing = Listing.query.get_or_404(listing_id)
            now = datetime.utcnow()
            
            # Only pause if currently promoted and promotion hasn't expired
            if listing.is_promoted and listing.promoted_until and listing.promoted_until > now:
                # Calculate remaining days when pausing
                remaining_seconds = (listing.promoted_until - now).total_seconds()
                remaining_days = remaining_seconds / (24 * 3600)  # Convert to days
                
                # Store pause information
                listing.paused_at = now
                listing.remaining_days = remaining_days
                listing.is_promoted = False
                
                db.session.commit()
                invalidate_listing_cache()
                invalidate_all_agent_caches(listing.agent_id)
                invalidate_cache_pattern("*listing_details*")
                invalidate_cache_pattern("*agent_listings*")
                # Add specific agent listings cache invalidation
                invalidate_cache_pattern(f"*agent_listings:{listing.agent_id}*")
                
                return jsonify({
                    "success": True, 
                    "message": f"Promotion paused. {remaining_days:.1f} days remaining.",
                    "remaining_days": remaining_days
                })
            else:
                return jsonify({"error": "No active promotion to pause."}), 400
        except Exception as e:
            print("Pause Promotion Error:", traceback.format_exc())
            return jsonify({"error": "Failed to pause promotion."}), 500

    @app.route('/api/listing/<int:listing_id>/resume-promotion', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def resume_promotion(listing_id):
        try:
            listing = Listing.query.get_or_404(listing_id)
            now = datetime.utcnow()
            
            # Check if there are remaining days from a previous pause
            if listing.remaining_days and listing.remaining_days > 0:
                # Resume with remaining days
                new_end_date = now + timedelta(days=listing.remaining_days)
                listing.promoted_until = new_end_date
                listing.is_promoted = True
                listing.paused_at = None  # Clear pause data
                listing.remaining_days = None  # Clear remaining days
                
                db.session.commit()
                invalidate_listing_cache()
                invalidate_all_agent_caches(listing.agent_id)
                invalidate_cache_pattern("*listing_details*")
                invalidate_cache_pattern("*agent_listings*")
                # Add specific agent listings cache invalidation
                invalidate_cache_pattern(f"*agent_listings:{listing.agent_id}*")
                
                return jsonify({
                    "success": True, 
                    "message": f"Promotion resumed for {listing.remaining_days:.1f} days.",
                    "promoted_until": listing.promoted_until.isoformat()
                })
            # Fallback: check if original promotion period is still valid
            elif listing.promoted_until and listing.promoted_until > now:
                listing.is_promoted = True
                db.session.commit()
                invalidate_listing_cache()
                invalidate_all_agent_caches(listing.agent_id)
                invalidate_cache_pattern("*listing_details*")
                invalidate_cache_pattern("*agent_listings*")
                # Add specific agent listings cache invalidation
                invalidate_cache_pattern(f"*agent_listings:{listing.agent_id}*")
                return jsonify({
                    "success": True, 
                    "message": "Promotion resumed.",
                    "promoted_until": listing.promoted_until.isoformat()
                })
            else:
                return jsonify({"error": "No remaining promotion time. Please set a new promotion period."}), 400
        except Exception as e:
            print("Resume Promotion Error:", traceback.format_exc())
            return jsonify({"error": "Failed to resume promotion."}), 500

    # Admin Authentication Endpoints
    @app.route('/api/admin/login', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def admin_login():
        # Always redirect admin login to Clerk UI
        return jsonify({
            'message': 'Please use the Clerk admin login UI.'
        }), 401

    @app.route('/api/admin/register', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def admin_register():
        # Check if this is the first admin (no admins exist)
        existing_admins = Admin.query.count()
        
        # Allow self-registration for the first 3 admins (for development/testing)
        # After that, require super admin authentication
        if existing_admins >= 3:
            admin_id = session.get('admin_id')
            if not admin_id:
                return jsonify({'error': 'Authentication required for admin registration. Please contact a super admin.'}), 401

            current_admin = Admin.query.get(admin_id)
            if not current_admin or not current_admin.is_active or current_admin.role != 'super_admin':
                return jsonify({'error': 'Super admin privileges required for admin registration.'}), 403

        data = request.get_json()
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role', 'admin')
        permissions = data.get('permissions', [])

        if not all([name, email, password]):
            return jsonify({'error': 'Missing required fields.'}), 400

        if Admin.query.filter_by(email=email).first():
            return jsonify({'error': 'Email already registered.'}), 409

        # For the first admin, always set as super_admin
        if existing_admins == 0:
            role = 'super_admin'
            permissions = ["feature_properties", "unfeature_properties", "manage_users", "manage_agents", "view_analytics"]
        # For subsequent admins (up to 3), allow role selection but default to admin
        elif existing_admins < 3:
            role = role if role in ['admin', 'super_admin'] else 'admin'
            if not permissions:
                permissions = ["feature_properties", "unfeature_properties", "view_analytics"]

        hashed_password = generate_password_hash(password)
        new_admin = Admin(
            name=name,
            email=email,
            password=hashed_password,
            role=role,
            permissions=json.dumps(permissions),
            is_active=True
        )

        db.session.add(new_admin)
        db.session.commit()

        return jsonify({
            'message': 'Admin registered successfully',
            'admin_id': new_admin.id,
            'is_first_admin': existing_admins == 0,
            'admin_count': existing_admins + 1
        }), 201

    @app.route('/api/admin/logout', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def admin_logout():
        session.pop('admin_id', None)
        session.pop('admin_name', None)
        session.pop('admin_role', None)
        return jsonify({'message': 'Admin logged out successfully'}), 200

    # Admin middleware for protected routes
    def require_admin(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            admin_id = session.get('admin_id')
            if not admin_id:
                return jsonify({'error': 'Admin authentication required.'}), 401
            
            admin = Admin.query.get(admin_id)
            if not admin or not admin.is_active:
                return jsonify({'error': 'Invalid or inactive admin account.'}), 401
            
            return f(*args, **kwargs)
        return decorated_function

    def require_super_admin(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            admin_id = session.get('admin_id')
            if not admin_id:
                return jsonify({'error': 'Admin authentication required.'}), 401
            
            admin = Admin.query.get(admin_id)
            if not admin or not admin.is_active or admin.role != 'super_admin':
                return jsonify({'error': 'Super admin privileges required.'}), 403
            
            return f(*args, **kwargs)
        return decorated_function

    # Admin Property Management Endpoints
    @app.route('/api/admin/properties', methods=['GET'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @require_supabase_authenticated
    def admin_get_properties():
        # Check if user is admin in our database
        supabase_id = g.supabase_id
        admin = Admin.query.filter_by(supabase_id=supabase_id).first()
        
        if not admin or not admin.is_active:
            return jsonify({'error': 'Admin privileges required'}), 403
        
        # Update last login
        update_admin_last_login(supabase_id)
        
        """Get all properties with admin details"""
        try:
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)
            search = request.args.get('search', '')
            featured_only = request.args.get('featured_only', 'false').lower() == 'true'
            promoted_only = request.args.get('promoted_only', 'false').lower() == 'true'
            agent_filter = request.args.get('agent_id', type=int)

            query = Listing.query

            # Apply search filter
            if search:
                query = query.filter(
                    db.or_(
                        Listing.title.ilike(f'%{search}%'),
                        Listing.city.ilike(f'%{search}%'),
                        Listing.state.ilike(f'%{search}%'),
                        Listing.area.ilike(f'%{search}%'),
                        Listing.description.ilike(f'%{search}%')
                    )
                )

            # Apply featured filter
            if featured_only:
                query = query.filter(Listing.is_featured == True)
            
            # Apply promoted filter
            if promoted_only:
                query = query.filter(Listing.is_promoted == True)
            
            # Apply agent filter
            if agent_filter:
                query = query.filter(Listing.agent_id == agent_filter)

            # Get paginated results
            properties = query.order_by(Listing.created_at.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            property_list = []  
            for prop in properties.items:
                try:
                    images = json.loads(prop.image_paths) if prop.image_paths else []
                except Exception:
                    images = []
                # Always use Supabase URLs for images
                images = [to_supabase_url(img, 'listings') for img in images if img]

                # Always fetch units from the Unit table for complex listings
                units = []
                if prop.listing_type == 'complex':
                    units = Unit.query.filter_by(listing_id=prop.id).all()


                # Price/bed/bath display logic using units
                price_display = prop.price
                bed_display = prop.bedrooms
                bath_display = prop.bathrooms
                if prop.listing_type == 'complex' and units:
                    prices = [unit.price_min for unit in units if isinstance(unit.price_min, (int, float)) and unit.price_min > 0]
                    prices += [unit.price_max for unit in units if isinstance(unit.price_max, (int, float)) and unit.price_max > 0]
                    if prices:
                        min_price = min(prices)
                        max_price = max(prices)
                        if min_price == max_price:
                            price_display = f"{int(min_price)}"
                        else:
                            price_display = f"{int(min_price)}-{int(max_price)}"
                    elif prop.price and prop.price > 0:
                        price_display = str(int(prop.price))
                    else:
                        price_display = 'Price on request'

                    beds = [unit.bedrooms for unit in units if isinstance(unit.bedrooms, (int, float)) and unit.bedrooms > 0]
                    if beds:
                        min_beds = min(beds)
                        max_beds = max(beds)
                        if min_beds == max_beds:
                            bed_display = str(int(min_beds))
                        else:
                            bed_display = f"{int(min_beds)}-{int(max_beds)}"
                    elif prop.bedrooms and prop.bedrooms > 0:
                        bed_display = str(int(prop.bedrooms))
                    else:
                        bed_display = ''

                    baths = [unit.bathrooms for unit in units if isinstance(unit.bathrooms, (int, float)) and unit.bathrooms > 0]
                    if baths:
                        min_baths = min(baths)
                        max_baths = max(baths)
                        if min_baths == max_baths:
                            bath_display = str(int(min_baths))
                        else:
                            bath_display = f"{int(min_baths)}-{int(max_baths)}"
                    elif prop.bathrooms and prop.bathrooms > 0:
                        bath_display = str(int(prop.bathrooms))
                    else:
                        bath_display = ''


                # --- Promotion info ---
                if getattr(prop, 'is_promoted', False):
                    promotion_info = {
                        'is_promoted': True,
                        'promoted_until': prop.promoted_until.isoformat() if prop.promoted_until else None,
                        'paused_at': prop.paused_at.isoformat() if prop.paused_at else None,
                        'remaining_days': prop.remaining_days if prop.remaining_days else None
                    }
                else:
                    promotion_info = None

                # --- Agent info ---
                agent_info = None
                if getattr(prop, 'agent_id', None):
                    agent = Agent.query.get(prop.agent_id)
                    if agent:
                        agent_info = {
                            'id': agent.id,
                            'name': agent.name,
                            'email': agent.email,
                            'agent_type': getattr(agent, 'agent_type', None)
                        }

                property_list.append({
                    'id': prop.id,
                    'title': prop.title,
                    'description': prop.description,
                    'price': prop.price,
                    'price_display': price_display,
                    'state': prop.state,
                    'city': prop.city,
                    'area': prop.area,
                    'bedrooms': prop.bedrooms,
                    'bathrooms': prop.bathrooms,
                    'bed_display': bed_display,
                    'bath_display': bath_display,
                    'listing_type': prop.listing_type,
                    'image_paths': images,
                    'video_path': prop.video_path,
                    'tags': prop.tags,
                    'is_featured': prop.is_featured,
                    'is_promoted': prop.is_promoted,
                    'promotion_info': promotion_info,
                    'created_at': prop.created_at.isoformat() if prop.created_at else None,
                    'agent': agent_info,
                    'agent_id': prop.agent_id,
                    'amenities': prop.amenities
                })

            return jsonify({
                'properties': property_list,
                'total': properties.total,
                'pages': properties.pages,
                'current_page': page,
                'has_next': properties.has_next,
                'has_prev': properties.has_prev
            })

        except Exception as e:
            print(f"Admin get properties error: {str(e)}")
            return jsonify({'error': 'Failed to fetch properties'}), 500

    @app.route('/api/admin/property/<int:listing_id>/feature', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @require_supabase_authenticated
    def admin_feature_property(listing_id):
        # Check if user is admin in our database
        supabase_id = g.supabase_id
        admin = Admin.query.filter_by(supabase_id=supabase_id).first()
        
        if not admin or not admin.is_active:
            return jsonify({'error': 'Admin privileges required'}), 403
        
        """Feature a property"""
        try:
            listing = Listing.query.get_or_404(listing_id)
            listing.is_featured = True
            db.session.commit()

            # Clear relevant caches
            invalidate_listing_cache(listing_id)
            invalidate_cache_pattern("*featured_properties*")
            invalidate_cache_pattern("*agent_listings*")

            return jsonify({
                'success': True,
                'message': f'Property "{listing.title}" has been featured'
            })

        except Exception as e:
            print(f"Admin feature property error: {str(e)}")
            return jsonify({'error': 'Failed to feature property'}), 500

    @app.route('/api/admin/property/<int:listing_id>/unfeature', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @require_supabase_authenticated
    def admin_unfeature_property(listing_id):
        # Check if user is admin in our database
        supabase_id = g.supabase_id
        admin = Admin.query.filter_by(supabase_id=supabase_id).first()
        
        if not admin or not admin.is_active:
            return jsonify({'error': 'Admin privileges required'}), 403
        
        """Unfeature a property"""
        try:
            listing = Listing.query.get_or_404(listing_id)
            listing.is_featured = False
            db.session.commit()

            # Clear relevant caches
            invalidate_listing_cache(listing_id)
            invalidate_cache_pattern("*featured_properties*")
            invalidate_cache_pattern("*agent_listings*")

            return jsonify({
                'success': True,
                'message': f'Property "{listing.title}" has been unfeatured'
            })

        except Exception as e:
            print(f"Admin unfeature property error: {str(e)}")
            return jsonify({'error': 'Failed to unfeature property'}), 500

    @app.route('/api/admin/property/<int:listing_id>/toggle-feature', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @require_supabase_authenticated
    def admin_toggle_feature_property(listing_id):
        # Check if user is admin in our database
        supabase_id = g.supabase_id
        admin = Admin.query.filter_by(supabase_id=supabase_id).first()
        
        if not admin or not admin.is_active:
            return jsonify({'error': 'Admin privileges required'}), 403
        
        """Toggle featured status of a property"""
        try:
            listing = Listing.query.get_or_404(listing_id)
            listing.is_featured = not listing.is_featured
            db.session.commit()

            # Clear relevant caches
            invalidate_listing_cache(listing_id)
            invalidate_cache_pattern("*featured_properties*")
            invalidate_cache_pattern("*agent_listings*")

            action = "featured" if listing.is_featured else "unfeatured"
            return jsonify({
                'success': True,
                'message': f'Property "{listing.title}" has been {action}',
                'is_featured': listing.is_featured
            })

        except Exception as e:
            print(f"Admin toggle feature property error: {str(e)}")
            return jsonify({'error': 'Failed to toggle feature status'}), 500

    @app.route('/api/admin/featured-properties', methods=['GET'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @require_supabase_authenticated
    def admin_get_featured_properties():
        # Check if user is admin in our database
        supabase_id = g.supabase_id
        admin = Admin.query.filter_by(supabase_id=supabase_id).first()
        
        if not admin or not admin.is_active:
            return jsonify({'error': 'Admin privileges required'}), 403
        
        """Get all featured properties for admin management"""
        try:
            featured_properties = Listing.query.filter_by(is_featured=True).order_by(Listing.created_at.desc()).all()
            
            property_list = []
            for prop in featured_properties:
                try:
                    images = json.loads(prop.image_paths) if prop.image_paths else []
                except json.JSONDecodeError:
                    images = []

                # Get agent info
                agent = Agent.query.get(prop.agent_id)
                agent_info = {
                    'id': agent.id,
                    'name': agent.name,
                    'email': agent.email,
                    'agent_type': agent.agent_type
                } if agent else None

                property_list.append({
                    'id': prop.id,
                    'title': prop.title,
                    'price': prop.price,
                    'city': prop.city,
                    'state': prop.state,
                    'area': prop.area,
                    'bedrooms': prop.bedrooms,
                    'bathrooms': prop.bathrooms,
                    'image_paths': images,
                    'created_at': prop.created_at.isoformat() if prop.created_at else None,
                    'agent': agent_info
                })

            return jsonify({
                'featured_properties': property_list,
                'total': len(property_list)
            })

        except Exception as e:
            print(f"Admin get featured properties error: {str(e)}")
            return jsonify({'error': 'Failed to fetch featured properties'}), 500

    @app.route('/api/admin/agents', methods=['GET'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    @require_supabase_authenticated
    def admin_get_agents():
        # Check if user is admin in our database
        supabase_id = g.supabase_id
        admin = Admin.query.filter_by(supabase_id=supabase_id).first()
        
        if not admin or not admin.is_active:
            return jsonify({'error': 'Admin privileges required'}), 403
        
        """Get all agents with admin details"""
        try:
            agents = Agent.query.all()
            agent_list = []
            
            for agent in agents:
                # Get agent's listings count
                listings_count = Listing.query.filter_by(agent_id=agent.id).count()
                
                # Get agent's featured listings count
                featured_count = Listing.query.filter_by(agent_id=agent.id, is_featured=True).count()
                
                # Get agent's promoted listings count
                promoted_count = Listing.query.filter_by(agent_id=agent.id, is_promoted=True).count()
                
                agent_list.append({
                    'id': agent.id,
                    'name': agent.name,
                    'email': agent.email,
                    'phone': agent.phone,
                    'agent_type': agent.agent_type,
                    #'company': agent.company,
                    #'license_number': agent.license_number,
                    'profile_image': agent.photo_url,
                    #'bio': agent.bio,
                    #'is_verified': agent.is_verified,
                    #'is_active': agent.is_active,
                    'created_at': agent.created_at.isoformat() if agent.created_at else None,
                    'listings_count': listings_count,
                    'featured_listings_count': featured_count,
                    'promoted_listings_count': promoted_count
                })
            
            return jsonify({
                'agents': agent_list,
                'total': len(agent_list)
            })
            
        except Exception as e:
            print(f"Admin get agents error: {str(e)}")
            return jsonify({'error': 'Failed to fetch agents'}), 500

    @app.route('/api/admin/onboarding', methods=['POST'])
    @require_supabase_authenticated
    def admin_onboarding_sync():
        data = request.get_json()
        supabase_id = g.supabase_id
        # Get email from JWT payload
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.split(' ')[1]
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=['HS256'], options={"verify_aud": False})
        email = payload.get('email')
        if not email:
            return jsonify({'error': 'Email not found in Supabase token'}), 400
        # Get onboarding fields from POST body
        full_name = data.get('fullName', '')
        role = data.get('role', 'admin')
        permissions = data.get('permissions', [])
        is_active = data.get('is_active', True)
        # Upsert admin using supabase_id
        upsert_admin_from_onboarding(
            supabase_id=supabase_id,
            email=email,
            full_name=full_name,
            role=role,
            permissions=permissions,
            is_active=is_active,
            onboarding_complete=True
        )
        response = make_response(jsonify({"success": True}), 200)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.route('/api/admin/profile', methods=['GET'])
    @require_supabase_authenticated
    def get_admin_profile():
        supabase_id = g.supabase_id
        print(f"Admin profile request for supabase_id: {supabase_id}")
        # Query admin data from database using SQLAlchemy
        admin = Admin.query.filter_by(supabase_id=supabase_id).first()
        print(f"Admin found: {admin is not None}")
        if admin:
            admin_data = {
                'supabase_id': admin.supabase_id,
                'full_name': admin.full_name,
                'email': admin.email,
                'role': admin.role,
                'permissions': admin.permissions,
                'is_active': admin.is_active,
                'created_at': admin.created_at.isoformat() if admin.created_at else None,
                'last_login': admin.last_login.isoformat() if admin.last_login else None,
                'onboarding_complete': getattr(admin, 'onboarding_complete', False)  # <-- Added
            }
            print(f"Returning admin data: {admin_data}")
            return jsonify(admin_data), 200
        else:
            print("Admin not found in database")
            return jsonify({"error": "Admin not found"}), 404

    @app.route('/api/user/onboarding', methods=['POST'])
    @require_supabase_authenticated
    def user_onboarding():
        supabase_id = g.supabase_id
        data = request.get_json()
        full_name = data.get('fullName', '')
        # Get email from JWT payload (already decoded in decorator)
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.split(' ')[1]
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=['HS256'], options={"verify_aud": False})
        email = payload.get('email')
        if not email:
            return jsonify({'error': 'Email not found in Supabase token'}), 400
        user = User.query.filter_by(supabase_id=supabase_id).first()
        if user:
            user.name = full_name
            user.onboarding_complete = True
            db.session.commit()
        else:
            # Check if email already exists (should not happen, but just in case)
            if User.query.filter_by(email=email).first():
                return jsonify({'error': 'Email already exists'}), 409
            user = User(
                name=full_name,
                email=email,
                supabase_id=supabase_id,
                onboarding_complete=True
            )
            db.session.add(user)
            db.session.commit()
        return jsonify({
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'supabase_id': user.supabase_id,
            'onboarding_complete': True
        })

    @app.route('/api/agent/onboarding', methods=['POST'])
    @require_supabase_authenticated
    def agent_onboarding():
        supabase_id = g.supabase_id
        data = request.get_json()
        full_name = data.get('fullName', '')
        phone = data.get('phone', '')
        agent_type = data.get('agent_type', 'freelance')
        address = data.get('address', '')
        specialty = data.get('specialty', 'rental')
        languages = data.get('languages', [])
        photo_url = data.get('photo_url', None)
        # Get email from JWT payload (already decoded in decorator)
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.split(' ')[1]
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=['HS256'], options={"verify_aud": False})
        email = payload.get('email')
        if not email:
            return jsonify({'error': 'Email not found in Supabase token'}), 400
        agent = Agent.query.filter_by(supabase_id=supabase_id).first()
        if agent:
            agent.name = full_name
            agent.phone = phone
            agent.agent_type = agent_type
            agent.address = address
            agent.specialty = specialty
            agent.languages = ','.join(languages) if languages else ''
            agent.photo_url = photo_url
            agent.onboarding_complete = True
            db.session.commit()
        else:
            # Check if email already exists (should not happen, but just in case)
            if Agent.query.filter_by(email=email).first():
                return jsonify({'error': 'Email already exists'}), 409
            agent = Agent(
                name=full_name,
                email=email,
                supabase_id=supabase_id,
                phone=phone,
                agent_type=agent_type,
                address=address,
                specialty=specialty,
                languages=','.join(languages) if languages else '',
                photo_url=photo_url,
                onboarding_complete=True
            )
            db.session.add(agent)
            db.session.commit()
        return jsonify({
            'id': agent.id,
            'name': agent.name,
            'email': agent.email,
            'supabase_id': agent.supabase_id,
            'onboarding_complete': True
        })

    @app.route('/api/user/profile', methods=['GET'])
    @require_supabase_authenticated
    def get_user_profile():
        supabase_id = g.supabase_id
        user = User.query.filter_by(supabase_id=supabase_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'supabase_id': user.supabase_id,
            'onboarding_complete': getattr(user, 'onboarding_complete', True)
        })

    @app.route('/api/viewing-bookings/<user_id>', methods=['GET'])
    @cross_origin()
    def get_user_bookings(user_id):
        """Get all viewing bookings for a user"""
        try:
            bookings = ViewingBooking.query.filter_by(user_id=user_id).order_by(ViewingBooking.preferred_date.desc(), ViewingBooking.preferred_time.desc()).all()
            
            booking_list = []
            for booking in bookings:
                listing = Listing.query.get(booking.listing_id)
                booking_list.append({
                    'booking_id': booking.id,
                    'listing_id': booking.listing_id,
                    'property_title': listing.title if listing else 'Unknown Property',
                    'status': booking.status,
                    'created_at': booking.created_at,
                    'viewer_name': booking.viewer_name,
                    'viewing_date': booking.preferred_date,
                    'viewing_time': booking.preferred_time
                })
            
            return jsonify({
                'success': True,
                'bookings': booking_list,
                'count': len(booking_list)
            }), 200
            
        except Exception as e:
            return jsonify({'error': f'Failed to get bookings: {str(e)}'}), 500

    # Agent Dashboard Endpoints for Applications and Bookings
    @app.route('/api/agent/<int:agent_id>/applications', methods=['GET'])
    @cross_origin()
    def get_agent_applications(agent_id):
        """Get all property applications for an agent's listings"""
        try:
            # Get all listings by this agent
            agent_listings = Listing.query.filter_by(agent_id=agent_id).all()
            listing_ids = [listing.id for listing in agent_listings]
            
            # Get applications for these listings
            applications = PropertyApplication.query.filter(
                PropertyApplication.listing_id.in_(listing_ids)
            ).order_by(PropertyApplication.created_at.desc()).all()
            
            app_list = []
            for app in applications:
                listing = Listing.query.get(app.listing_id)
                app_list.append({
                    'application_id': app.id,
                    'listing_id': app.listing_id,
                    'property_title': listing.title if listing else 'Unknown Property',
                    'property_location': f"{listing.area}, {listing.city}, {listing.state}" if listing else 'Unknown Location',
                    'status': app.status,
                    'created_at': app.created_at,
                    'applicant_name': app.applicant_name,
                    'applicant_email': app.applicant_email,
                    'applicant_phone': app.applicant_phone,
                    'monthly_income': app.monthly_income,
                    'employment_status': app.employment_status,
                    'move_in_date': app.move_in_date,
                    'lease_duration': app.lease_duration,
                    'additional_notes': app.additional_notes
                })
            
            return jsonify({
                'success': True,
                'applications': app_list,
                'count': len(app_list)
            }), 200
            
        except Exception as e:
            return jsonify({'error': f'Failed to get applications: {str(e)}'}), 500

    @app.route('/api/agent/<int:agent_id>/bookings', methods=['GET'])
    @cross_origin()
    def get_agent_bookings(agent_id):
        """Get all viewing bookings for an agent's listings"""
        try:
            # Get all listings by this agent
            agent_listings = Listing.query.filter_by(agent_id=agent_id).all()
            listing_ids = [listing.id for listing in agent_listings]
            
            # Get bookings for these listings
            bookings = ViewingBooking.query.filter(
                ViewingBooking.listing_id.in_(listing_ids)
            ).order_by(ViewingBooking.preferred_date.desc(), ViewingBooking.preferred_time.desc()).all()
            
            booking_list = []
            for booking in bookings:
                listing = Listing.query.get(booking.listing_id)
                booking_list.append({
                    'booking_id': booking.id,
                    'listing_id': booking.listing_id,
                    'property_title': listing.title if listing else 'Unknown Property',
                    'property_location': f"{listing.area}, {listing.city}, {listing.state}" if listing else 'Unknown Location',
                    'status': booking.status,
                    'created_at': booking.created_at,
                    'viewer_name': booking.viewer_name,
                    'viewer_email': booking.viewer_email,
                    'viewer_phone': booking.viewer_phone,
                    'viewing_date': booking.preferred_date,
                    'viewing_time': booking.preferred_time,
                    'alternative_date': booking.alternative_date,
                    'alternative_time': booking.alternative_time,
                    'special_requirements': booking.special_requirements
                })
            
            return jsonify({
                'success': True,
                'bookings': booking_list,
                'count': len(booking_list)
            }), 200
            
        except Exception as e:
            return jsonify({'error': f'Failed to get bookings: {str(e)}'}), 500

    @app.route('/api/agent/application/<int:application_id>/status', methods=['PUT'])
    @cross_origin()
    def update_application_status(application_id):
        """Update application status (approved, rejected, pending)"""
        try:
            data = request.get_json()
            new_status = data.get('status')
            
            if new_status not in ['pending', 'approved', 'rejected']:
                return jsonify({'error': 'Invalid status. Must be pending, approved, or rejected'}), 400
            
            application = PropertyApplication.query.get(application_id)
            if not application:
                return jsonify({'error': 'Application not found'}), 404
            
            application.status = new_status
            application.updated_at = datetime.now().isoformat()
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': f'Application status updated to {new_status}',
                'application_id': application_id,
                'status': new_status
            }), 200
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'Failed to update application status: {str(e)}'}), 500

    @app.route('/api/agent/booking/<int:booking_id>/status', methods=['PUT'])
    @cross_origin()
    def update_booking_status(booking_id):
        """Update booking status (pending, confirmed, cancelled)"""
        try:
            data = request.get_json()
            new_status = data.get('status')
            
            if new_status not in ['pending', 'confirmed', 'cancelled']:
                return jsonify({'error': 'Invalid status. Must be pending, confirmed, or cancelled'}), 400
            
            booking = ViewingBooking.query.get(booking_id)
            if not booking:
                return jsonify({'error': 'Booking not found'}), 404
            
            booking.status = new_status
            booking.updated_at = datetime.now().isoformat()
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': f'Booking status updated to {new_status}',
                'booking_id': booking_id,
                'status': new_status
            }), 200
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'Failed to update booking status: {str(e)}'}), 500

    @app.route('/api/send-message', methods=['POST'])
    @cross_origin()
    def send_message_to_agent():
        data = request.get_json()
        listing_id = data.get('listing_id')
        renter_name = data.get('name')
        renter_email = data.get('email')
        renter_phone = data.get('phone')
        move_in = data.get('moveIn')
        message = data.get('message')

        # Lookup agent email for this listing
        listing = Listing.query.get(listing_id)
        if not listing or not listing.agent:
            return jsonify({'error': 'Agent not found for this listing'}), 404

        agent_email = listing.agent.email

        subject = f"New message from {renter_name} about {listing.title}"
        html = f"""
        <h2>New Renter Inquiry</h2>
        <p><b>Name:</b> {renter_name}</p>
        <p><b>Email:</b> {renter_email}</p>
        <p><b>Phone:</b> {renter_phone}</p>
        <p><b>Preferred Move-in Date:</b> {move_in}</p>
        <p><b>Message:</b><br>{message}</p>
        """
        text_content = f"""
        New Renter Inquiry\n\nName: {renter_name}\nEmail: {renter_email}\nPhone: {renter_phone}\nPreferred Move-in Date: {move_in}\nMessage:\n{message}
        """

        email_service.send_email(agent_email, subject, html, text_content)

        return jsonify({'success': True, 'message': 'Message sent to agent!'})

    @app.route('/api/check-user-exists', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def check_user_exists():
        data = request.json
        email = data.get('email')
        
        if not email:
            return jsonify({"error": "Email is required"}), 400
            
        # Check if user exists in our database
        user = User.query.filter_by(email=email).first()
        
        if user:
            return jsonify({"exists": True, "message": "User already exists"}), 200
        else:
            return jsonify({"exists": False, "message": "User does not exist"}), 200

    @app.route('/api/check-agent-exists', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def check_agent_exists():
        data = request.get_json()
        email = data.get('email')
        if not email:
            return jsonify({'error': 'Email is required.'}), 400
        agent = Agent.query.filter_by(email=email).first()
        if agent:
            return jsonify({'exists': True}), 200
        else:
            return jsonify({'exists': False}), 200

    @app.route('/api/listings', methods=['POST'])
    @cross_origin(origins=settings.cors_origins, supports_credentials=True)
    def create_listing():
        data = request.get_json()
        def safe_float(val, default=0.0):
            try:
                return float(val) if val is not None and val != '' else default
            except (ValueError, TypeError):
                return default
        def safe_int(val, default=0):
            try:
                return int(val) if val is not None and val != '' else default
            except (ValueError, TypeError):
                return default

        # Required fields
        title = data.get('title')
        description = data.get('description')
        state = data.get('state')
        city = data.get('city')
        area = data.get('area')
        address = data.get('address')
        agent_id = data.get('agent_id')
        listing_type = data.get('listing_type', 'individual')
        rent_period = data.get('rent_period', 'month')
        price = safe_float(data.get('price'))
        bedrooms = safe_int(data.get('bedrooms'))
        bathrooms = safe_float(data.get('bathrooms'))
        sqft = safe_int(data.get('sqft'))
        amenities = data.get('amenities')
        interior_features = data.get('interior_features')
        exterior_features = data.get('exterior_features')
        leasing_terms = data.get('leasing_terms')
        policy = data.get('policy')
        tags = data.get('tags') or None
        image_paths = data.get('image_paths', [])
        video_path = data.get('video_path')
        availability_date = data.get('availability_date')
        # Save to database
        new_property = Listing(
            title=title,
            description=description,
            price=price,
            state=state,
            city=city,
            area=area,
            address=address,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            sqft=sqft,
            image_paths=json.dumps(image_paths),
            video_path=video_path,
            agent_id=agent_id,
            amenities=amenities,
            interior_features=interior_features,
            exterior_features=exterior_features,
            leasing_terms=leasing_terms,
            policy=policy,
            tags=tags,
            listing_type=listing_type,
            rent_period=rent_period
        )
        if availability_date:
            try:
                new_property.availability_date = datetime.strptime(availability_date, '%Y-%m-%d')
            except Exception:
                pass
        db.session.add(new_property)
        db.session.commit()

        # Handle units for complex listings
        if listing_type == 'complex':
            units_data = data.get('units')
            if units_data:
                try:
                    for unit in units_data:
                        new_unit = Unit(
                            listing_id=new_property.id,
                            name=unit.get('name', ''),
                            bedrooms=safe_int(unit.get('bedrooms')),
                            bathrooms=safe_float(unit.get('bathrooms')),
                            sqft=safe_int(unit.get('sqft')),
                            price_min=safe_float(unit.get('price_min')),
                            price_max=safe_float(unit.get('price_max')),
                            is_available=unit.get('is_available', True)
                        )
                        db.session.add(new_unit)
                    db.session.commit()
                except Exception as e:
                    print("Error parsing units JSON data", e)

        new_property.url = f"{settings.FRONTEND_URL}/listing/{new_property.id}"
        db.session.commit()

        # Invalidate caches so new listings show up immediately
        invalidate_listing_cache()  # homepage, search, listing lists
        invalidate_agent_cache(agent_id)  # agent dashboard, agent analytics, agent listings
        invalidate_user_cache(None)  # all user dashboards (recommendations)
        invalidate_cache_pattern("*listing_details*")  # all listing details

        return jsonify({'message': 'Listing uploaded successfully!', 'listing_id': new_property.id}), 201

    return app

def expire_promotions():
    with app.app_context():
        now = datetime.utcnow()
        expired = Listing.query.filter(
            Listing.is_promoted == True,
            Listing.promoted_until != None,
            Listing.promoted_until < now
        ).all()
        for listing in expired:
            listing.is_promoted = False
        if expired:
            db.session.commit()
            print(f"Expired {len(expired)} promotions.")
            
# --- Ensure all image paths are Supabase URLs ---
def to_supabase_url(path, bucket):
    if not path:
        return None
    if path.startswith('http://') or path.startswith('https://'):
        return path
    # Assume public bucket
    base_url = settings.SUPABASE_PUBLIC_URL
    return f"{base_url}/{bucket}/{path}"

app = create_app()

# Start APScheduler job (runs in both dev and prod)
scheduler = BackgroundScheduler()
scheduler.add_job(func=expire_promotions, trigger="interval", minutes=30)
scheduler.start()

# if __name__ == '__main__':
#     app.run(debug=True)