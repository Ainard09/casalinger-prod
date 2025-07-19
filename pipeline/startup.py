#!/usr/bin/env python3
"""
Production startup script for CasaLinger Flask app
Optimized for Render's free tier memory constraints
"""

import os
import sys
import gc
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_environment():
    """Check if all required environment variables are set"""
    required_vars = [
        'SUPABASE_JWT_SECRET',
        'SUPABASE_URL', 
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SQLALCHEMY_DATABASE_URI',
        'REDIS_URL',
        'FRONTEND_URL',
        'APP_SECRET_KEY'
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        return False
    
    logger.info("All required environment variables are set")
    return True

def optimize_memory():
    """Optimize memory usage for production"""
    # Force garbage collection
    gc.collect()
    
    # Set environment variables for memory optimization
    os.environ['PYTHONHASHSEED'] = '0'
    os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
    
    # Disable some memory-intensive features if needed
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    
    logger.info("Memory optimization applied")

def main():
    """Main startup function"""
    try:
        # Load environment variables
        load_dotenv()
        
        # Check environment
        if not check_environment():
            logger.error("Environment check failed")
            sys.exit(1)
        
        # Optimize memory
        optimize_memory()
        
        # Import and create app
        logger.info("Starting CasaLinger Flask application...")
        from app import create_app
        
        app = create_app()
        
        # Get port from environment
        port = int(os.environ.get('PORT', 10000))
        
        logger.info(f"Application created successfully, will bind to port {port}")
        
        return app
        
    except Exception as e:
        logger.error(f"Failed to start application: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        sys.exit(1)

if __name__ == '__main__':
    app = main()
    # The app will be used by Gunicorn 