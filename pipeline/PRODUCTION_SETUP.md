# 🚀 CasaLinger Production Setup Guide

## 📋 Environment Configuration

### Step 1: Update Your .env File

Add this to your existing `.env` file:

```env
# ========================================
# Environment Configuration
# ========================================
ENVIRONMENT=production

# ========================================
# Core API Keys (Update with production values)
# ========================================
GROQ_API_KEY=your_production_groq_key
APP_SECRET_KEY=your_production_secret_key
MONGODB_URI=mongodb+srv://prod_user:prod_password@prod-cluster.mongodb.net/CasaLinger_prod

# ========================================
# Supabase Configuration (Same project for dev/prod)
# ========================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
SUPABASE_SQLALCHEMY_DATABASE_URI=postgresql://postgres:password@host:5432/postgres
SUPABASE_PUBLIC_URL=https://your-project.supabase.co

# ========================================
# Vector Database Configuration
# ========================================
QDRANT_API_KEY=your_production_qdrant_key
QDRANT_URL=https://your-prod-qdrant-cluster.qdrant.io
QDRANT_PORT=6333
QDRANT_HOST=your-prod-qdrant-host.qdrant.io

# ========================================
# Email Configuration
# ========================================
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your_production_smtp_password
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=CasaLinger
```

### Step 2: Update Domain URLs

In `pipeline/settings.py`, update these URLs with your actual domains:

```python
@property
def cors_origins(self) -> list:
    if self.is_production:
        return [
            "https://yourdomain.com",        # ← Update this
            "https://www.yourdomain.com",    # ← Update this
            "https://casalinger.com",        # ← Update this
            "https://www.casalinger.com"     # ← Update this
        ]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]

@property
def api_url(self) -> str:
    if self.is_production:
        return "https://your-api-domain.com"  # ← Update this
    return "http://127.0.0.1:5000"

@property
def frontend_url(self) -> str:
    if self.is_production:
        return "https://yourdomain.com"  # ← Update this
    return "http://localhost:5173"
```

### Step 3: Redis Cloud Configuration

Update the Redis configuration in `pipeline/settings.py`:

```python
@property
def redis_config(self) -> dict:
    if self.is_production:
        return {
            'host': 'your-redis-cloud-host',      # ← Update this
            'port': 6379,
            'username': 'your-redis-username',    # ← Update this
            'password': 'your-redis-password',    # ← Update this
            'ssl': True,
            'ssl_cert_reqs': None
        }
    else:
        return {
            'host': 'localhost',
            'port': 6379,
            'db': 0
        }
```

## 🔧 Backend Updates Needed

### Update app.py CORS Configuration

The app.py will automatically use the environment-based CORS configuration from settings.py.

### Update Session Configuration

The session configuration will automatically use production settings when `ENVIRONMENT=production`.

## 🌐 Frontend Updates Needed

### Create Frontend Environment File

Create `pipeline/my-chatbot-app/.env.production`:

```env
# Production Environment Variables
VITE_API_URL=https://your-api-domain.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Update API Calls

Update all API calls in your frontend to use environment variables:

```javascript
// src/utils/config.js
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';
const IS_PRODUCTION = import.meta.env.MODE === 'production';

export { API_URL, IS_PRODUCTION };
```

## 🚀 Deployment Checklist

### Before Deployment:
- [ ] Update `.env` file with production values
- [ ] Update domain URLs in `settings.py`
- [ ] Test locally with `ENVIRONMENT=production`
- [ ] Ensure all API keys are production versions
- [ ] Verify database connections work

### After Deployment:
- [ ] Test all authentication flows
- [ ] Test file uploads
- [ ] Test email notifications
- [ ] Test Redis caching
- [ ] Monitor error logs

## 🔑 Key Differences: Development vs Production

| Setting | Development | Production |
|---------|-------------|------------|
| ENVIRONMENT | `development` | `production` |
| CORS Origins | `localhost:5173` | `yourdomain.com` |
| Session Secure | `False` | `True` |
| Debug Mode | `True` | `False` |
| API URL | `127.0.0.1:5000` | `your-api-domain.com` |

## 🆘 Troubleshooting

### Common Issues:
1. **CORS Errors**: Check that your domain is in `cors_origins`
2. **Session Issues**: Ensure `SESSION_COOKIE_SECURE=True` in production
3. **Database Connection**: Verify Supabase connection string
4. **Redis Connection**: Check Redis Cloud credentials

### Testing Production Locally:
```bash
# Test production config locally
ENVIRONMENT=production python app.py
``` 