# Render Deployment Guide for CasaLinger

## Memory Optimization for Free Tier

Your app was hitting the 512MB memory limit on Render's free tier. Here's how to fix it:

## 1. Use Optimized Requirements

**Use `requirements-prod.txt` instead of `requirements.txt`** for production:

```bash
# In Render Build Command:
pip install -r requirements-prod.txt
```

This excludes heavy ML dependencies that load on startup.

## 2. Render Settings

| Field | Value |
|-------|-------|
| **Root Directory** | `pipeline` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `gunicorn startup:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --max-requests 1000 --max-requests-jitter 100` |

## 3. Required Environment Variables

Make sure these are set in Render:

```
SUPABASE_JWT_SECRET=your_jwt_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_SQLALCHEMY_DATABASE_URI=postgresql://...
REDIS_URL=redis://...
FRONTEND_URL=https://your-frontend.vercel.app
APP_SECRET_KEY=your_secret_key
GROQ_API_KEY=your_groq_key
```

## 4. Memory Optimization Features

### Lazy Loading
- LangChain chatbot is now loaded only when needed
- Embedding models are loaded on-demand
- Heavy ML imports are deferred
- **Modules directory** also uses lazy loading for memory management

### Gunicorn Settings
- Single worker to reduce memory usage
- Request limits to prevent memory leaks
- Timeout settings for long-running requests

### Environment Optimizations
- Disabled tokenizer parallelism
- Forced garbage collection on startup
- Memory-friendly Python settings

## 5. Monitoring

Check Render logs for:
- Memory usage patterns
- Startup errors
- Missing environment variables

## 6. If Still Having Issues

### Option A: Upgrade to Paid Tier
- Render's paid tiers offer more memory
- $7/month for 1GB RAM
- $15/month for 2GB RAM

### Option B: Further Optimizations
1. Remove unused dependencies
2. Use lighter ML models
3. Implement request queuing
4. Add memory monitoring

### Option C: Alternative Deployment
- Railway (more generous free tier)
- Heroku (paid but reliable)
- DigitalOcean App Platform

## 7. Testing Locally

### Simple Test (Recommended)
Test the lazy loading functions:


**Note**: The full test requires all environment variables and dependencies to be set up locally.

## 8. Troubleshooting

### "No open HTTP ports detected"
- Check if app starts successfully
- Verify environment variables
- Look for import errors in logs

### "Memory limit exceeded"
- Use `requirements.txt`
- Check for memory leaks
- Monitor memory usage in logs

### "Module not found"
- Ensure all dependencies are in requirements
- Check Python version compatibility
- Verify import paths 