import re
import logging
from datetime import datetime
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from functools import lru_cache
import hashlib

from langchain_huggingface import HuggingFaceEmbeddings
#from langchain_community.vectorstores import FAISS, Chroma
from langchain.schema import Document
from pydantic import BaseModel, Field
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableConfig, RunnablePassthrough
from langchain_openai import ChatOpenAI
import pymongo
import certifi

from settings import settings

# Configure logging
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# MongoDB setup for property_collection
# MongoDB setup
client = pymongo.MongoClient(settings.MONGODB_URI, tlsCAFile=certifi.where())
db = client["CasaLinger"]
property_collection = db["property_collection"]
real_estate_info_collection = db["real_estate_info_collection"]

# Embedding model
embedding_model = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

@dataclass
class ContextQuality:
    property_relevant: bool
    web_relevant: bool
    property_score: float
    web_score: float
    total_docs: int
    confidence_level: str

# Logger config
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_embedding(text: str) -> list[float]:
    if not text.strip():
        print("Attempted to get embedding for empty text.")
        return []
    return embedding_model.embed_query(text)

def mongo_vector_search(user_query: str, collection, index_name: str, k: int = 4, full_docs: bool = False) -> List[Document]:
    query_embedding = get_embedding(user_query)
    if not query_embedding:
        return []

    pipeline = [
        {
            "$vectorSearch": {
                "index": index_name,
                "queryVector": query_embedding,
                "path": "embedding",
                "numCandidates": 150,
                "limit": k,
            }
        },
        {"$unset": "embedding"}
    ]

    if not full_docs:
        pipeline.append({"$project": {
            "_id": 0,
            "title": 1, "description": 1, "state": 1, "city": 1, "area":1, "price": 1, "rent_period": 1,
            "bedrooms": 1, "bathrooms": 1, "amenities": 1, "interior_features": 1,
            "exterior_features": 1, "tags":1, "policy": 1, "leasing_terms": 1, "availability_date": 1,
            "agent_name": 1, "agent_email": 1, "agent_phone": 1, "agent_address": 1,
            "agent_languages": 1, "agent_specialty":1, 
            "score": {"$meta": "vectorSearchScore"}
        }})
    else:
        pipeline.append({"$project": {
            "_id": 0,
            "page_content": 1,
            "score": {"$meta": "vectorSearchScore"}
        }})

    results = collection.aggregate(pipeline)
    docs = []
    for r in results:
        score = r.pop("score", 0.0)
        docs.append(Document(page_content=str(r), metadata={"score": score}))
    return docs

class Location(BaseModel):
    state: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None

class PropertyResult(BaseModel):
    title: str
    price: Optional[str] = None
    bedrooms: Optional[str] = None
    bathrooms: Optional[str] = None
    location: Location = Field(default_factory=Location)
    description: Optional[str] = None
    tags: Optional[str] = None
    rent_period: Optional[str] = None
    leasing_terms: Optional[str] = None
    amenities: Optional[str] = None
    interior_features: Optional[str] = None
    exterior_features: Optional[str] = None
    policy: Optional[str] = None
    availability_date: Optional[str] = None
    agent_name: Optional[str] = None
    agent_email: Optional[str] = None
    agent_phone: Optional[str] = None
    agent_address: Optional[str] = None
    agent_languages: Optional[str] = None
    agent_specialty: Optional[str] = None

def parse_property_doc(doc):
    try:
        data = eval(doc.page_content)
    except Exception:
        return None
    location = Location(
        state=data.get("state"),
        city=data.get("city"),
        area=data.get("area")
    )
    prop = PropertyResult(
        title=data.get("title", ""),
        price=data.get("price"),
        bedrooms=data.get("bedrooms"),
        bathrooms=data.get("bathrooms"),
        location=location,
        description=data.get("description"),
        tags=data.get("tags"),
        rent_period=data.get("rent_period"),
        leasing_terms=data.get("leasing_terms"),
        amenities=data.get("amenities"),
        interior_features=data.get("interior_features"),
        exterior_features=data.get("exterior_features"),
        policy=data.get("policy"),
        availability_date=data.get("availability_date"),
        agent_name=data.get("agent_name"),
        agent_email=data.get("agent_email"),
        agent_phone=data.get("agent_phone"),
        agent_address=data.get("agent_address"),
        agent_languages=data.get("agent_languages"),
        agent_specialty=data.get("agent_specialty"),
    )
    return prop

def format_property_for_llm(prop: PropertyResult) -> str:
    location_str = ', '.join(filter(None, [prop.location.state, prop.location.city, prop.location.area])) or 'N/A'
    
    sentences = [
        f"This property is titled '{prop.title}' and is located in {location_str}.",
        f"The property is priced at ₦{prop.price or 'N/A'} and features {prop.bedrooms or 'N/A'} bedrooms and {prop.bathrooms or 'N/A'} bathrooms.",
        f"Description: {prop.description or 'N/A'}",
    ]
    
    if prop.rent_period:
        sentences.append(f"The rent period is {prop.rent_period}.")
    
    if prop.leasing_terms:
        sentences.append(f"Leasing terms: {prop.leasing_terms}.")
    
    if prop.tags:
        sentences.append(f"Property tags include: {prop.tags}.")
    
    if prop.amenities:
        sentences.append(f"Amenities available: {prop.amenities}.")
    
    if prop.interior_features:
        sentences.append(f"Interior features include: {prop.interior_features}.")
    
    if prop.exterior_features:
        sentences.append(f"Exterior features include: {prop.exterior_features}.")
    
    if prop.policy:
        sentences.append(f"Property policies: {prop.policy}.")
    
    if prop.availability_date:
        sentences.append(f"The property is available from {prop.availability_date}.")
    
    # Agent information
    if prop.agent_name:
        agent_info = [f"Agent: {prop.agent_name}"]
        if prop.agent_email:
            agent_info.append(f"Email: {prop.agent_email}")
        if prop.agent_phone:
            agent_info.append(f"Phone: {prop.agent_phone}")
        if prop.agent_address:
            agent_info.append(f"Address: {prop.agent_address}")
        if prop.agent_languages:
            agent_info.append(f"Languages: {prop.agent_languages}")
        if prop.agent_specialty:
            agent_info.append(f"Specialty: {prop.agent_specialty}")
        
        sentences.append(f"Contact information: {', '.join(agent_info)}.")
    
    return " ".join(sentences)

class RobustRAGSystem:
    def __init__(self):
        self.property_collection = property_collection
        self.web_collection = real_estate_info_collection

    def adaptive_retrieval(self, question: str) -> Tuple[List[Document], List[Document]]:
        docs_property = mongo_vector_search(question, self.property_collection, index_name="vector_index", k=2, full_docs=False)
        print(f"property: {docs_property}")
        docs_web = mongo_vector_search(question, self.web_collection, index_name="vector_index01", k=5, full_docs=True)
        print(f"web info: {docs_web}")
        # Exclude documents with score == 0.0
        docs_property = [doc for doc in docs_property if doc.metadata.get("score", 0.0) > 0.7]
        docs_web = [doc for doc in docs_web if doc.metadata.get("score", 0.0) > 0.65]
        
        return docs_property, docs_web
    
    def assess_context_quality(self, docs_property: List[Document], docs_web: List[Document]) -> ContextQuality:
        prop_scores = [d.metadata.get("score", 0.0) for d in docs_property]
        web_scores = [d.metadata.get("score", 0.0) for d in docs_web]
        avg_prop = sum(prop_scores) / len(prop_scores) if prop_scores else 0.0
        avg_web = sum(web_scores) / len(web_scores) if web_scores else 0.0
        total = len(docs_property) + len(docs_web)

        confidence = "low"
        if avg_prop + avg_web > 1.2:
            confidence = "high"
        elif avg_prop + avg_web > 0.6:
            confidence = "medium"

        return ContextQuality(
            property_relevant=avg_prop > 0.3,
            web_relevant=avg_web > 0.3,
            property_score=avg_prop,
            web_score=avg_web,
            total_docs=total,
            confidence_level=confidence
        )

    def create_robust_prompt(self, question: str, docs_property: List[Document], docs_web: List[Document], memory_context: str, summary: str, ai_history: str, context_quality: ContextQuality) -> str:
        def _format(doc, only_page_content=False):
            score = doc.metadata.get("score")
            if only_page_content:
                content = doc.page_content
                formatted = ""
                try:
                    if isinstance(content, str) and content.strip().startswith("{") and content.strip().endswith("}"):
                        d = eval(content)
                        formatted = d.get("page_content", "") if isinstance(d, dict) else content
                    else:
                        formatted = content
                except Exception:
                    formatted = content
                return f"[Confidence: {score:.2f}]\n{formatted}" if score else formatted
            else:
                prop = parse_property_doc(doc)
                if not prop:
                    return "Invalid property data."
                formatted = format_property_for_llm(prop)
                return f"[Confidence: {score:.2f}]\n{formatted}" if score else formatted

        property_context = "\n---\n".join(_format(d, only_page_content=False) for d in docs_property)
        web_context = "\n---\n".join(_format(d, only_page_content=True) for d in docs_web)
        print(f"prop: {property_context}")

        quality_note = ""
        if context_quality.confidence_level == "low":
            quality_note = "\n\nNOTE: Limited relevant information found. Provide general guidance and suggest rephrasing."
        elif context_quality.confidence_level == "medium":
            quality_note = "\n\nNOTE: Moderate context available. Acknowledge limitations in response."
        
        return f"""

You are a professional real estate AI assistant for Nigeria. Provide accurate, helpful responses based on available information.

RESPONSE GUIDELINES:
- Keep responses CONCISE and BRIEF to the point (aim for 1000 - 2000 words max)
- DO NOT mention sources information, Response head-on without stating the where you retrieve the information.
- Use bullet points for multiple options or steps
- Use **bold labels** like **Amenities**, etc., to make section headers more readable
- Focus on practical, actionable advice
- If information is limited, acknowledge this briefly and provide general guidance
- For property questions, focus on key details only
- For legal questions, provide essential information and recommend consulting professionals
- Maintain consistency with previous responses
- Always be helpful and professional

CONTEXT QUALITY: {quality_note}

USER MEMORY & HISTORY:
{memory_context}

CONVERSATION SUMMARY:
{summary}

PREVIOUS RESPONSES:
{ai_history}

RELEVANT PROPERTY LISTINGS:
{property_context}

RESPONSE GUIDELINES for property context:
- Use ALL information provided in the context, including tags, full descriptions, and all details
- Be comprehensive in your response, don't skip any relevant details
- Use **bold labels** like **Amenities**, **Policy**, **Interior features**, **Exterior features**, etc., to make section headers more readable
- If property tags are provided, include them in your response
- Ensure you mention all amenities, features, and policies listed

RELEVANT WEB INFO:
{web_context}

IMPORTANT: Keep your response brief and focused. If the available information doesn't directly answer the question, say so briefly and provide the best possible guidance based on what you know about Nigerian real estate.
(Do not include any explanations, introductions, or meta-text about what you're doing. Ignore saying Based on available information. Clearly response with ONLY available information text)
"""

# Global RAG system instance
rag_system = RobustRAGSystem()
