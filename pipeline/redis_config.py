import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Redis Cloud Configuration
REDIS_CLOUD_CONFIG = {
    'host': os.getenv('REDIS_CLOUD_HOST', 'localhost'),
    'port': int(os.getenv('REDIS_CLOUD_PORT', 6379)),
    'username': os.getenv('REDIS_CLOUD_USERNAME', 'default'),
    'password': os.getenv('REDIS_CLOUD_PASSWORD', None),
    'decode_responses': True,
    'socket_connect_timeout': 10,
    'socket_timeout': 10,
    'retry_on_timeout': True,
    'health_check_interval': 30
}

# Fallback to local Redis if Redis Cloud is not configured
LOCAL_REDIS_CONFIG = {
    'host': 'localhost',
    'port': 6379,
    'db': 0,
    'decode_responses': True,
    'socket_connect_timeout': 5,
    'socket_timeout': 5
}

def get_redis_config():
    """Get Redis configuration based on environment"""
    # Check if Redis Cloud credentials are provided
    if (os.getenv('REDIS_CLOUD_HOST') and 
        os.getenv('REDIS_CLOUD_PASSWORD')):
        return REDIS_CLOUD_CONFIG
    else:
        return LOCAL_REDIS_CONFIG

def is_redis_cloud_configured():
    """Check if Redis Cloud is properly configured"""
    return bool(os.getenv('REDIS_CLOUD_HOST') and os.getenv('REDIS_CLOUD_PASSWORD')) 