import logging
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_community.vectorstores import Qdrant
from langchain_core.embeddings import Embeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from pydantic import BaseModel, Field

from modules.enhanced_prompts import ENHANCED_MEMORY_ANALYSIS_PROMPT, MEMORY_CONSOLIDATION_PROMPT
from modules.enhanced_vector_store import EnhancedVectorStore, EnhancedMemory, MemoryEntry as VectorStoreMemoryEntry
from settings import settings
from sentence_transformers import SentenceTransformer

# Lazy load embedding model to reduce memory usage
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model

@dataclass
class MemoryEntry:
    """Enhanced memory entry with metadata"""
    id: str
    content: str
    memory_type: str  # 'semantic', 'episodic', 'procedural'
    importance_score: float
    timestamp: datetime
    metadata: Dict[str, Any]
    access_count: int = 0
    last_accessed: Optional[datetime] = None


class MemoryAnalysis(BaseModel):
    """Enhanced memory analysis result"""
    is_important: bool = Field(description="Whether the message is important enough to be stored")
    formatted_memory: Optional[str] = Field(description="The formatted memory to be stored")
    memory_type: str = Field(description="Type of memory: semantic, episodic, or procedural")
    importance_score: float = Field(description="Importance score from 0.0 to 1.0")
    tags: List[str] = Field(description="Tags for categorization", default_factory=list)


class EnhancedMemoryManager:
    """Enhanced memory manager with LangChain integration"""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        # Lazy load embedding model when needed
        self._embedding_model = None
        self.vector_store = EnhancedVectorStore(user_id)
        self.llm = ChatGroq(
            model=settings.SMALL_TEXT_MODEL_NAME,
            api_key=settings.GROQ_API_KEY,
            temperature=0.1
        )
        self.logger = logging.getLogger(__name__)
        
        # Memory consolidation settings
        self.consolidation_threshold = getattr(settings, 'MEMORY_CONSOLIDATION_THRESHOLD', 10)
        self.memory_cache = {}  # In-memory cache for frequently accessed memories
    
    @property
    def embedding_model(self):
        """Lazy load embedding model when first accessed"""
        if self._embedding_model is None:
            self._embedding_model = get_embedding_model()
        return self._embedding_model
        
    def extract_and_store_memories(self, message: BaseMessage) -> None:
        """Enhanced memory extraction with type classification"""
        if message.type != "human":
            return
            
        # Analyze message for memory content
        analysis = self._analyze_memory(message.content)
        
        if analysis.is_important and analysis.formatted_memory:
            # Create memory entry
            memory_entry = MemoryEntry(
                id=str(uuid.uuid4()),
                content=analysis.formatted_memory,
                memory_type=analysis.memory_type,
                importance_score=analysis.importance_score,
                timestamp=datetime.now(),
                metadata={
                    "tags": analysis.tags,
                    "user_id": self.user_id,
                    "source": "conversation"
                }
            )
            
            # Store in vector store
            self._store_memory(memory_entry)
            
            # Update cache
            self.memory_cache[memory_entry.id] = memory_entry
            
            # Don't invalidate memory cache automatically - let it expire naturally
            # This allows for better caching of similar queries
            self.logger.info(f"Stored {analysis.memory_type} memory: {analysis.formatted_memory}")
    
    def _analyze_memory(self, content: str) -> MemoryAnalysis:
        """Enhanced memory analysis with type classification"""
        prompt = ChatPromptTemplate.from_messages([
            ("system", ENHANCED_MEMORY_ANALYSIS_PROMPT),
            ("human", f"Analyze this message: {content}")
        ])
        
        chain = prompt | self.llm.with_structured_output(MemoryAnalysis)
        return chain.invoke({"content": content})
    
    def _store_memory(self, memory_entry: MemoryEntry) -> None:
        """Store memory in vector store with metadata"""
        # Check for similar memories to avoid duplicates
        similar_memories = self.vector_store.search_memories(
            memory_entry.content, 
            k=3,  # Check more memories for better similarity detection
            memory_type=memory_entry.memory_type
        )
        
        # Check if any existing memory is similar enough
        for similar_memory in similar_memories:
            similarity = self._calculate_similarity(
                memory_entry.content, 
                similar_memory.content
            )
            
            if similarity > 0.8:  # Lowered threshold
                # Update existing memory instead of creating new one
                self._update_existing_memory(similar_memory, memory_entry)
                return
        
        # Store new memory - convert to vector store MemoryEntry
        vector_store_memory = VectorStoreMemoryEntry(
            id=memory_entry.id,
            content=memory_entry.content,
            memory_type=memory_entry.memory_type,
            importance_score=memory_entry.importance_score,
            timestamp=memory_entry.timestamp,
            metadata=memory_entry.metadata,
            access_count=memory_entry.access_count,
            last_accessed=memory_entry.last_accessed
        )
        self.vector_store.store_memory(vector_store_memory)
    
    def _update_existing_memory(self, existing: EnhancedMemory, new: MemoryEntry) -> None:
        """Update existing memory with new information"""
        # Convert existing EnhancedMemory to MemoryEntry for update
        updated_memory = MemoryEntry(
            id=existing.id,
            content=new.content,
            memory_type=new.memory_type,
            importance_score=max(existing.importance_score, new.importance_score),
            timestamp=datetime.now(),
            metadata={**existing.metadata, **new.metadata},
            access_count=existing.access_count,
            last_accessed=existing.last_accessed
        )
        
        # Update in vector store - convert to vector store MemoryEntry
        vector_store_memory = VectorStoreMemoryEntry(
            id=updated_memory.id,
            content=updated_memory.content,
            memory_type=updated_memory.memory_type,
            importance_score=updated_memory.importance_score,
            timestamp=updated_memory.timestamp,
            metadata=updated_memory.metadata,
            access_count=updated_memory.access_count,
            last_accessed=updated_memory.last_accessed
        )
        self.vector_store.update_memory(vector_store_memory)
        
        # Update cache
        self.memory_cache[existing.id] = updated_memory
    
    def _merge_memory_content(self, existing_content: str, new_content: str) -> str:
        """Merge two memory contents using LLM"""
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Merge these two related memories into one comprehensive memory. Remove redundancy while preserving all important information:"),
            ("human", f"Existing: {existing_content}\nNew: {new_content}")
        ])
        
        chain = prompt | self.llm | StrOutputParser()
        return chain.invoke({"existing": existing_content, "new": new_content})
    

    def get_relevant_memories(self, context: str, memory_types: List[str] = None) -> List[MemoryEntry]:
        """Get relevant memories with type filtering and recency prioritization"""
        if memory_types is None:
            memory_types = ["semantic", "episodic", "procedural"]
        
        # Search vector store for each memory type
        all_memories = []
        for memory_type in memory_types:
            memories = self.vector_store.search_memories(
                context, 
                k=settings.MEMORY_TOP_K * 2,  # Get more memories to allow for better sorting
                memory_type=memory_type
            )
            all_memories.extend(memories)
        
        # Calculate combined score that considers both relevance and recency
        for memory in all_memories:
            # Calculate recency score (0-1, higher for more recent)
            days_old = (datetime.now() - memory.timestamp).days
            recency_score = max(0, 1 - (days_old / 30))  # Decay over 30 days
            
            # Calculate combined score: 70% relevance + 30% recency
            memory.combined_score = (memory.importance_score * 0.7) + (recency_score * 0.3)
        
        # Sort by combined score and take top k
        all_memories.sort(key=lambda x: x.combined_score, reverse=True)
        top_memories = all_memories[:settings.MEMORY_TOP_K]
        
        # Update access statistics and convert to MemoryEntry for updates
        updated_memories = []
        for memory in top_memories:
            # Convert EnhancedMemory to MemoryEntry for update
            memory_entry = MemoryEntry(
                id=memory.id,
                content=memory.content,
                memory_type=memory.memory_type,
                importance_score=memory.importance_score,
                timestamp=memory.timestamp,
                metadata=memory.metadata,
                access_count=memory.access_count + 1,
                last_accessed=datetime.now()
            )
            
            # Update in vector store - convert to vector store MemoryEntry
            vector_store_memory = VectorStoreMemoryEntry(
                id=memory_entry.id,
                content=memory_entry.content,
                memory_type=memory_entry.memory_type,
                importance_score=memory_entry.importance_score,
                timestamp=memory_entry.timestamp,
                metadata=memory_entry.metadata,
                access_count=memory_entry.access_count,
                last_accessed=memory_entry.last_accessed
            )
            self.vector_store.update_memory(vector_store_memory)
            
            # Update cache
            self.memory_cache[memory.id] = memory_entry
            updated_memories.append(memory_entry)

        return updated_memories

    
    def consolidate_memories(self) -> None:
        """Consolidate similar memories to reduce redundancy"""
        # Get all memories
        all_memories = self.vector_store.get_all_memories()
        
        if len(all_memories) < self.consolidation_threshold:
            return
        
        # Group similar memories by type
        for memory_type in ["semantic", "episodic", "procedural"]:
            type_memories = [m for m in all_memories if m.memory_type == memory_type]
            
            if len(type_memories) < 5:
                continue
                
            # Find clusters of similar memories
            clusters = self._find_memory_clusters(type_memories)
            
            # Consolidate each cluster
            for cluster in clusters:
                if len(cluster) > 1:
                    self._consolidate_cluster(cluster)
    
    def _find_memory_clusters(self, memories: List[MemoryEntry]) -> List[List[MemoryEntry]]:
        """Find clusters of similar memories"""
        clusters = []
        processed = set()
        
        for i, memory in enumerate(memories):
            if memory.id in processed:
                continue
                
            cluster = [memory]
            processed.add(memory.id)
            
            for j, other_memory in enumerate(memories[i+1:], i+1):
                if other_memory.id in processed:
                    continue
                    
                similarity = self._calculate_similarity(memory.content, other_memory.content)
                
                if similarity > 0.8:  # Lowered threshold for consolidation
                    cluster.append(other_memory)
                    processed.add(other_memory.id)
            
            if len(cluster) > 1:
                clusters.append(cluster)
        
        return clusters
    
    def _consolidate_cluster(self, cluster: List[MemoryEntry]) -> None:
        """Consolidate a cluster of similar memories"""
        # Use LLM to create a consolidated memory
        memories_text = "\n".join([f"- {m.content}" for m in cluster])
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", MEMORY_CONSOLIDATION_PROMPT),
            ("human", f"Consolidate these similar memories:\n{memories_text}")
        ])
        
        chain = prompt | self.llm | StrOutputParser()
        consolidated_content = chain.invoke({"memories": memories_text})
        
        # Create new consolidated memory
        consolidated_memory = MemoryEntry(
            id=str(uuid.uuid4()),
            content=consolidated_content,
            memory_type=cluster[0].memory_type,
            importance_score=max(m.importance_score for m in cluster),
            timestamp=datetime.now(),
            metadata={
                "consolidated_from": [m.id for m in cluster],
                "tags": list(set(tag for m in cluster for tag in m.metadata.get("tags", []) if m.metadata.get("tags") is not None)),
                "user_id": self.user_id
            }
        )
        
        # Store consolidated memory
        self._store_memory(consolidated_memory)
        
        # Remove original memories
        for memory in cluster:
            self._delete_memory(memory.id)
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate cosine similarity between two texts"""
        embedding1 = self.embedding_model.encode(text1)
        embedding2 = self.embedding_model.encode(text2)
        
        # Calculate cosine similarity
        import numpy as np
        dot_product = np.dot(embedding1, embedding2)
        norm1 = np.linalg.norm(embedding1)
        norm2 = np.linalg.norm(embedding2)
        
        return dot_product / (norm1 * norm2)
    
    def format_memories_for_prompt(self, memories: List[MemoryEntry]) -> str:
        """Format memories for prompt injection - content only, deduplicated"""
        if not memories:
            return ""
        
        # Deduplicate by content to avoid repetition
        seen_contents = set()
        unique_memories = []
        
        for memory in memories:
            if memory.content not in seen_contents:
                seen_contents.add(memory.content)
                unique_memories.append(memory.content)
        
        # Return clean content without type tags
        return "\n".join(unique_memories)
    
    def get_memories_by_type(self, memory_type: str, limit: int = 10) -> List[MemoryEntry]:
        """Get memories of a specific type"""
        return self.vector_store.get_memories_by_type(memory_type, limit)
    
    def delete_memory(self, memory_id: str) -> None:
        """Delete a specific memory"""
        self._delete_memory(memory_id)
    
    def _delete_memory(self, memory_id: str) -> None:
        """Delete memory from vector store and cache"""
        self.vector_store.delete_memory(memory_id)
        if memory_id in self.memory_cache:
            del self.memory_cache[memory_id]
    
    def get_memory_statistics(self) -> Dict[str, Any]:
        """Get statistics about stored memories"""
        all_memories = self.vector_store.get_all_memories()
        
        stats = {
            "total_memories": len(all_memories),
            "by_type": {},
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
            
            # Calculate average importance
            total_importance = sum(m.importance_score for m in all_memories)
            stats["average_importance"] = total_importance / len(all_memories)
            
            # Get most accessed memories
            sorted_by_access = sorted(all_memories, key=lambda x: x.access_count, reverse=True)
            stats["most_accessed"] = [
                {"content": m.content, "access_count": m.access_count} 
                for m in sorted_by_access[:5]
            ]
        
        return stats


def get_enhanced_memory_manager(user_id: str) -> EnhancedMemoryManager:
    """Get enhanced memory manager instance"""
    return EnhancedMemoryManager(user_id) 