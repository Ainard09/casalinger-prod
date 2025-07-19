import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from typing import List, Optional, Dict, Any
import numpy as np

try:
    from qdrant_client.models import Filter, FieldCondition, MatchValue, PayloadIndexInfo, PayloadSchemaType
    from qdrant_client.models import Distance, PointStruct, VectorParams, UpdateStatus
    from qdrant_client import QdrantClient
    from sentence_transformers import SentenceTransformer
except ImportError:
    # Handle missing dependencies gracefully
    pass

from settings import settings

# Lazy load embedding model to reduce memory usage
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model

@dataclass
class MemoryEntry:
    """Memory entry for storage"""
    id: str
    content: str
    memory_type: str
    importance_score: float
    timestamp: datetime
    metadata: Dict[str, Any]
    access_count: int = 0
    last_accessed: Optional[datetime] = None


@dataclass
class EnhancedMemory:
    """Enhanced memory entry in the vector store."""
    id: str
    content: str
    memory_type: str
    importance_score: float
    timestamp: datetime
    metadata: Dict[str, Any]
    score: Optional[float] = None
    access_count: int = 0
    last_accessed: Optional[datetime] = None

    @property
    def age_days(self) -> int:
        """Get the age of the memory in days."""
        return (datetime.now() - self.timestamp).days

    @property
    def is_recent(self) -> bool:
        """Check if the memory is recent (less than 7 days old)."""
        return self.age_days < 7

    @property
    def is_frequently_accessed(self) -> bool:
        """Check if the memory is frequently accessed."""
        return self.access_count > 5


class EnhancedVectorStore:
    """Enhanced vector store with support for different memory types and advanced search capabilities."""

    REQUIRED_ENV_VARS = ["QDRANT_URL", "QDRANT_API_KEY"]
    EMBEDDING_MODEL = "all-MiniLM-L6-v2"
    SIMILARITY_THRESHOLD = 0.8
    MAX_MEMORIES_PER_TYPE = 1000

    _instance: Optional["EnhancedVectorStore"] = None
    _initialized: bool = False

    def __new__(cls, *args, **kwargs) -> "EnhancedVectorStore":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, user_id: str) -> None:
        if not self._initialized:
            self._validate_env_vars()
            # Lazy load embedding model when needed
            self._model = None
            self.client = QdrantClient(
                url=settings.QDRANT_URL, 
                api_key=settings.QDRANT_API_KEY
            )
            self._initialized = True
        
        self.user_id = user_id
        self.collection_name = f"enhanced_memory_{user_id}"
        self._ensure_collection_exists()
    
    @property
    def model(self):
        """Lazy load embedding model when first accessed"""
        if self._model is None:
            self._model = get_embedding_model()
        return self._model

    def _validate_env_vars(self) -> None:
        """Validate that all required environment variables are set."""
        missing_vars = [var for var in self.REQUIRED_ENV_VARS if not os.getenv(var)]
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")

    def _ensure_collection_exists(self) -> None:
        """Ensure the memory collection exists with proper configuration."""
        collections = self.client.get_collections().collections
        collection_exists = any(col.name == self.collection_name for col in collections)
        
        if not collection_exists:
            self._create_collection()
        else:
            # Ensure proper payload indexes exist
            self._ensure_payload_indexes()

    def _create_collection(self) -> None:
        """Create a new collection for storing enhanced memories."""
        sample_embedding = self.model.encode("sample text")
        
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(
                size=len(sample_embedding),
                distance=Distance.COSINE,
            ),
        )
        
        # Create payload indexes for efficient filtering
        self._create_payload_indexes()

    def _create_payload_indexes(self) -> None:
        """Create payload indexes for efficient filtering."""
        try:
            # Index for memory type
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="memory_type",
                field_schema=PayloadSchemaType.KEYWORD
            )
            
            # Index for user_id
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="user_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            
            # Index for tags
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="tags",
                field_schema=PayloadSchemaType.KEYWORD
            )
            
            # Index for timestamp
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="timestamp",
                field_schema=PayloadSchemaType.DATETIME
            )
            
        except Exception as e:
            # Indexes might already exist
            pass

    def _ensure_payload_indexes(self) -> None:
        """Ensure payload indexes exist."""
        try:
            indexes = self.client.get_payload_indexes(self.collection_name)
            existing_fields = {idx.field_name for idx in indexes}
            
            required_fields = {"memory_type", "user_id", "tags", "timestamp"}
            missing_fields = required_fields - existing_fields
            
            for field in missing_fields:
                if field == "timestamp":
                    schema = PayloadSchemaType.DATETIME
                else:
                    schema = PayloadSchemaType.KEYWORD
                
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema=schema
                )
        except Exception as e:
            # If we can't check indexes, try to create them
            self._create_payload_indexes()

    def store_memory(self, memory_entry: MemoryEntry) -> None:
        """Store a new memory in the vector store."""
        # Check if similar memory exists
        similar_memory = self.find_similar_memory(memory_entry.content, memory_entry.memory_type)
        if similar_memory:
            # Update existing memory instead of creating new one
            self._update_existing_memory(similar_memory, memory_entry)
            return

        # Create embedding
        embedding = self.model.encode(memory_entry.content)
        
        # Prepare payload
        payload = {
            "id": memory_entry.id,
            "content": memory_entry.content,
            "memory_type": memory_entry.memory_type,
            "importance_score": memory_entry.importance_score,
            "timestamp": memory_entry.timestamp.isoformat(),
            "user_id": self.user_id,
            "access_count": memory_entry.access_count,
            "last_accessed": memory_entry.last_accessed.isoformat() if memory_entry.last_accessed else None,
            **memory_entry.metadata
        }

        # Create point
        point = PointStruct(
            id=hash(memory_entry.id) % (2**63),  # Qdrant requires int64
            vector=embedding.tolist(),
            payload=payload
        )

        # Store in Qdrant
        self.client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )

    def _update_existing_memory(self, existing: EnhancedMemory, new: MemoryEntry) -> None:
        """Update an existing memory with new information."""
        # Convert EnhancedMemory to MemoryEntry for update
        memory_entry = MemoryEntry(
            id=existing.id,
            content=new.content,
            memory_type=new.memory_type,
            importance_score=max(existing.importance_score, new.importance_score),
            timestamp=datetime.now(),
            metadata={**existing.metadata, **new.metadata},
            access_count=existing.access_count,
            last_accessed=existing.last_accessed
        )
        
        # Update in vector store
        self.update_memory(memory_entry)

    def update_memory(self, memory_entry: MemoryEntry) -> None:
        """Update an existing memory in the vector store."""
        # FIRST: Find existing memory by ID to get the correct Qdrant point ID
        existing_memory = self._find_memory_by_id(memory_entry.id)
        
        if existing_memory:
            # Get the actual Qdrant point ID from the existing memory
            # We need to find the point in Qdrant to get its ID
            qdrant_point_id = self._get_qdrant_point_id_by_memory_id(memory_entry.id)
        else:
            # If no existing memory found, use hash as before
            qdrant_point_id = hash(memory_entry.id) % (2**63)
        
        embedding = self.model.encode(memory_entry.content)
        
        payload = {
            "id": memory_entry.id,
            "content": memory_entry.content,
            "memory_type": memory_entry.memory_type,
            "importance_score": memory_entry.importance_score,
            "timestamp": memory_entry.timestamp.isoformat(),
            "user_id": self.user_id,
            "access_count": memory_entry.access_count,
            "last_accessed": memory_entry.last_accessed.isoformat() if memory_entry.last_accessed else None,
            **memory_entry.metadata
        }

        point = PointStruct(
            id=qdrant_point_id,  # Use the correct Qdrant point ID
            vector=embedding.tolist(),
            payload=payload
        )

        # Use upsert to update existing or create new
        self.client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )

    def _find_memory_by_id(self, memory_id: str) -> Optional[EnhancedMemory]:
        """Find a memory by its ID."""
        try:
            # Search for memory with specific ID
            filter_conditions = [
                FieldCondition(key="user_id", match=MatchValue(value=self.user_id)),
                FieldCondition(key="id", match=MatchValue(value=memory_id))
            ]
            
            search_filter = Filter(must=filter_conditions)
            
            results = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=search_filter,
                limit=1,
                with_payload=True
            )[0]
            
            if results:
                return self._hit_to_enhanced_memory(results[0])
            return None
        except Exception as e:
            # Memory might not exist
            return None

    def _get_qdrant_point_id_by_memory_id(self, memory_id: str) -> int:
        """Get the Qdrant point ID for a given memory ID."""
        try:
            filter_conditions = [
                FieldCondition(key="user_id", match=MatchValue(value=self.user_id)),
                FieldCondition(key="id", match=MatchValue(value=memory_id))
            ]
            
            search_filter = Filter(must=filter_conditions)
            
            results = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=search_filter,
                limit=1,
                with_payload=True
            )[0]
            
            if results:
                return results[0].id  # Return the actual Qdrant point ID
            else:
                # If not found, use hash as fallback
                return hash(memory_id) % (2**63)
        except Exception as e:
            # If error, use hash as fallback
            return hash(memory_id) % (2**63)

    def find_similar_memory(self, content: str, memory_type: str) -> Optional[EnhancedMemory]:
        """Find if a similar memory already exists."""
        results = self.search_memories(content, k=1, memory_type=memory_type)
        if results and results[0].score is not None and results[0].score >= self.SIMILARITY_THRESHOLD:
            return results[0]
        return None

    def search_memories(self, query: str, k: int = 5, memory_type: Optional[str] = None, 
                       min_importance: float = 0.0, max_age_days: Optional[int] = None) -> List[EnhancedMemory]:
        """Search for similar memories with advanced filtering."""
        # Build filter
        filter_conditions = [
            FieldCondition(key="user_id", match=MatchValue(value=self.user_id))
        ]
        
        if memory_type:
            filter_conditions.append(
                FieldCondition(key="memory_type", match=MatchValue(value=memory_type))
            )
        
        if min_importance > 0.0:
            filter_conditions.append(
                FieldCondition(key="importance_score", range={"gte": min_importance})
            )
        
        if max_age_days:
            cutoff_date = (datetime.now() - timedelta(days=max_age_days)).isoformat()
            filter_conditions.append(
                FieldCondition(key="timestamp", range={"gte": cutoff_date})
            )

        # Create filter
        search_filter = Filter(must=filter_conditions) if filter_conditions else None

        # Search
        query_embedding = self.model.encode(query)
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding.tolist(),
            limit=k,
            query_filter=search_filter,
            with_payload=True
        )

        # Convert to EnhancedMemory objects
        memories = []
        for hit in results:
            memory = self._hit_to_enhanced_memory(hit)
            if memory:
                memories.append(memory)

        return memories

    def get_memories_by_type(self, memory_type: str, limit: int = 10) -> List[EnhancedMemory]:
        """Get memories of a specific type."""
        filter_conditions = [
            FieldCondition(key="user_id", match=MatchValue(value=self.user_id)),
            FieldCondition(key="memory_type", match=MatchValue(value=memory_type))
        ]
        
        search_filter = Filter(must=filter_conditions)
        
        # Get all points with this filter
        results = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=search_filter,
            limit=limit,
            with_payload=True
        )[0]  # scroll returns (points, next_page_offset)

        memories = []
        for hit in results:
            memory = self._hit_to_enhanced_memory(hit)
            if memory:
                memories.append(memory)

        # Sort by importance and recency
        memories.sort(key=lambda x: (x.importance_score, x.timestamp), reverse=True)
        return memories[:limit]

    def get_all_memories(self, limit: int = 1000) -> List[EnhancedMemory]:
        """Get all memories for the user."""
        filter_conditions = [
            FieldCondition(key="user_id", match=MatchValue(value=self.user_id))
        ]
        
        search_filter = Filter(must=filter_conditions)
        
        results = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=search_filter,
            limit=limit,
            with_payload=True
        )[0]

        memories = []
        for hit in results:
            memory = self._hit_to_enhanced_memory(hit)
            if memory:
                memories.append(memory)

        return memories

    def delete_memory(self, memory_id: str) -> None:
        """Delete a memory from the vector store."""
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=[hash(memory_id) % (2**63)]
            )
        except Exception as e:
            # Memory might not exist
            pass

    def get_memory_statistics(self) -> Dict[str, Any]:
        """Get statistics about stored memories."""
        all_memories = self.get_all_memories()
        
        stats = {
            "total_memories": len(all_memories),
            "by_type": {},
            "by_importance": {"high": 0, "medium": 0, "low": 0},
            "by_age": {"recent": 0, "old": 0},
            "average_importance": 0.0,
            "most_accessed": []
        }
        
        if all_memories:
            # Count by type
            for memory in all_memories:
                memory_type = memory.memory_type
                if memory_type not in stats["by_type"]:
                    stats["by_type"][memory_type] = 0
                stats["by_type"][memory_type] += 1
                
                # Count by importance
                if memory.importance_score >= 0.7:
                    stats["by_importance"]["high"] += 1
                elif memory.importance_score >= 0.4:
                    stats["by_importance"]["medium"] += 1
                else:
                    stats["by_importance"]["low"] += 1
                
                # Count by age
                if memory.is_recent:
                    stats["by_age"]["recent"] += 1
                else:
                    stats["by_age"]["old"] += 1
            
            # Calculate average importance
            total_importance = sum(m.importance_score for m in all_memories)
            stats["average_importance"] = total_importance / len(all_memories)
            
            # Get most accessed memories
            sorted_by_access = sorted(all_memories, key=lambda x: x.access_count, reverse=True)
            stats["most_accessed"] = [
                {"content": m.content, "access_count": m.access_count, "type": m.memory_type} 
                for m in sorted_by_access[:5]
            ]
        
        return stats

    def cleanup_old_memories(self, max_age_days: int = 90, min_importance: float = 0.3) -> int:
        """Clean up old, low-importance memories."""
        cutoff_date = (datetime.now() - timedelta(days=max_age_days)).isoformat()
        
        filter_conditions = [
            FieldCondition(key="user_id", match=MatchValue(value=self.user_id)),
            FieldCondition(key="timestamp", range={"lt": cutoff_date}),
            FieldCondition(key="importance_score", range={"lt": min_importance})
        ]
        
        search_filter = Filter(must=filter_conditions)
        
        # Get old, low-importance memories
        results = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=search_filter,
            limit=1000,
            with_payload=True
        )[0]
        
        # Delete them
        deleted_count = 0
        for hit in results:
            try:
                self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=[hit.id]
                )
                deleted_count += 1
            except Exception:
                pass
        
        return deleted_count

    def cleanup_duplicate_memories(self) -> int:
        """Remove duplicate memories with the same ID."""
        all_memories = self.get_all_memories()
        seen_ids = set()
        duplicates_to_delete = []
        
        for memory in all_memories:
            if memory.id in seen_ids:
                # This is a duplicate, mark for deletion
                duplicates_to_delete.append(memory)
            else:
                seen_ids.add(memory.id)
        
        # Delete duplicates
        for memory in duplicates_to_delete:
            self.delete_memory(memory.id)
        
        return len(duplicates_to_delete)

    def _hit_to_enhanced_memory(self, hit) -> Optional[EnhancedMemory]:
        """Convert a Qdrant hit to EnhancedMemory object."""
        try:
            payload = hit.payload
            
            # Parse timestamp
            timestamp_str = payload.get("timestamp")
            timestamp = datetime.fromisoformat(timestamp_str) if timestamp_str else datetime.now()
            
            # Parse last_accessed
            last_accessed_str = payload.get("last_accessed")
            last_accessed = datetime.fromisoformat(last_accessed_str) if last_accessed_str else None
            
            return EnhancedMemory(
                id=payload.get("id"),
                content=payload.get("content"),
                memory_type=payload.get("memory_type", "semantic"),
                importance_score=payload.get("importance_score", 0.5),
                timestamp=timestamp,
                metadata={k: v for k, v in payload.items() 
                         if k not in ["id", "content", "memory_type", "importance_score", "timestamp", "user_id", "access_count", "last_accessed"]},
                score=hit.score,
                access_count=payload.get("access_count", 0),
                last_accessed=last_accessed
            )
        except Exception as e:
            # Log error and return None
            return None

    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate cosine similarity between two texts."""
        embedding1 = self.model.encode(text1)
        embedding2 = self.model.encode(text2)
        
        dot_product = np.dot(embedding1, embedding2)
        norm1 = np.linalg.norm(embedding1)
        norm2 = np.linalg.norm(embedding2)
        
        return dot_product / (norm1 * norm2)


def get_enhanced_vector_store(user_id: str) -> EnhancedVectorStore:
    """Get enhanced vector store instance."""
    return EnhancedVectorStore(user_id) 