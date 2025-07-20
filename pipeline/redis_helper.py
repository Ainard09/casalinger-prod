import redis
import json
import hashlib
from functools import wraps
from flask import request, jsonify, Response
import logging
from datetime import datetime
import numpy as np
from sentence_transformers import SentenceTransformer
from datetime import datetime
from modules.enhanced_memory_manager import MemoryEntry
from redis_config import get_redis_config, is_redis_cloud_configured

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lazy load embedding model to reduce memory usage
_model = None

def get_embedding_model():
    global _model
    if _model is None:
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model

# Initialize Redis client
try:
    redis_config = get_redis_config()
    redis_client = redis.Redis(**redis_config)
    
    # Test connection
    redis_client.ping()
    
    if is_redis_cloud_configured():
        logger.info("✅ Redis Cloud connection established successfully")
    else:
        logger.info("✅ Local Redis connection established successfully")
        
except redis.ConnectionError as e:
    logger.error(f"❌ Redis connection failed: {e}")
    redis_client = None
except Exception as e:
    logger.error(f"❌ Redis initialization error: {e}")
    redis_client = None

def is_redis_available():
    """Check if Redis is available and working"""
    if redis_client is None:
        return False
    try:
        redis_client.ping()
        return True
    except:
        return False

def create_cache_key(prefix, *args, **kwargs):
    """Create a consistent cache key from function arguments"""
    # Combine all arguments into a string
    key_parts = [prefix]
    
    # Add positional arguments
    for arg in args:
        key_parts.append(str(arg))
    
    # Add keyword arguments (sorted for consistency)
    for key, value in sorted(kwargs.items()):
        key_parts.append(f"{key}:{value}")
    
    # Add request parameters if available
    if hasattr(request, 'args'):
        for key, value in sorted(request.args.items()):
            key_parts.append(f"req_{key}:{value}")
    
    # Create hash for consistent key length
    key_string = "|".join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()

def cache_response(expiry=300, key_prefix=None):
    """
    Decorator to cache API responses
    
    Args:
        expiry (int): Cache expiration time in seconds (default: 5 minutes)
        key_prefix (str): Custom prefix for cache key
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not is_redis_available():
                logger.warning("Redis not available, skipping cache")
                return f(*args, **kwargs)

            prefix = key_prefix or f"{f.__module__}.{f.__name__}"
            cache_key = create_cache_key(prefix, *args, **kwargs)

            try:
                cached_data = redis_client.get(cache_key)
                if cached_data:
                    logger.info(f"Cache HIT for key: {cache_key}")
                    # Always return as Flask Response
                    return jsonify(json.loads(cached_data))

                logger.info(f"Cache MISS for key: {cache_key}")
                result = f(*args, **kwargs)

                # If result is a Flask Response, try to extract JSON data
                if isinstance(result, Response):
                    # Try to get JSON data from response
                    try:
                        data = result.get_json()
                        if data is not None:
                            redis_client.setex(cache_key, expiry, json.dumps(data))
                            logger.info(f"Cached result for key: {cache_key} (expires in {expiry}s)")
                        return result
                    except Exception as e:
                        logger.warning(f"Could not extract JSON from Response: {e}")
                        return result  # Don't cache non-JSON responses
                # If result is JSON-serializable, cache and return as Response
                try:
                    redis_client.setex(cache_key, expiry, json.dumps(result))
                    logger.info(f"Cached result for key: {cache_key} (expires in {expiry}s)")
                    return jsonify(result)
                except Exception as e:
                    logger.warning(f"Result not JSON serializable, skipping cache: {e}")
                    return result
            except Exception as e:
                logger.error(f"Cache error for key {cache_key}: {e}")
                return f(*args, **kwargs)
        return decorated_function
    return decorator

def store_semantic_cache(user_id, question, embedding, answer, expiry=3600):
    """Store a question embedding and answer in Redis semantic cache."""
    import json
    question_hash = hashlib.md5(question.lower().strip().encode()).hexdigest()
    key = f"semantic_cache:{user_id}:{question_hash}"
    value = json.dumps({
        "embedding": embedding,  # Should be a list of floats
        "answer": answer,
        "question": question
    })
    redis_client.setex(key, expiry, value)

def get_all_semantic_cache(user_id):
    """Retrieve all semantic cache entries for a user."""
    import json
    pattern = f"semantic_cache:{user_id}:*"
    keys = redis_client.keys(pattern)
    results = []
    for key in keys:
        val = redis_client.get(key)
        if val:
            try:
                results.append(json.loads(val))
            except Exception:
                continue
    return results

def cosine_similarity(vec1, vec2):
    """Compute cosine similarity between two vectors."""
    v1 = np.array(vec1)
    v2 = np.array(vec2)
    if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0:
        return 0.0
    return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))

def invalidate_cache_pattern(pattern):
    """Invalidate all cache keys matching a pattern"""
    if not is_redis_available():
        return
    
    try:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} cache keys matching pattern: {pattern}")
    except Exception as e:
        logger.error(f"Cache invalidation error: {e}")

def invalidate_user_cache(user_id):
    """Invalidate all cache related to a specific user"""
    patterns = [
        f"*user_dashboard:{user_id}*",
        f"*user:{user_id}*",
        f"*saved_listings:{user_id}*"
    ]
    for pattern in patterns:
        invalidate_cache_pattern(pattern)

def invalidate_listing_cache(listing_id=None):
    """Invalidate cache related to listings"""
    if listing_id:
        patterns = [
            f"*listing:{listing_id}*",
            f"*featured_properties*",
            f"*search_properties*"
        ]
    else:
        patterns = [
            f"*featured_properties*",
            f"*search_properties*",
            f"*listing:*"
        ]
    
    for pattern in patterns:
        invalidate_cache_pattern(pattern)

def invalidate_agent_cache(agent_id=None):
    """Invalidate cache related to agents"""
    if agent_id:
        patterns = [
            f"*agent_analytics:{agent_id}*",
            f"*agent_listings:{agent_id}*",
            f"*agent_trends:{agent_id}*"
        ]
    else:
        patterns = [
            f"*agent_analytics*",
            f"*agent_listings*",
            f"*agent_trends*"
        ]
    
    for pattern in patterns:
        invalidate_cache_pattern(pattern)

def invalidate_all_agent_caches(agent_id):
    """Aggressively invalidate all agent-related caches"""
    if not is_redis_available():
        return
    
    try:
        # Clear all agent-related patterns
        patterns = [
            f"*agent_analytics*",
            f"*agent_listings*", 
            f"*agent_trends*",
            f"*agent:{agent_id}*",
            f"*agent_listings:{agent_id}*",
            f"*agent_analytics:{agent_id}*",
            f"*agent_trends:{agent_id}*"
        ]
        
        total_cleared = 0
        for pattern in patterns:
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
                total_cleared += len(keys)
                logger.info(f"Cleared {len(keys)} keys for pattern: {pattern}")
        
        logger.info(f"Total agent cache keys cleared: {total_cleared}")
    except Exception as e:
        logger.error(f"Error clearing agent caches: {e}")

def cache_user_data(user_id, data, expiry=600):
    """Cache user-specific data"""
    if not is_redis_available():
        return
    
    try:
        key = f"user_data:{user_id}"
        redis_client.setex(key, expiry, json.dumps(data))
        logger.info(f"Cached user data for user {user_id}")
    except Exception as e:
        logger.error(f"Error caching user data: {e}")

def get_cached_user_data(user_id):
    """Get cached user data"""
    if not is_redis_available():
        return None
    
    try:
        key = f"user_data:{user_id}"
        data = redis_client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        logger.error(f"Error getting cached user data: {e}")
        return None

def cache_ai_response(question, response, user_id=None, expiry=3600):
    """Cache AI chatbot responses"""
    if not is_redis_available():
        return
    
    try:
        # Create a hash of the question for consistent caching
        question_hash = hashlib.md5(question.lower().strip().encode()).hexdigest()
        key = f"ai_response:{user_id or 'anonymous'}:{question_hash}"
        redis_client.setex(key, expiry, json.dumps(response))
        logger.info(f"Cached AI response for question hash: {question_hash}")
    except Exception as e:
        logger.error(f"Error caching AI response: {e}")

def get_cached_ai_response(question, user_id=None):
    """Get cached AI response"""
    if not is_redis_available():
        return None
    
    try:
        question_hash = hashlib.md5(question.lower().strip().encode()).hexdigest()
        key = f"ai_response:{user_id or 'anonymous'}:{question_hash}"
        response = redis_client.get(key)
        return json.loads(response) if response else None
    except Exception as e:
        logger.error(f"Error getting cached AI response: {e}")
        return None

def get_cache_stats():
    """Get Redis cache statistics"""
    if not is_redis_available():
        return {"error": "Redis not available"}
    
    try:
        info = redis_client.info()
        return {
            "connected_clients": info.get("connected_clients", 0),
            "used_memory_human": info.get("used_memory_human", "0B"),
            "total_commands_processed": info.get("total_commands_processed", 0),
            "keyspace_hits": info.get("keyspace_hits", 0),
            "keyspace_misses": info.get("keyspace_misses", 0),
            "uptime_in_seconds": info.get("uptime_in_seconds", 0)
        }
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        return {"error": str(e)}

def invalidate_cache_by_prefix(prefix):
    """
    Invalidate all cache entries that match a specific prefix
    
    Args:
        prefix (str): Cache key prefix to match
    """
    if not is_redis_available():
        logger.warning("Redis not available, cannot invalidate cache")
        return
    
    try:
        # Get all keys matching the prefix
        pattern = f"{prefix}:*"
        keys = redis_client.keys(pattern)
        
        if keys:
            # Delete all matching keys
            redis_client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} cache entries with prefix: {prefix}")
        else:
            logger.info(f"No cache entries found with prefix: {prefix}")
            
    except Exception as e:
        logger.error(f"Error invalidating cache by prefix {prefix}: {e}")

def clear_all_cache():
    """
    Clear all cache entries (use with caution)
    """
    if not is_redis_available():
        logger.warning("Redis not available, cannot clear cache")
        return
    
    try:
        redis_client.flushdb()
        logger.info("All cache entries cleared successfully")
    except Exception as e:
        logger.error(f"Error clearing all cache: {e}")

def _serialize_memory_entry(memory_entry):
    """Convert MemoryEntry to JSON-serializable dict"""
    if hasattr(memory_entry, 'timestamp') and memory_entry.timestamp:
        timestamp = memory_entry.timestamp.isoformat() if hasattr(memory_entry.timestamp, 'isoformat') else str(memory_entry.timestamp)
    else:
        timestamp = None
        
    if hasattr(memory_entry, 'last_accessed') and memory_entry.last_accessed:
        last_accessed = memory_entry.last_accessed.isoformat() if hasattr(memory_entry.last_accessed, 'isoformat') else str(memory_entry.last_accessed)
    else:
        last_accessed = None
    
    return {
        'id': getattr(memory_entry, 'id', ''),
        'content': getattr(memory_entry, 'content', ''),
        'memory_type': getattr(memory_entry, 'memory_type', ''),
        'importance_score': getattr(memory_entry, 'importance_score', 0.0),
        'timestamp': timestamp,
        'metadata': getattr(memory_entry, 'metadata', {}),
        'access_count': getattr(memory_entry, 'access_count', 0),
        'last_accessed': last_accessed
    }

def cache_memory_retrieval(user_id, context, memories_data, expiry=1800):
    """
    Cache memory retrieval results for a user and context
    
    Args:
        user_id (str): User ID
        context (str): The context/question used for memory retrieval
        memories_data (dict): Memory data to cache
        expiry (int): Cache expiration time in seconds (default: 30 minutes)
    """
    if not is_redis_available():
        return
    
    try:
        # Create a hash of the context for consistent caching
        context_hash = hashlib.md5(context.lower().strip().encode()).hexdigest()
        key = f"memory_cache:{user_id}:{context_hash}"
        
        # Serialize memory entries to JSON-serializable format
        serialized_data = {
            'user_question': memories_data.get('user_question', ''),
            'semantic_memories': [_serialize_memory_entry(m) for m in memories_data.get('semantic_memories', [])],
            'episodic_memories': [_serialize_memory_entry(m) for m in memories_data.get('episodic_memories', [])],
            'procedural_memories': [_serialize_memory_entry(m) for m in memories_data.get('procedural_memories', [])],
            'memory_context': memories_data.get('memory_context', ''),
            'timestamp': memories_data.get('timestamp', datetime.now().isoformat())
        }
        
        redis_client.setex(key, expiry, json.dumps(serialized_data))
        logger.info(f"✅ Cached memory retrieval for user {user_id}, context: '{context}', hash: {context_hash}")
        
        # Debug: Verify the cache was stored
        stored_data = redis_client.get(key)
        if stored_data:
            logger.info(f"✅ Cache verification successful - data stored and retrievable")
        else:
            logger.error(f"❌ Cache verification failed - data not retrievable after storage")
    except Exception as e:
        logger.error(f"Error caching memory retrieval: {e}")

def _deserialize_memory_entry(memory_dict):
    """Convert serialized memory dict back to proper MemoryEntry object"""
  
    
    # Parse timestamps
    timestamp_str = memory_dict.get('timestamp')
    if timestamp_str:
        try:
            timestamp = datetime.fromisoformat(timestamp_str)
        except:
            timestamp = None
    else:
        timestamp = None
        
    last_accessed_str = memory_dict.get('last_accessed')
    if last_accessed_str:
        try:
            last_accessed = datetime.fromisoformat(last_accessed_str)
        except:
            last_accessed = None
    else:
        last_accessed = None
    
    # Create proper MemoryEntry object
    return MemoryEntry(
        id=memory_dict.get('id', ''),
        content=memory_dict.get('content', ''),
        memory_type=memory_dict.get('memory_type', ''),
        importance_score=memory_dict.get('importance_score', 0.0),
        timestamp=timestamp,
        metadata=memory_dict.get('metadata', {}),
        access_count=memory_dict.get('access_count', 0),
        last_accessed=last_accessed
    )

def get_cached_memory_retrieval(user_id, context):
    """
    Get cached memory retrieval results
    
    Args:
        user_id (str): User ID
        context (str): The context/question used for memory retrieval
    
    Returns:
        dict: Cached memory data or None if not found
    """
    if not is_redis_available():
        return None
    
    try:
        context_hash = hashlib.md5(context.lower().strip().encode()).hexdigest()
        key = f"memory_cache:{user_id}:{context_hash}"
        
        cached_data = redis_client.get(key)
        
        if cached_data:
            data = json.loads(cached_data)
            
            # Deserialize memory entries
            deserialized_data = {
                'user_question': data.get('user_question', ''),
                'semantic_memories': [_deserialize_memory_entry(m) for m in data.get('semantic_memories', [])],
                'episodic_memories': [_deserialize_memory_entry(m) for m in data.get('episodic_memories', [])],
                'procedural_memories': [_deserialize_memory_entry(m) for m in data.get('procedural_memories', [])],
                'memory_context': data.get('memory_context', ''),
                'timestamp': data.get('timestamp', '')
            }
            
            return deserialized_data
        else:
            return None
    except Exception as e:
        logger.error(f"Error getting cached memory retrieval: {e}")
        return None

def find_similar_cached_memory_by_content(user_id, context, similarity_threshold=0.7):
    """
    Find similar cached memory retrieval results by comparing with memory content.
    
    Args:
        user_id (str): User ID
        context (str): The current context/question
        similarity_threshold (float): Minimum similarity score (default: 0.7)
    
    Returns:
        dict: Most similar cached memory data or None if not found
    """
    if not is_redis_available():
        return None
    
    try:
        # Get all cached memory keys for this user
        pattern = f"memory_cache:{user_id}:*"
        keys = redis_client.keys(pattern)
        
        if not keys:
            return None
        
        # Encode the current context
        current_embedding = get_embedding_model().encode(context.lower().strip())
        
        best_match = None
        best_similarity = 0
        
        for key in keys:
            try:
                cached_data = redis_client.get(key)
                if cached_data:
                    data = json.loads(cached_data)
                    
                    # Get all memory content from the cached result
                    all_memory_content = []
                    
                    # Add semantic memories content
                    for memory in data.get('semantic_memories', []):
                        if isinstance(memory, dict) and memory.get('content'):
                            all_memory_content.append(memory['content'])
                        elif hasattr(memory, 'content'):
                            all_memory_content.append(memory.content)
                    
                    # Add episodic memories content
                    for memory in data.get('episodic_memories', []):
                        if isinstance(memory, dict) and memory.get('content'):
                            all_memory_content.append(memory['content'])
                        elif hasattr(memory, 'content'):
                            all_memory_content.append(memory.content)
                    
                    # Add procedural memories content
                    for memory in data.get('procedural_memories', []):
                        if isinstance(memory, dict) and memory.get('content'):
                            all_memory_content.append(memory['content'])
                        elif hasattr(memory, 'content'):
                            all_memory_content.append(memory.content)
                    
                    # Calculate similarity with each memory content
                    for memory_content in all_memory_content:
                        if memory_content:
                            # Encode memory content and calculate similarity
                            memory_embedding = get_embedding_model().encode(memory_content.lower().strip())
                            similarity = cosine_similarity(current_embedding.tolist(), memory_embedding.tolist())
                            
                            if similarity > best_similarity and similarity >= similarity_threshold:
                                best_similarity = similarity
                                # Deserialize the memory entries in the best match
                                deserialized_data = {
                                    'user_question': data.get('user_question', ''),
                                    'semantic_memories': [_deserialize_memory_entry(m) for m in data.get('semantic_memories', [])],
                                    'episodic_memories': [_deserialize_memory_entry(m) for m in data.get('episodic_memories', [])],
                                    'procedural_memories': [_deserialize_memory_entry(m) for m in data.get('procedural_memories', [])],
                                    'memory_context': data.get('memory_context', ''),
                                    'timestamp': data.get('timestamp', '')
                                }
                                best_match = deserialized_data
                            
            except Exception as e:
                logger.warning(f"Error processing cached memory key {key}: {e}")
                continue
        
        return best_match
            
    except Exception as e:
        logger.error(f"Error finding similar cached memory by content: {e}")
        return None

def find_similar_cached_memory(user_id, context, similarity_threshold=0.8):
    """
    Find similar cached memory retrieval results using two-tier similarity matching:
    1. First: Compare current question with previously cached questions
    2. Second: Compare current question with previously cached memory content
    
    Args:
        user_id (str): User ID
        context (str): The current context/question
        similarity_threshold (float): Minimum similarity score (default: 0.8)
    
    Returns:
        dict: Most similar cached memory data or None if not found
    """
    if not is_redis_available():
        return None
    
    try:
        # Get all cached memory keys for this user
        pattern = f"memory_cache:{user_id}:*"
        keys = redis_client.keys(pattern)
        
        if not keys:
            return None
        
        # Encode the current context
        current_embedding = get_embedding_model().encode(context.lower().strip())
        
        best_match = None
        best_similarity = 0
        match_type = None
        
        for key in keys:
            try:
                cached_data = redis_client.get(key)
                if cached_data:
                    data = json.loads(cached_data)
                    cached_user_question = data.get('user_question', '')
                    
                    # TIER 1: Compare with cached questions
                    if cached_user_question:
                        # Encode cached user question and calculate similarity
                        cached_embedding = get_embedding_model().encode(cached_user_question.lower().strip())
                        similarity = cosine_similarity(current_embedding.tolist(), cached_embedding.tolist())
                        
                        if similarity > best_similarity and similarity >= similarity_threshold:
                            best_similarity = similarity
                            match_type = "question"
                            # Deserialize the memory entries in the best match
                            deserialized_data = {
                                'user_question': data.get('user_question', ''),
                                'semantic_memories': [_deserialize_memory_entry(m) for m in data.get('semantic_memories', [])],
                                'episodic_memories': [_deserialize_memory_entry(m) for m in data.get('episodic_memories', [])],
                                'procedural_memories': [_deserialize_memory_entry(m) for m in data.get('procedural_memories', [])],
                                'memory_context': data.get('memory_context', ''),
                                'timestamp': data.get('timestamp', '')
                            }
                            best_match = deserialized_data
                    
                    # TIER 2: Compare with memory content (if no good question match found)
                    if not best_match or best_similarity < similarity_threshold:
                        # Get all memory content from the cached result
                        all_memory_content = []
                        
                        # Add semantic memories content
                        for memory in data.get('semantic_memories', []):
                            if isinstance(memory, dict) and memory.get('content'):
                                all_memory_content.append(memory['content'])
                            elif hasattr(memory, 'content'):
                                all_memory_content.append(memory.content)
                        
                        # Add episodic memories content
                        for memory in data.get('episodic_memories', []):
                            if isinstance(memory, dict) and memory.get('content'):
                                all_memory_content.append(memory['content'])
                            elif hasattr(memory, 'content'):
                                all_memory_content.append(memory.content)
                        
                        # Add procedural memories content
                        for memory in data.get('procedural_memories', []):
                            if isinstance(memory, dict) and memory.get('content'):
                                all_memory_content.append(memory['content'])
                            elif hasattr(memory, 'content'):
                                all_memory_content.append(memory.content)
                        
                        # Calculate similarity with each memory content
                        for memory_content in all_memory_content:
                            if memory_content:
                                # Encode memory content and calculate similarity
                                memory_embedding = get_embedding_model().encode(memory_content.lower().strip())
                                similarity = cosine_similarity(current_embedding.tolist(), memory_embedding.tolist())
                                
                                if similarity > best_similarity and similarity >= similarity_threshold:
                                    best_similarity = similarity
                                    match_type = "content"
                                    # Deserialize the memory entries in the best match
                                    deserialized_data = {
                                        'user_question': data.get('user_question', ''),
                                        'semantic_memories': [_deserialize_memory_entry(m) for m in data.get('semantic_memories', [])],
                                        'episodic_memories': [_deserialize_memory_entry(m) for m in data.get('episodic_memories', [])],
                                        'procedural_memories': [_deserialize_memory_entry(m) for m in data.get('procedural_memories', [])],
                                        'memory_context': data.get('memory_context', ''),
                                        'timestamp': data.get('timestamp', '')
                                    }
                                    best_match = deserialized_data
                            
            except Exception as e:
                logger.warning(f"Error processing cached memory key {key}: {e}")
                continue
        
        return best_match
            
    except Exception as e:
        logger.error(f"Error finding similar cached memory: {e}")
        return None

def invalidate_memory_cache(user_id=None):
    """
    Invalidate memory cache entries
    
    Note: This function is not automatically called when memories are stored
    to allow for better caching of similar queries. The cache will expire
    naturally after the configured TTL (30 minutes by default).
    
    Args:
        user_id (str): Specific user ID to invalidate, or None for all users
    """
    if not is_redis_available():
        return
    
    try:
        if user_id:
            pattern = f"memory_cache:{user_id}:*"
        else:
            pattern = "memory_cache:*"
        
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} memory cache entries for user: {user_id or 'all'}")
    except Exception as e:
        logger.error(f"Error invalidating memory cache: {e}") 