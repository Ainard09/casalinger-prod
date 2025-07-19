from math import comb
import os
import re
import random
import sqlite3
from typing import Annotated, List, Dict, Literal
from dotenv import load_dotenv
from typing_extensions import TypedDict
from pydantic import BaseModel, Field
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS, Chroma
from langgraph.checkpoint.memory import InMemorySaver
from redis_helper import redis_client
from langgraph.store.memory import InMemoryStore
from langgraph.prebuilt import create_react_agent
#from langmem import create_manage_memory_tool, create_search_memory_tool
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from sqlalchemy import text, inspect
from langgraph.graph import StateGraph, END, add_messages
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Float, DateTime,Text
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from langchain.schema import Document
from langchain_core.runnables.config import RunnableConfig
from settings import settings
import pandas as pd
import markdown2
import asyncio
import logging
from modules.memory_manager import get_memory_manager
from modules.enhanced_memory_manager import get_enhanced_memory_manager, MemoryEntry
from modules.enhanced_prompts import MEMORY_PERSONALIZATION_PROMPT
from rag_system import rag_system
from redis_helper import get_cached_ai_response, cache_ai_response, is_redis_available, store_semantic_cache, get_all_semantic_cache, cosine_similarity
import hashlib
import requests
from datetime import datetime
from redis_helper import get_cached_memory_retrieval, find_similar_cached_memory, find_similar_cached_memory_by_content, cache_memory_retrieval


# Configure logging
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)


embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# # Load property vector index (your database)
# property_vectorstore = FAISS.load_local(
#     "property_index",
#     embeddings=embedding_model,
#     allow_dangerous_deserialization=True
# )
# property_retriever = property_vectorstore.as_retriever(search_kwargs={"k": 5})

# Load web search RAG index
# web_vectorstore = Chroma(
#     persist_directory="websearch_index",
#     embedding_function=embedding_model
# )
# web_retriever = web_vectorstore.as_retriever(search_kwargs={"k": 3})


os.environ["GROQ_API_KEY"] =  settings.GROQ_API_KEY 

# Use Supabase database instead of SQLite
database_url = settings.SUPABASE_SQLALCHEMY_DATABASE_URI
engine = create_engine(database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Listing(Base):
    __tablename__ = 'listings'
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    price = Column(Float, nullable=False)
    state = Column(String(255), nullable=True)  
    city = Column(String(255), nullable=True)   
    area = Column(String(255), nullable=True)   
    bedrooms = Column(Integer, nullable=False)
    bathrooms = Column(Integer, nullable=False)
    image_paths = Column(String(300))
    # Optional video path
    video_path = Column(String(200), nullable=True)
    agent_id = Column(Integer, ForeignKey('agents.id'), nullable=False)
    created_at = Column(DateTime)

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]  
    intent: str
    intent_route: str
    sql_query: str
    query_result: str
    query_rows: list
    current_user: str
    current_user_id: str
    attempts: int
    relevance: str
    sql_error: bool
    summary: str
    memory_context: str
    listing_id: str
    agent_email: str
    viewing_data: dict
    awaiting_viewing_info: bool
    application_data: dict
    awaiting_application_info: bool
    semantic_memories: List[MemoryEntry]
    episodic_memories: List[MemoryEntry]
    procedural_memories: List[MemoryEntry]


def get_database_schema(engine):
    inspector = inspect(engine)
    schema = ""
    for table_name in inspector.get_table_names():
        schema += f"Table: {table_name}\n"
        for column in inspector.get_columns(table_name):
            col_name = column["name"]
            col_type = str(column["type"])
            if column.get("primary_key"):
                col_type += ", Primary Key"
            if column.get("foreign_keys"):
                fk = list(column["foreign_keys"])[0]
                col_type += f", Foreign Key to {fk.column.table.name}.{fk.column.name}"
            schema += f"- {col_name}: {col_type}\n"
        schema += "\n"
    print("Retrieved database schema.")
    return schema

class GetCurrentUser(BaseModel):
    current_user: str = Field(
        description="The name of the current user based on the provided user ID."
    )

def get_current_user(state: AgentState, config: RunnableConfig):
    print("Retrieving the current user based on user ID.")
    user_id = config["configurable"].get("current_user_id", None)
    state["current_user_id"] = str(user_id)
    if "messages" not in state:
        state["messages"] = []
        
    if not user_id:
        state["current_user"] = "User not found"
        print("No user ID provided in the configuration.")
        return state

    session = SessionLocal()
    try:
        user = session.query(User).filter(User.id == int(user_id)).first()
        if user:
            state["current_user"] = user.name
            print(f"Current user set to: {state['current_user']}")
        else:
            state["current_user"] = "User not found"
            print("User not found in the database.")
    except Exception as e:
        state["current_user"] = "Error retrieving user"
        print(f"Error retrieving user: {str(e)}")
    finally:
        session.close()
    return state

class HandleFollowUp(BaseModel):
    query: str = Field(
        description="A reformulated version of the user's follow-up question, ensuring it references prior responses correctly."
    )

def handle_follow_up(state: AgentState, config: RunnableConfig):
    def escape_braces(text):
        return text.replace("{", "{{").replace("}", "}}") if text else ""

    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message
    
    # Get recent conversation history from messages
    recent_messages = messages[-4:] if len(messages) > 4 else messages
    
    # Format conversation history from messages
    conversation_history = "\n".join([
        f"User: {escape_braces(msg.content)}" if isinstance(msg, HumanMessage)
        else f"AI: {escape_braces(msg.content)}" if isinstance(msg, AIMessage)
        else f"User: {escape_braces(str(msg))}" for msg in recent_messages
    ])
    
    current_user = state["current_user"]

    print(f"Handling follow-up question for user '{current_user}': {question}")

    system = f"""
    You are an AI assistant helping users find and give description of real estate listings. Do not greet on follow up questions and give short response.

    - The user has asked a follow-up question: "{question}"
    - Use the previous conversation to determine what they are referring to.

    Conversation History:
    {conversation_history}

    Reformulate the question so that it explicitly mentions any missing details (e.g., price, location, listing title, bedrooms, bathrooms). Note: Give brief details using the description column

    Special Instructions for Booking and Application:
    - If the user asks to book a viewing, tour, or inspection, or to apply for a property, rewrite the question to only identify the property (e.g., 'What is the title, id, and agent email of the second listing you mentioned earlier?').
    - Exclude booking, tour, inspection, or application intent from the rewritten question.
    - Do not mention booking, tour, inspection, or application in the rewritten question.

    Example User: Book a tour or inspection for the second listing you mentioned earlier.
    Rewritten: What is the title, id, and agent email of the (lookup into the {conversation_history} to gain more information on second listing you mentioned earlier)?
    Example User: I want to apply for Grarrison Homes.
    Rewritten: What is the title, id, and agent email of (lookup into the {conversation_history} to gain more information about Grarrison Homes)?
    Example User: Schedule an inspection for the property at 123 Main St.
    Rewritten: What is the title, id, and agent email of the (lookup into the {conversation_history} to gain more information on property at 123 Main St)?
    Note: Give brief response
    """

    follow_up_prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        ("human", f"Original Question: {question}\nRewrite it with missing details."),
    ])

    llm = ChatGroq(temperature=0, model_name=settings.TEXT_MODEL_NAME)
    rewriter = follow_up_prompt | llm | StrOutputParser()

    rewritten = rewriter.invoke({
        "question": question,
        "conversation_history": conversation_history
    })
    
    # Save the rewritten question to messages state so next node can use it
    rewritten_message = HumanMessage(content=rewritten)
    for msg in reversed(state["messages"]):
      if isinstance(msg, HumanMessage):
          msg.content = rewritten
          break
    
    print(f"Rewritten follow-up question: {rewritten}")

    # Use followup_classify_intent to determine routing
    route = followup_classify_intent(state, rewritten_message, state.get("relevance", "relevant"))
    print(f"Follow-up routed to: {route}")
    return state



class CheckRelevance(BaseModel):
    relevance: Literal["relevant", "follow_up", "not_relevant"] = Field(
        description="Classifies the user's question: 'relevant' for new property-related questions, 'follow_up' for referring to previous answers, or 'not_relevant' if unrelated to real estate."
    )

def check_relevance(state: AgentState, config: RunnableConfig):
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message
    intent = state["intent"]  # This comes from the classify_intent step
    schema = get_database_schema(engine)

    print(f"Checking relevance of the question: {question} with intent: {intent}")

    # Use intent to directly determine relevance where possible
    intent_to_relevance = {
        "structured_query": "relevant",
        "semantic_lookup": "relevant",
        "follow_up": "follow_up",
        "greeting": "not_relevant",
        "joke": "not_relevant"
    }

    if intent in intent_to_relevance:
        state["relevance"] = intent_to_relevance[intent]
        print(f"Relevance determined directly from intent: {state['relevance']}")
        return state

    # Fallback to LLM + keyword check
    follow_up_keywords = [
        "its description", "tell me more", "what about the price", "what are the details",
        "yes", "how many bedrooms", "can you elaborate", "more info", "when was the property posted"
    ]

    if any(keyword in question.lower() for keyword in follow_up_keywords):
        state["relevance"] = "follow_up"
        print(f"Relevance determined from keywords: {state['relevance']}")
        return state

    # Format conversation history from messages for LLM analysis
    recent_messages = messages[-4:] if len(messages) > 4 else messages
    conversation_history = "\n".join([
        f"User: {msg.content}" if isinstance(msg, HumanMessage)
        else f"AI: {msg.content}" if isinstance(msg, AIMessage)
        else f"User: {str(msg)}" for msg in recent_messages
    ])

    system = f"""
    You are an AI assistant checking if a question is relevant to real estate listings.

    Schema:
    {schema}

    Determine if the question:
    - Refers to a specific property from previous responses → 'follow_up'
    - Asks about new property listings → 'relevant'
    - Is unrelated to real estate → 'not_relevant'

    Conversation History:
    {conversation_history}

    Question: {question}
    """

    relevance_prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        ("human", "Classify the relevance of this question.")
    ])

    llm = ChatGroq(temperature=0, model_name=settings.TEXT_MODEL_NAME)
    classifier = relevance_prompt | llm | StrOutputParser()
    relevance = classifier.invoke({}).strip().lower()

    if relevance not in ["relevant", "follow_up", "not_relevant"]:
        relevance = "relevant"  # Default fallback

    state["relevance"] = relevance
    print(f"Relevance determined by LLM: {relevance}")
    return state

class SemanticResponse(BaseModel):
    answer: str = Field(
        description="The final user-facing answer generated from semantic search context."
    )


def vector_semantic_embedding(state: AgentState, config: RunnableConfig):
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message
    current_user = state.get("current_user")
    user_id = state.get("current_user_id")
    summary = state.get("summary", "")
    memory_context = state.get("memory_context", "")
    CACHE_EXPIRY = 1800

    # 1. Compute embedding for the question
    question_embedding = embedding_model.embed_query(question)

    # 2. Try semantic cache
    if is_redis_available():
        cache_entries = get_all_semantic_cache(user_id)
        best_score = 0
        best_answer = None
        for entry in cache_entries:
            cached_embedding = entry.get("embedding")
            if cached_embedding:
                score = cosine_similarity(question_embedding, cached_embedding)
                if score > best_score:
                    best_score = score
                    best_answer = entry.get("answer")
        if best_score > 0.85:  # Set your threshold here
            # Cache hit
            state["messages"].append(AIMessage(content=best_answer))
            state["query_result"] = best_answer
            return state

    # 3. If not found, run normal RAG+LLM
    # Get AI responses from recent messages
    recent_messages = messages[-6:] if len(messages) > 6 else messages
    ai_responses = [
        msg.content for msg in recent_messages 
        if isinstance(msg, AIMessage)
    ]
    combined_ai_history = "\n---\n".join(ai_responses) if ai_responses else ""

    docs_property, docs_web = rag_system.adaptive_retrieval(question)
    context_quality = rag_system.assess_context_quality(docs_property, docs_web)
    system_prompt = rag_system.create_robust_prompt(
        question, docs_property, docs_web, memory_context, summary, combined_ai_history, context_quality
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{question}")
    ])
    llm = ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0.3)
    chain = prompt | llm | StrOutputParser()
    rag_response = chain.invoke({"question": question})

    # 4. Store in semantic cache
    if is_redis_available():
        store_semantic_cache(user_id, question, question_embedding, rag_response, expiry=CACHE_EXPIRY)

    # Add conversation to messages state
    state["messages"].append(AIMessage(content=rag_response))
    state['awaiting_viewing_info'] = False
    state["query_result"] = rag_response
    return state


class ConvertToSQL(BaseModel):
    sql_query: str = Field(
        description="The SQL query corresponding to the user's natural language question."
    )

def convert_nl_to_sql(state: AgentState, config: RunnableConfig):
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message
    current_user = state["current_user"]
    schema = get_database_schema(engine)
    
    print(f"Converting question to SQL for user '{current_user}': {question}")
    system = """You are an assistant that converts natural language questions into SQL queries based on the following schema:

    {schema}
    
    ### Handling Simple and Complex Properties
    - The `listings` table contains general property information for both individual properties and property complexes.
    - The `units` table contains details for individual units within a complex property. Each unit has its own `bedrooms`, `bathrooms`, and price fields, and is linked to a listing via `units.listing_id = listings.id`.
    - When a user asks for properties with a specific number of bedrooms, bathrooms, or price, always check both the `listings` and `units` tables:
        - Use a `LEFT JOIN` between `listings` and `units` on `listings.id = units.listing_id`.
        - Filter for the requested criteria (e.g., bedrooms) in either table: `(listings.bedrooms = X OR units.bedrooms = X)`.
        - This ensures you return both individual properties and complex properties with matching units.
    - If both `listings` and `units` have the information, prefer the more specific value from `units`.

    - For property search queries, always add `ORDER BY RANDOM() LIMIT 10` to the SQL unless the user requests all results or a specific number. This ensures a random sample of up to 10 listings is returned each time, not always the same listings.

    Example:
    User: "I need duplex apartment at ikorodu. sql query: SELECT l.*, u.bedrooms, u.bathrooms, u.price_min, u.price_max FROM listings l LEFT JOIN units u ON l.id = u.listing_id WHERE l.city='Ikorodu' AND l.title LIKE '%duplex%' ORDER BY RANDOM() LIMIT 10
    Example 2: What are the details of the properties available for rent with 2 bedrooms at a price of N600,000.00 in Agric, Lagos? sql query: SELECT l.description, u.bedrooms, u.bathrooms, u.price_min, u.price_max FROM listings l LEFT JOIN units u ON l.id = u.listing_id WHERE (l.bedrooms=2 OR u.bedrooms=2) AND (l.price=600000.00 OR u.price_min=600000.00 OR u.price_max=600000.00) AND l.state='Lagos' AND l.area='Agric' ORDER BY RANDOM() LIMIT 10
    Use the {schema} to execute queries against the database.

    IMPORTANT LOCATION MAPPING RULES:
    - If a location matches one of these states: [Lagos, Ogun, Abuja], ALWAYS use l.state='StateName' in the SQL.
    - If a location matches one of these cities: [Ikeja, Ikorodu, Lekki, Epe, Eti-Osa], ALWAYS use l.city='CityName' in the SQL.
    - If a location does NOT match any state or city, use l.area='AreaName'. e.g If the user says 'Ebute' for area, use l.area='Ebute'.
    - For example: If the user says 'Epe', use l.city='Epe'. If the user says 'Ikorodu', use l.city='Ikorodu'.

    - For date filtering, use SQLite syntax. For example, to get listings posted in the last X days, use:
      created_at >= date('now', '-X days')
      Example: "Show me listings posted in the last 25 days" ->
      SELECT * FROM listings WHERE created_at >= date('now', '-25 days')

    - Use the `title` column with `LIKE` instead of `=` for better matches when handling follow-ups (e.g., price, description, bathrooms).
    - If filtering by price, ensure it is properly formatted as a float.
    - If filtering by bedrooms, cast it as an integer.
    - If user asks to sort by popularity, use the `interactions` table to count interactions per listing.  

    The `interactions` table has schema:  
    ["id", "user_id", "listing_id", "interaction_type", "created_at", "title", "state", "city", "area"].  
    The `interaction_type` column is a category with either 'view' or 'saved' value.

    ### Property Features
    When users ask about property features (e.g., swimming pool, gym, parking, security), search across these three columns:
    - `amenities` - General amenities like swimming pool, gym, parking, security, etc.
    - `interior_features` - Interior features like air conditioning, modern kitchen, etc.
    - `exterior_features` - Exterior features like garden, balcony, etc.
    
    Use `LIKE` with `%feature%` to search for features in these text columns.
    
    Example 4:
    User: "Let's explore apartments with swimming pool in Lekki"
    SQL Query: SELECT l.*, u.bedrooms, u.bathrooms, u.price_min, u.price_max FROM listings l LEFT JOIN units u ON l.id = u.listing_id WHERE l.city='Lekki' AND (l.amenities LIKE '%swimming pool%' OR l.interior_features LIKE '%swimming pool%' OR l.exterior_features LIKE '%swimming pool%' OR u.bedrooms IS NOT NULL)
    
    Example 5:
    User: "Show me properties with gym and parking in Lagos"
    SQL Query: SELECT l.*, u.bedrooms, u.bathrooms, u.price_min, u.price_max FROM listings l LEFT JOIN units u ON l.id = u.listing_id WHERE l.state='Lagos' AND ((l.amenities LIKE '%gym%' OR l.interior_features LIKE '%gym%' OR l.exterior_features LIKE '%gym%') AND (l.amenities LIKE '%parking%' OR l.interior_features LIKE '%parking%' OR l.exterior_features LIKE '%parking%'))
    
    Example 6:
    User: "Find 3-bedroom apartments with air conditioning in Ikeja"
    SQL Query: SELECT l.*, u.bedrooms, u.bathrooms, u.price_min, u.price_max FROM listings l LEFT JOIN units u ON l.id = u.listing_id WHERE (l.bedrooms=3 OR u.bedrooms=3) AND l.city='Ikeja' AND (l.amenities LIKE '%air conditioning%' OR l.interior_features LIKE '%air conditioning%' OR l.exterior_features LIKE '%air conditioning%')

    Example 3:
    User: "What is the description of the Sholz apartment, a 4-bedroom property, available in Idimu, Ikorodu, Lagos?"
    SQL Query: SELECT l.description, u.bedrooms, u.bathrooms, u.price_min, u.price_max FROM listings l LEFT JOIN units u ON l.id = u.listing_id WHERE l.title LIKE '%Sholz apartment%' AND l.city='Ikorodu' AND (l.bedrooms=4 OR u.bedrooms=4) AND l.state='Lagos' AND l.area='Idimu' 
    
    ### Popularity 
    Example 1:
    User: "Give me 2 beds in Lagos state by sorting them by most popular"  
    SQL Query:
    SELECT l.*, u.bedrooms, u.bathrooms, u.price_min, u.price_max, COUNT(i.id) AS popularity_score
    FROM listings l
    LEFT JOIN units u ON l.id = u.listing_id
    LEFT JOIN interactions i ON l.id = i.listing_id
    WHERE (l.bedrooms = 2 OR u.bedrooms = 2) AND l.state = 'Lagos'
    GROUP BY l.id, u.id
    ORDER BY popularity_score DESC;

    Example 2:
    User: "List 3-bedroom apartments in Ikeja sorted by popularity. Saved listings are more important than views."
    SQL Query:
    SELECT l.*, u.bedrooms, u.bathrooms, u.price_min, u.price_max, SUM(CASE WHEN i.interaction_type = 'saved' THEN 2 WHEN i.interaction_type = 'view' THEN 1 ELSE 0 END) AS popularity_score
    FROM listings l
    LEFT JOIN units u ON l.id = u.listing_id
    LEFT JOIN interactions i ON l.id = i.listing_id
    WHERE (l.bedrooms = 3 OR u.bedrooms = 3) AND l.city = 'Ikeja'
    GROUP BY l.id, u.id
    ORDER BY popularity_score DESC;
    """.format(schema=schema)
    convert_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            ("human", "Question: {question}"),
        ]
    )
    llm = ChatGroq(temperature=0,model_name=settings.TEXT_MODEL_NAME)
    structured_llm = llm.with_structured_output(ConvertToSQL)
    sql_generator = convert_prompt | structured_llm
    result = sql_generator.invoke({"question": question})
    state["sql_query"] = result.sql_query
    print(f"Generated SQL query: {state['sql_query']}")
    return state

def execute_sql(state: AgentState):
    sql_query = state["sql_query"].strip()
    session = SessionLocal()
    print(f"Executing SQL query: {sql_query}")

    try:
        result = session.execute(text(sql_query))
        if sql_query.lower().startswith("select"):
            rows = result.fetchall()
            columns = result.keys()

            if rows:
                state["query_rows"] = [dict(zip(columns, row)) for row in rows]

                # Single value (e.g. AVG(price))
                if len(columns) == 1 and len(rows) == 1:
                    first_result = rows[0][0]
                    if isinstance(first_result, (int, float)):
                        state["query_result"] = f"The result is ₦{first_result:,.2f}".replace("{", "{{").replace("}", "}}")
                    else:
                        safe_result = f"The result is {first_result if first_result is not None else 'No data'}"
                        state["query_result"] = safe_result.replace("{", "{{").replace("}", "}}")
                else:
                    # Rank listings by user preferences and keep only top 10
                    preferences = extract_preferences_from_context(
                        state["messages"][-2:],
                        state.get("summary", ""),
                        state.get("memory_context", "")
                    )
                    ranked = rank_listings_by_preferences(state["query_rows"], preferences)
                    state["query_rows"] = ranked[:10]
                    summaries = []
                    for row in state["query_rows"]:
                        parts = [
                            f"<strong>{col.replace('_', ' ').title()}:</strong> {row[col]}"
                            for col in columns if row[col] is not None and col != 'url'
                        ]
                        if row.get('url'):
                            parts.append(f" <a href= '{row['url']}' target='_blank' style='color:#0d6efd;'> View listing </a>")
                        summaries.append("<br>".join(parts))
                    state["query_result"] = "<br><br>".join(summaries).replace("{", "{{").replace("}", "}}")
                    

            else:
                state["query_result"] = "No results found."

            state["sql_error"] = False
            print("SQL SELECT query executed successfully.")
        else:
            session.commit()
            state["query_result"] = "The action has been successfully completed."
            state["sql_error"] = False
            print("SQL command executed successfully.")
    except Exception as e:
        state["query_result"] = "Error executing SQL query: " + str(e)
        state["sql_error"] = True
        print(f"Error executing SQL query: {str(e)}")
    finally:
        session.close()

    return state


def convert_markdown_links_to_html(text):
    # Converts only [text](url) to <a href="url" target="_blank" rel="noopener noreferrer">text</a>
    return re.sub(
        r'\[([^\]]+)\]\(([^)]+)\)',
        r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>',
        text
    )

def generate_human_readable_answer(state: AgentState, config: RunnableConfig):
    def safe_for_fstring(text):
        return text.replace("{", "{{").replace("}", "}}") if text else ""

    sql = state["sql_query"]
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message
    result = state["query_result"]
    current_user = state["current_user"]
    query_rows = state.get("query_rows", [])
    sql_error = state.get("sql_error", False)
    summary = state.get("summary", "")
    memory_context = state.get("memory_context", "")

    greeting = f"Hello {current_user}, " if not messages else ""

    response_intros = [
        f"{greeting}These listings match your request:",
        f"{greeting}Here's what I found for you:",
        f"{greeting}Take a look at these options:",
        f"{greeting}I've pulled up a few listings you might like:"
    ]

    intro_line = random.choice(response_intros)

    sql_safe = safe_for_fstring(sql)
    result_safe = safe_for_fstring(result)

    # Format conversation history from messages
    recent_messages = messages[-4:] if len(messages) > 4 else messages
    conversation_history = "\n".join([
        f"User: {msg.content}" if isinstance(msg, HumanMessage) else f"AI: {msg.content}" 
        for msg in recent_messages
    ])
    conversation_safe = safe_for_fstring(conversation_history)
    summary_safe = safe_for_fstring(summary)
    memory_safe = safe_for_fstring(memory_context)

    system = f"""You are an assistant that converts SQL query results into clear, natural language responses.
    Use all provided information, including prior memory and summary, to personalize your answer.
    Never mention SQL, summaries, or memory context explicitly.

    Context:
    - Summary: {summary_safe}
    - Long-Term Memory: {memory_safe}
    - Recent Conversation: {conversation_safe}

    Response Guidelines:
    - Number listings if multiple (e.g., "1.", "2.")
    - Use bullet points for a single listing.
    - Include markdown links for URLs: [View listing](https://example.com/listing/1)
    - Never show raw SQL.
    - Always be helpful, concise, and professional.

    RESPONSE GUIDES:
    User: Show me 2-bedroom apartments in Lagos.
    AI response:
    1. **Gbenga Apartment**, a 2-bedroom property, is available for rent at **₦900,000.00** in Agric, Lagos. [View listing](https://example.com/listing/1)
    2. **Ola Heights**, a 2-bedroom property, is available for **₦1,200,000.00** in Ikorodu, Lagos. [View listing](https://example.com/listing/2)

    Ask the user if they would like to know more.
    """

    if sql_error:
        generate_prompt = ChatPromptTemplate.from_messages([
            ("system", system),
            ("human", f"{greeting}There was an error processing your request.\n\nSQL Query:\n{sql_safe}\n\nResult:\n{result_safe}\n\nKindly explain the issue clearly.")
        ])
    elif sql.lower().startswith("select"):
        if not query_rows:
            generate_prompt = ChatPromptTemplate.from_messages([
                ("system", system),
                ("human", f"{greeting}Unfortunately, I couldn't find any listings matching your request.\n\nPlease let me know if you'd like to search again.")
            ])
        else:
            generate_prompt = ChatPromptTemplate.from_messages([
                ("system", system),
                ("human", f"{intro_line}\n\n{result_safe}\n\nWould you like to see more options?")
            ])
    else:
        generate_prompt = ChatPromptTemplate.from_messages([
            ("system", system),
            ("human", f"{greeting}Your request has been processed successfully.\n\nWould you like help with anything else?")
        ])

    llm = ChatGroq(temperature=0, model_name=settings.TEXT_MODEL_NAME)
    chain = generate_prompt | llm | StrOutputParser()
    answer = chain.invoke({})

    # Add conversation to messages state
    state["messages"].append(AIMessage(content=answer))
    state["query_result"] = convert_markdown_links_to_html(answer)
    state['awaiting_viewing_info'] = False
    print(f"summary content:\n{summary}")
    print("Generated human-readable answer.")
    print(state)
    return state


class RewrittenQuestion(BaseModel):
    question: str = Field(description="The rewritten question.")

def regenerate_query(state: AgentState):
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message
    print("Regenerating the SQL query by rewriting the question.")
    system = """You are an assistant that reformulates an original question to enable more precise SQL queries. Ensure that all necessary details, such as table joins, are preserved to retrieve complete and accurate data.
    """
    rewrite_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                f"Original Question: {question}\nReformulate the question to enable more precise SQL queries, ensuring all necessary details are preserved.",
            ),
        ]
    )
    llm = ChatGroq(temperature=0,model_name=settings.TEXT_MODEL_NAME)
    structured_llm = llm.with_structured_output(RewrittenQuestion)
    rewriter = rewrite_prompt | structured_llm
    rewritten = rewriter.invoke({})
    # Replace the latest HumanMessage with the rewritten question
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            msg.content = rewritten  # Replace the content
            break
    state["attempts"] += 1
    print(f"Rewritten question: {rewritten.question}")
    return state

def generate_greeting_response(state: AgentState):
    user_name = state.get("current_user", "User")
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message.strip().lower()
    
    print("#-----------------------#")
    print("Chat history length:", len(messages))
    print("Last message:", messages[-1] if messages else "None")

    system_message = """You are Moji, a helpful and engaging real estate AI assistant for the CasaLinger platform. Greet the user '{user_name}' by name in your response. If the user's question isn't related to the listing properties, politely ask how you can assist the user
    - Example: Hello, Azeez! I'm Moji, your CasaLinger assistant. How can I assist you today? If you have any questions or need help with find listing properties, feel free to ask!.""".format(user_name=user_name)

    if question in ["hello", "hi", "hey", "how are you", "morning"]:
        human = f"Greet {user_name} with a friendly welcome."
    else:
        human = f"The user '{user_name}' said '{question}'. Respond politely, asking how you can help. Keep your response concise and short"

    generate_prompt = ChatPromptTemplate.from_messages([
        ("system", system_message),
        ("human", human),
    ])
    
    llm = ChatGroq(temperature=0.4, model_name=settings.TEXT_MODEL_NAME)
    polite_response = generate_prompt | llm | StrOutputParser()
    response_message = polite_response.invoke({})
    state["query_result"] = response_message

    # Add conversation to messages state
    state["messages"].append(AIMessage(content=response_message))

    print("Generated greeting response")
    return state

def generate_funny_response(state: AgentState):
    print("Generating a funny response for an unrelated question.")
    system = """You are a charming and funny assistant who responds in a playful manner.
    """
    human_message = "I can not help with that, but wouldn't you like to know about the landscape of our listings properties in your area? Create a humorous response while being helpful. make it short and concise!"
    funny_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            ("human", human_message),
        ]
    )
    llm = ChatGroq(temperature=0.7,model_name=settings.TEXT_MODEL_NAME)
    funny_response = funny_prompt | llm | StrOutputParser()
    message = funny_response.invoke({})
    state["query_result"] = message
    print("Generated funny response.")
    return state

def conversational_agent(state: AgentState, config: RunnableConfig):
    user_name = state.get("current_user", "there")
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message

    summary = state.get("summary", "")
    memory_context = state.get("memory_context", "")
    
    # Format conversation history from messages
    recent_messages = messages[-8:] if len(messages) > 8 else messages
    past_messages = "\n".join([
        f"{'User' if isinstance(msg, HumanMessage) else 'AI'}: {msg.content}" 
        for msg in recent_messages
    ])

    # First classify the query
    classification_prompt = ChatPromptTemplate.from_messages([
        ("system", 
         f"""You are a smart AI assistant. Classify whether the user's latest message requires structured processing (like If the user expresses intent in real estate related to listings, locations, prices, apartments or Casalinger platform itself etc.) or is just conversational.

If the user's question has to do with real estate-related queries, consider it to be structured. Leave greetings, preferences, or identity questions as conversational.

If the previous conversation shows the agent is waiting for booking information (for example, the last AI message was a prompt asking for details like name, email, phone, date, or time), and the user's message contains personal or contact information, treat this as a structured (not conversational) message.

Examples:
- what do you know about casalinger → structured
- what's the relationship between landlords and tenants → structured
- Book an inspection this property → structured
- what is my name → conversational
- AI: To book a viewing, could you provide your information in this order: ...
- User: Jane Doe, jane@email.com, 08012345678, 2024-07-01, 10:00, 2024-07-02, 11:00, I need wheelchair access. → structured

Respond with one of:
- structured
- conversational

Conversation history:
{past_messages}
"""),
        ("human", question)
    ])

    llm = ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0)
    classification = (classification_prompt | llm | StrOutputParser()).invoke({}).strip().lower()
    if classification not in ["structured", "conversational"]:
        classification = "conversational"
    state["intent_route"] = classification

    # If conversational, respond
    if classification == "conversational":
        system_parts = [
            "You are Moji, a helpful and engaging real estate AI assistant for the CasaLinger real estate platform.",
            "Respond using friendly, natural language.",
            "Use memory and summary naturally to personalize your response.",
            f"If user's name is present in memory context, use it! If name does not exist in memory context then use {user_name}.",
        ]

        if memory_context:
            system_parts.append("Here are relevant facts and preferences about the user:\n" + memory_context)

        if summary:
            system_parts.append("Summary of the conversation so far:\n" + summary)

        system_parts.append("Conversation so far:\n" + past_messages)

        system_parts.append("""
        If the user greets you, politely ask how you can assist them with real estate. Example:
        Q: hey
        AI: Hello, Azeez! I'm Moji, your CasaLinger assistant. How can I assist you today? If you have any questions or need help finding properties, feel free to ask!
                """)
        
        # Get type-specific memories for personalization
        semantic_memories = state.get("semantic_memories", [])
        procedural_memories = state.get("procedural_memories", [])
        
        # Format memories for personalization
        user_memories = []
        if semantic_memories:
            user_memories.extend([f"Preference: {m.content}" for m in semantic_memories])
        if procedural_memories:
            user_memories.extend([f"Interaction style: {m.content}" for m in procedural_memories])
        
        user_memories_text = "\n".join(user_memories) if user_memories else "No specific memories available"
        
        # Generate initial response
        full_system_prompt = "\n\n".join(system_parts)
        initial_prompt = ChatPromptTemplate.from_messages([
            ("system", full_system_prompt),
            ("human", question)
        ])
        initial_response = (initial_prompt | ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0.5) | StrOutputParser()).invoke({})
        
        # Personalize the response using memories
        personalization_prompt = ChatPromptTemplate.from_messages([
            ("system", MEMORY_PERSONALIZATION_PROMPT),
            ("human", "Personalize this response")
        ])
        
        personalized_response = (personalization_prompt | ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0.3) | StrOutputParser()).invoke({
            "user_memories": user_memories_text,
            "original_response": initial_response
        })
        
        response = personalized_response

        # Add conversation to messages state
        state["messages"].append(AIMessage(content=response))
        state["query_result"] = response
        state['awaiting_viewing_info'] = False
        print(state)

    return state


class FollowupIntentRoute(BaseModel):
    route: str = Field(description="Must be one of: structured_query, semantic_lookup")

def followup_classify_intent(state: AgentState, question: str, relevance: str) -> str:
    messages = state.get("messages", [])
    recent_messages = messages[-4:] if len(messages) > 4 else messages
    # Define the system prompt for classifying intent
    prompt = ChatPromptTemplate.from_messages([
        ("system", 
        """You are an assistant that classifies the user's intent based on their question.

    Choose one of the following routes:
    - structured_query: The user is asking about specific filters like price, bedrooms, location (ideal for SQL).
    - semantic_lookup: The user is asking something less structured or ambiguous, best handled by vector semantic retrieval.

    If users use `did you` in its question to refrence to previous question, answer clearly with affirmation, Yes or No with briefly reason for response.

    Examples:
    Q: Give me similar 2 bedrooms apartment in Alausa area you mentioned earlier → structured_query  
    Q: What do you know about the Sholz apartment? → semantic_lookup  
    Q: What is the safety insight of the area? → semantic_lookup  
    Q: What is the bedrooms demand trend in Ikeja? → semantic_lookup  
    Q: Which area in Ikeja can i get cheap within the range of 500000? → semantic_lookup 
    Q: Did you prioritize saved listings over views in your previous response about 2-bedroom apartments in Ikeja, with 1-2 bathrooms), sorted by popularity, considering factors like price (₦1,000,000.00 - ₦3,000,000.00), location (Maryland, Allen, Oregun), and listing title (Graceland Homes, Embassy Cool Spot Homes, Goodwill Apartment)  → semantic_lookup  

    User question: {question} 
    previous conversations: {history} 
    Relevance: {relevance}  
    Answer with one of the route names only."""),
        ("human", "{question}")
    ])

    # Run the classifier chain with the question and relevance
    classifier_chain = prompt | ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0).with_structured_output(FollowupIntentRoute)
    result = classifier_chain.invoke({
        "question": question,
        "relevance": relevance,
        "history": recent_messages  # This is passed correctly for template use
    })

    route = result.route  # This will be one of the possible routes (structured_query, semantic_lookup)
    state["intent"] = route 
    return route

class IntentRoute(BaseModel):
    route: str = Field(description="Must be one of: structured_query, semantic_lookup, joke, follow_up, orchestration, book_property_viewing, submit_property_application")


# Main intent classification function
def classify_intent(state: AgentState, question: str, relevance: str) -> str:
    messages = state.get("messages", [])
    recent_messages = messages[-4:] if len(messages) > 4 else messages
    conversation_history = "\n".join([
        f"User: {msg.content}" if isinstance(msg, HumanMessage) else f"AI: {msg.content}" 
        for msg in recent_messages
    ])

    follow_up_keywords = [
        "its description", "tell me more", "what about the price", "what are the details", "yes", "how many bedrooms", "can you elaborate"
    ]
    booking_keywords = [
        "book a viewing", "book viewing", "book an inspection" "schedule a tour", "schedule viewing", "book tour", "schedule inspection", "arrange viewing", "arrange inspection"
    ]
    application_keywords = [
        "apply for", "submit application", "property application", "rental application", "apply to rent", "submit my application", 
    ]
    
    # Check if the question contains booking keywords
    if any(kw in question.lower() for kw in booking_keywords):
        state["intent"] = "book_property_viewing"
        return "book_property_viewing"
    
    # Check if the question contains application keywords
    if any(kw in question.lower() for kw in application_keywords):
        state["intent"] = "submit_property_application"
        return "submit_property_application"
    # Check if the question contains follow-up keywords
    if any(keyword in question for keyword in follow_up_keywords):
        state["intent"] = "follow_up"  # Set the intent to follow_up if keywords match
        return "follow_up"
    # Define the system prompt for classifying intent
    prompt = ChatPromptTemplate.from_messages([
        ("system", 
        """You are an assistant that classifies the user's intent based on their question.

    Choose one of the following routes:
    - structured_query: The user is asking about specific filters like price, bedrooms, location (ideal for SQL).
    - semantic_lookup: The user is asking something less structured or ambiguous, best handled by vector retrieval.
    - joke: The user is asking for humor.
    - follow_up: The user is following up on a previous query. Use the conversation history as context to determine if the query is follow up from previous conversations with user.
    - orchestration: The user is asking multiple things in a single message (multi-intent), requiring the system to split and handle each part separately (e.g., property search + area insight).
    - book_property_viewing: The user wants to book a property viewing, schedule a tour, or inspection.
    If the previous conversation history shows the agent is waiting for booking information (for example, the last AI message was a prompt asking for details like name, email, phone, date, or time), and the user's message contains personal or contact information, treat this as a continuation of the booking flow and route to book_property_viewing.
    If the user's message is a direct request to book, schedule, or arrange a viewing, tour, or inspection, also route to book_property_viewing.

    BOOKING FLOW EXAMPLES:
    Q: Book a viewing for Grarrison Homes → book_property_viewing
    AI: To book a viewing, could you provide your information in this order: full name, email address, phone number, preferred date for inspection, preferred time for inspection, alternative date (optional), alternative time (optional), and special requirements (optional)?
    Q: Jane Doe, jane@email.com, 08012345678, 2024-07-01, 10:00, 2024-07-02, 11:00, I need wheelchair access. → book_property_viewing
    Q: Schedule an inspection for the second property → book_property_viewing
    Q: I want to arrange a tour for the flat at 123 Main St. → book_property_viewing

    APPLICATION FLOW EXAMPLES:
    Q: Apply for a property → submit_property_application
    AI: To apply for a property, could you provide your information in this order: "full name, email address, phone number, monthly income, employment status, preferred move-in date, and lease duration (in months)?
    Q: Jane Doe, jane@email.com, 08012345678, 300,000, employed, 2024-07-02, 12 → submit_property_application
    Q: Submit an application for the second property → submit_property_application
    Q: application request for the flat at 123 Main St. → submit_property_application

    Conversation history:
    {conversation_history}

    General Examples:
    Q: I need a 3 bedroom flat in Ikeja under 1 million → structured_query  
    Q: I need 2 beds in Lekki → structured_query  
    Q: What do you know about the Sholz apartment? → semantic_lookup 
    Q: Places to rent affordable apartment in abuja  → semantic_lookup
    Q: Which area in Ikeja can i get cheap within the range of 500000? → semantic_lookup 
    Q: Tell me something funny → joke  
    Q: What about the second listing? → follow_up  
    Q: Show me 2 beds in Ikeja and tell me about the safety of this area → orchestration

    User question: {question}  
    Relevance: {relevance}  
    Answer with one of the route names only."""),
        ("human", "{question}")
    ])

    # Run the classifier chain with the question and relevance
    classifier_chain = prompt | ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0).with_structured_output(IntentRoute)
    result = classifier_chain.invoke({
        "question": question,
        "conversation_history": conversation_history,
        "relevance": relevance  # This is passed correctly for template use
    })

    route = result.route  # This will be one of the possible routes (structured_query, semantic_lookup, joke, follow_up, orchestration, book_property_viewing)
    state["intent"] = route  # Store the result in the state
    print(f"Check route: {route}")
    return route


def end_max_iterations(state: AgentState):
    state["query_result"] = (
        "Sorry, I couldn't find an answer to your question after several tries. "
        "Please try rephrasing your question or ask about something else!"
    )
    print("Maximum attempts reached. Ending the workflow.")
    return state

def classifier_intent(state: AgentState, config: RunnableConfig):
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message
    relevance = state.get("relevance", "relevant")  # Use "relevant" as fallback if relevance is missing

    route = classify_intent(state, question, relevance)
    state["intent"] = route
    return state
def classifier_router(state: AgentState) -> str:
    # 1. Deterministic: If slot-filling is in progress, always route to appropriate handler
    if state.get("awaiting_viewing_info"):
        return "book_property_viewing"
    elif state.get("awaiting_application_info"):
        return "submit_property_application"
    # 2. Otherwise, use LLM-classified intent
    intent_route = state.get("intent", "")
    if intent_route == "follow_up":
        return "handle_follow_up"
    elif intent_route == "structured_query":
        return "convert_to_sql"
    elif intent_route == "semantic_lookup":
        return "vector_semantic_embedding"
    elif intent_route == "orchestration":
        return "orchestrate_tools"
    elif intent_route == "joke":
        return "generate_funny_response"
    elif intent_route == "book_property_viewing":
        return "book_property_viewing"
    elif intent_route == "submit_property_application":
        return "submit_property_application"
    else:
        return "generate_human_readable_answer"

    
def check_attempts_router(state: AgentState):
    if state["attempts"] < 3:
        return "convert_to_sql"
    else:
        return "end_max_iterations"

def execute_sql_router(state: AgentState):
    if not state.get("sql_error", False):
        return "generate_human_readable_answer"
    else:
        return "regenerate_query"




def memory_injection_node(state: AgentState):
    """Retrieve and inject relevant memories based on recent conversation context."""
    user_id = state.get("current_user_id")
    memory_manager = get_enhanced_memory_manager(user_id)

    # Extract only the latest user message for context to ensure consistent caching
    messages = state.get("messages", [])
    recent_context = ""
    
    if messages:
        # Find the latest user message
        for msg in reversed(messages):
            if hasattr(msg, 'type') and msg.type == "human":
                recent_context = msg.content.strip()
                break
        
        # If no user message found, fall back to the last message
        if not recent_context:
            recent_context = messages[-1].content.strip() if messages else ""
    
    # Check for cached memory retrieval first
    cached_memories = get_cached_memory_retrieval(user_id, recent_context)
    
    if cached_memories:
        # Use cached memories
        state["semantic_memories"] = cached_memories.get("semantic_memories", [])
        state["episodic_memories"] = cached_memories.get("episodic_memories", [])
        state["procedural_memories"] = cached_memories.get("procedural_memories", [])
        memory_context = cached_memories.get("memory_context", "")
        state["memory_context"] = memory_context
        return state
    
    # TIER 2: Check for similar cached memories (question-to-question similarity)
    similar_cached = find_similar_cached_memory(user_id, recent_context, similarity_threshold=0.7)
    
    if similar_cached:
        # Use similar cached memories
        state["semantic_memories"] = similar_cached.get("semantic_memories", [])
        state["episodic_memories"] = similar_cached.get("episodic_memories", [])
        state["procedural_memories"] = similar_cached.get("procedural_memories", [])
        memory_context = similar_cached.get("memory_context", "")
        state["memory_context"] = memory_context
        return state
    
    # TIER 3: Check for similar cached memories by content (question-to-memory-content similarity)
    similar_by_content = find_similar_cached_memory_by_content(user_id, recent_context, similarity_threshold=0.7)
    
    if similar_by_content:
        # Use similar cached memories by content
        state["semantic_memories"] = similar_by_content.get("semantic_memories", [])
        state["episodic_memories"] = similar_by_content.get("episodic_memories", [])
        state["procedural_memories"] = similar_by_content.get("procedural_memories", [])
        memory_context = similar_by_content.get("memory_context", "")
        state["memory_context"] = memory_context
        return state

    # TIER 4: No cache hit, retrieve from Qdrant
    
    # Search for relevant memories by type
    semantic_memories = memory_manager.get_relevant_memories(recent_context, ["semantic"])
    episodic_memories = memory_manager.get_relevant_memories(recent_context, ["episodic"])
    procedural_memories = memory_manager.get_relevant_memories(recent_context, ["procedural"])

    # Store memories by type in state for type-specific access
    state["semantic_memories"] = semantic_memories
    state["episodic_memories"] = episodic_memories
    state["procedural_memories"] = procedural_memories

    # Combine all memories and format for prompt injection
    all_memories = semantic_memories + episodic_memories + procedural_memories
    memory_context = memory_manager.format_memories_for_prompt(all_memories)

    # Inject into state so other nodes can use it
    state["memory_context"] = memory_context
    
    # Cache the memory retrieval results - store only user question and memory content
    memories_data = {
        "user_question": recent_context,  # Store the user's question
        "semantic_memories": semantic_memories,
        "episodic_memories": episodic_memories,
        "procedural_memories": procedural_memories,
        "memory_context": memory_context,
        "timestamp": datetime.now().isoformat()
    }
    cache_memory_retrieval(user_id, recent_context, memories_data, expiry=1800)  # 30 minutes
    
    return state

def summarize_conversation_node(state: AgentState):
    """Summarize the conversation so far between the AI and the user."""
    model = ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0)
    summary = state.get("summary", "")
    messages = state.get("messages", [])
    recent = messages[-2:] if len(messages) >= 2 else messages
    
    # Build formatted conversation from messages
    formatted_history = "\n".join([
        f"{'User' if isinstance(msg, HumanMessage) else 'AI'}: {msg.content}" 
        for msg in recent
    ])

    if summary:
        prompt = (
            f"This is a summary of the previous conversation between the assistant and the user:\n\n"
            f"{summary}\n\n"
            "Extend the summary by taking into account the new messages below:\n"
            f"{formatted_history}"
        )
    else:
        prompt = (
            "Create a short but informative summary of the conversation below between a real estate assistant and a user. "
            "Capture all relevant personal context, preferences, and details that may help the assistant in future turns:\n\n"
            f"{formatted_history}"
        )

    response = model.invoke([HumanMessage(content=prompt)])
    
    # Store the updated summary
    state["summary"] = response.content
    state["messages"] = messages[-settings.TOTAL_MESSAGES_AFTER_SUMMARY:] if len(messages) >= settings.TOTAL_MESSAGES_AFTER_SUMMARY else messages
    
    # Extract memory from the user's current message and store it if important
    user_id = state.get("current_user_id")
    if user_id:
        # Get the latest user message for memory extraction
        latest_user_message = None
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                latest_user_message = msg.content
                break
        
        if latest_user_message:
            question = latest_user_message.strip()
            if question:
                # Wrap the plain string in a LangChain-style BaseMessage
                message = HumanMessage(content=question)
                memory_manager = get_enhanced_memory_manager(user_id)

                # Extract and store the memory
                memory_manager.extract_and_store_memories(message)
                print("Enhanced Memory Extraction Completed")
        
        # Run efficient memory cleanup every 10 conversations (no LLM calls)
        conversation_count = len(messages)
        if conversation_count % 10 == 0:
            try:
                # Use the existing cleanup_old_memories method from enhanced_vector_store
                deleted_count = memory_manager.vector_store.cleanup_old_memories(max_age_days=90, min_importance=0.3)
                if deleted_count > 0:
                    print(f"Memory cleanup: deleted {deleted_count} old, low-importance memories for user {user_id}")
            except Exception as e:
                print(f"Memory cleanup failed for user {user_id}: {e}")
    
    return state

saver = InMemorySaver()
 
def langchain_bot(query: str, user_id: str):
  
    user_message = HumanMessage(content=query)
    
    workflow = StateGraph(AgentState)

    # Core memory & summarization nodes
    workflow.add_node("get_current_user", get_current_user)
    workflow.add_node("memory_injection", memory_injection_node)
    workflow.add_node("summarize_conversation", summarize_conversation_node)

    # All functional nodes
    workflow.add_node("conversational_agent", conversational_agent)
    workflow.add_node("classifier_intent", classifier_intent)
    workflow.add_node("handle_follow_up", handle_follow_up)
    workflow.add_node("convert_to_sql", convert_nl_to_sql)
    workflow.add_node("execute_sql", execute_sql)
    workflow.add_node("generate_human_readable_answer", generate_human_readable_answer)
    workflow.add_node("regenerate_query", regenerate_query)
    workflow.add_node("vector_semantic_embedding", vector_semantic_embedding)
    workflow.add_node("generate_funny_response", generate_funny_response)
    workflow.add_node("end_max_iterations", end_max_iterations)
    workflow.add_node("orchestrate_tools", orchestrate_tools)
    workflow.add_node("book_property_viewing", book_property_viewing)
    workflow.add_node("submit_property_application", submit_property_application)

    # Flow entry and memory setup
    workflow.set_entry_point("get_current_user")
    workflow.add_edge("get_current_user", "memory_injection")
    workflow.add_edge("memory_injection", "conversational_agent")

    # Conversational routing
    workflow.add_conditional_edges(
        "conversational_agent",
        lambda state: state.get("intent_route", "conversational"),
        {
            "structured": "classifier_intent",
            "conversational": "summarize_conversation",
        },
    )

    # Classifier routing
    workflow.add_conditional_edges(
        "classifier_intent",
        classifier_router,
        {
            "convert_to_sql": "convert_to_sql",
            "vector_semantic_embedding": "vector_semantic_embedding",
            "orchestrate_tools": "orchestrate_tools",
            "generate_funny_response": "generate_funny_response",
            "handle_follow_up": "handle_follow_up",
            "generate_human_readable_answer": "generate_human_readable_answer",
            "book_property_viewing": "book_property_viewing",
            "submit_property_application": "submit_property_application",
        },
    )

    workflow.add_conditional_edges(
        "handle_follow_up",
        lambda state: state["intent"],
        {
            "structured_query": "convert_to_sql",
            "semantic_lookup": "vector_semantic_embedding"
        }
    )

    workflow.add_edge("convert_to_sql", "execute_sql")

    workflow.add_conditional_edges(
        "execute_sql",
        execute_sql_router,
        {
            "generate_human_readable_answer": "generate_human_readable_answer",
            "regenerate_query": "regenerate_query",
        }
    )

    workflow.add_conditional_edges(
        "regenerate_query",
        check_attempts_router,
        {
            "convert_to_sql": "convert_to_sql",
            "max_iterations": "end_max_iterations",
        }
    )

    # Add summarize edge from all terminal nodes
    for node in [
        "generate_human_readable_answer",
        "generate_funny_response",
        "vector_semantic_embedding",
        "end_max_iterations",
        "orchestrate_tools",
        "book_property_viewing",
        "submit_property_application"
    ]:
        workflow.add_edge(node, "summarize_conversation")

    # Exit point
    workflow.add_edge("summarize_conversation", END)

    # Compile
    app = workflow.compile(checkpointer=saver)

    result = app.invoke(
        input={"messages": [user_message], "attempts": 0},
        config={"configurable": {
            "current_user_id": str(user_id),
            "thread_id": int(user_id)
        }},
    )

    response = result.get("query_result", "No result generated.")
    
    return response




def extract_preferences_from_context(history, summary, memory_context):
    """
    Extracts user preferences (features, locations, price, etc.) from user messages in conversation history,
    structured summary keys, unstructured summary lines, and memory context.
    """
    preferences = set()

    # 1. Only use user messages from history
    user_text = " ".join([entry["content"] for entry in history if isinstance(entry, dict) and entry.get("role") == "user"])

    # 2. Parse structured summary for key-value pairs
    summary_prefs = {}
    for line in summary.splitlines():
        match = re.match(r"\*\*(.+?)\*\*:\s*(.+)", line)
        if match:
            key, value = match.groups()
            summary_prefs[key.strip().lower()] = value.strip().lower()

    # Extract preferences from known keys in structured summary
    for key, value in summary_prefs.items():
        if key in ["location preference", "apartment type", "number of bedrooms", "budget", "preferred amenities", "lifestyle preferences", "leasing terms"]:
            for v in re.split(r",|and|;|\.|\s+but\s+", value):
                v = v.strip()
                if v and v not in ["unknown", "not explicitly stated"]:
                    preferences.add(v)

    # 3. For unstructured summary, use lines that start with 'the user' or 'user'
    summary_lines = summary.splitlines()
    user_summary_text = " ".join(
        line for line in summary_lines if line.strip().lower().startswith(("the user", "user"))
    )

    # 4. Use memory context as is
    all_text = " ".join([user_text, user_summary_text, memory_context or ""]).lower()

    # Feature keywords (expand as needed)
    feature_keywords = [
        "swimming pool", "gym", "parking", "security", "air conditioner", "modern", "kitchen filters", "lounge", "cinema", "balcony", "garden", "1 bedroom",
        "2 bedrooms", "3 bedrooms", "4 bedrooms", "bedroom", "bathroom", "duplex", "deplex detached", "self contained", "apartment", "studio", "penthouse"
    ]
    for kw in feature_keywords:
        if kw in all_text:
            preferences.add(kw)

    # Extract price preferences
    price_matches = re.findall(r'₦?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)', all_text)
    for price in price_matches:
        preferences.add(price)

    # Extract locations
    location_keywords = ["lagos", "ogun", "maryland", "phase 1", "chevron", "phase 2", "phase 3", "phase 4", "phase 5", "phase 6", "phase 7", "phase 8", "phase 9", "phase 10", "abuja", "ikeja", "ikorodu", "lekki", "agric", "idimu"]
    for loc in location_keywords:
        if loc in all_text:
            preferences.add(loc)

    return list(preferences)


def score_listing_by_preferences(listing, preferences):
    """
    Scores a listing by the number of preference keywords it matches in relevant fields.
    """
    score = 0
    for pref in preferences:
        for field in ['amenities', 'interior_features', 'exterior_features', 'title', 'description']:
            if pref.lower() in (str(listing.get(field, ''))).lower():
                score += 1
    return score


def rank_listings_by_preferences(listings, preferences):
    """
    Sorts listings by their preference match score (descending).
    """
    return sorted(listings, key=lambda l: score_listing_by_preferences(l, preferences), reverse=True)

def orchestrate_tools(state: AgentState, config: RunnableConfig):
    """
    Orchestrates multiple tools for multi-intent queries.
    - Splits the user query into sub-questions using an LLM.
    - For each sub-question, classifies intent and routes to the appropriate tool (SQL or RAG).
    - Aggregates all results into a single response.
    """
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        latest_user_message = "Hello"
    
    question = latest_user_message

    # Check if we have a cached response for this exact question
    cache_key = f"orchestration_{hash(question)}"
    if hasattr(state, '_cache') and cache_key in state._cache:
        state["query_result"] = state._cache[cache_key]
        return state

    # 1. Use LLM to split the question into sub-questions/intents
    split_prompt = (
        "Split the following user query into 2 distinct sub-questions. "
        "Each sub-question should be a complete, standalone question that can be answered independently. "
        "Return ONLY the sub-questions as a simple list, one per line. Do not include any Python syntax, comments, or explanations.\n\n"
        f"User query: {question}\n\n"
        "Sub-questions:"
    )

    splitter_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert at decomposing multi-part real estate questions into distinct sub-questions. Return only clean, standalone questions without any formatting or comments."),
        ("human", split_prompt)
    ])
    
    # Simple LLM call without retry logic
    try:
        splitter_chain = splitter_prompt | ChatGroq(model_name=settings.TEXT_MODEL_NAME, temperature=0) | StrOutputParser()
        sub_questions_str = splitter_chain.invoke({"question": question})
    except Exception as e:
        # Fallback to simple splitting if LLM call fails
        print(f"LLM splitting failed, using fallback: {e}")
        if " and " in question.lower():
            parts = question.split(" and ")
            sub_questions = [part.strip() + "?" if not part.strip().endswith("?") else part.strip() for part in parts if part.strip()]
        else:
            sub_questions = [question]
    
    # Clean and parse the response
    # Remove any Python list syntax, comments, or extra formatting
    cleaned_response = re.sub(r'\[|\]|#.*$|".*?"|".*?"', '', sub_questions_str)
    # Split by newlines and clean each line
    sub_questions = []
    for line in cleaned_response.split('\n'):
        line = line.strip()
        # Remove common artifacts and ensure it's a valid question
        line = re.sub(r'^\d+\.\s*', '', line)  # Remove numbering
        line = re.sub(r'^["\']|["\']$', '', line)  # Remove quotes
        line = re.sub(r'\s*#.*$', '', line)  # Remove comments
        if line and len(line) > 10 and '?' in line:  # Must be substantial and contain question mark
            sub_questions.append(line)
    
    # Fallback if parsing failed
    if not sub_questions:
        # Simple fallback: split by "and" or "also"
        if " and " in question.lower():
            parts = question.split(" and ")
            sub_questions = [part.strip() + "?" if not part.strip().endswith("?") else part.strip() for part in parts if part.strip()]
        else:
            sub_questions = [question]

    print(f"Orchestration: Split into {len(sub_questions)} sub-questions: {sub_questions}")

    results = []
    for sub_q in sub_questions:
        if not sub_q or len(sub_q) < 5:  # Skip invalid questions
            continue
            
        print(f"Processing sub-question: {sub_q}")
        intent = followup_classify_intent(state, sub_q, "relevant")
        print(f"Sub-question intent: {intent}")
        
        if intent == "structured_query":
            sub_state = state.copy()
            sub_state["messages"] = state["messages"] + [HumanMessage(content=sub_q)]
            sub_state = convert_nl_to_sql(sub_state, config)
            sub_state = execute_sql(sub_state)
            sub_state = generate_human_readable_answer(sub_state, config)
            results.append(sub_state.get('query_result', ''))
        elif intent == "semantic_lookup":
            sub_state = state.copy()
            sub_state["messages"] = state["messages"] + [HumanMessage(content=sub_q)]
            sub_state = vector_semantic_embedding(sub_state, config)
            results.append(sub_state.get('query_result', ''))

    if not results:
        # Fallback response if no results
        state["query_result"] = "I couldn't process your multi-part question properly. Please try asking about one aspect at a time."
    else:
        state["query_result"] = "\n\n".join(results)
    
    return state

def parse_viewing_info(user_message):
    """Parse user message for viewing booking info in order."""
    parts = [p.strip() for p in re.split(r'[\n,]', user_message) if p.strip()]
    fields = [
        'viewer_name', 'viewer_email', 'viewer_phone',
        'preferred_date', 'preferred_time',
        'alternative_date', 'alternative_time', 'special_requirements'
    ]
    data = {}
    for i, field in enumerate(fields):
        if i < len(parts):
            data[field] = parts[i]
    return data

def parse_application_info(user_message):
    """Parse user message for property application info in order."""
    # Simple comma-separated parsing
    parts = [part.strip() for part in user_message.split(',') if part.strip()]
    
    fields = [
        'applicant_name', 'applicant_email', 'applicant_phone',
        'monthly_income', 'employment_status', 'move_in_date', 'lease_duration'
    ]
    data = {}
    
    for i, field in enumerate(fields):
        if i < len(parts):
            value = parts[i]
            
            # Handle specific field types
            if field == 'monthly_income':
                # Enhanced currency parsing for Nigerian Naira and other formats
                clean_value = value.lower()
                # Remove common currency words and symbols
                clean_value = clean_value.replace('naira', '').replace('₦', '').replace('n', '').replace('ngn', '')
                # Remove commas and other non-numeric characters except dots
                clean_value = re.sub(r'[^\d.]', '', clean_value)
                try:
                    data[field] = float(clean_value)
                except ValueError:
                    data[field] = value  # Keep as string if conversion fails
            elif field == 'lease_duration':
                # Extract number from lease duration (e.g., "12 months" -> 12)
                duration_match = re.search(r'(\d+)', value)
                if duration_match:
                    data[field] = int(duration_match.group(1))
                else:
                    data[field] = value  # Keep as string if no number found
            elif field == 'move_in_date':
                # Handle various date formats and convert to YYYY-MM-DD
                date_formats = [
                    '%d-%m-%Y', '%d/%m/%Y', '%m-%d-%Y', '%m/%d/%Y',
                    '%Y-%m-%d', '%Y/%m/%d', '%d-%m-%y', '%d/%m/%y'
                ]
                
                converted_date = None
                for fmt in date_formats:
                    try:
                        parsed_date = datetime.strptime(value, fmt)
                        converted_date = parsed_date.strftime('%Y-%m-%d')
                        break
                    except ValueError:
                        continue
                
                data[field] = converted_date if converted_date else value
            else:
                data[field] = value
    
    return data

def detect_booking_intent(user_message: str, current_property: str, state: AgentState) -> str:
    """Smart detection of user intent using hybrid approach"""
    
    # Check if user is providing the requested information format
    # Look for patterns like: name, email, phone, date, time, etc.
    info_patterns = [
        r'\b[A-Za-z]+\s+[A-Za-z]+\s*,\s*[^,\s]+@[^,\s]+\s*,\s*\d{10,11}\s*,\s*\d{4}-\d{2}-\d{2}',  # name, email, phone, date
        r'\b[A-Za-z]+\s+[A-Za-z]+\s*,\s*[^,\s]+@[^,\s]+\s*,\s*\d{10,11}',  # name, email, phone
        r'\d{4}-\d{2}-\d{2}',  # date format
        r'\d{1,2}:\d{2}',  # time format
    ]
    
    has_info_pattern = any(re.search(pattern, user_message) for pattern in info_patterns)
    
    if has_info_pattern:
        return "providing_info"
    
    # Fallback to LLM for ambiguous cases
    return llm_classify_intent(user_message, current_property)

def detect_application_intent(user_message: str, current_property: str, state: AgentState) -> str:
    """Smart detection of user intent for property applications using hybrid approach"""
    
    # Check if user is providing the requested information format
    # Look for patterns like: name, email, phone, income, employment, etc.
    info_patterns = [
        r'\b[A-Za-z]+\s+[A-Za-z]+\s*,\s*[^,\s]+@[^,\s]+\s*,\s*\d{10,11}\s*,\s*\d+',  # name, email, phone, income
        r'\b[A-Za-z]+\s+[A-Za-z]+\s*,\s*[^,\s]+@[^,\s]+\s*,\s*\d{10,11}',  # name, email, phone
        r'\d{4}-\d{2}-\d{2}',  # date format
        r'\b(employed|unemployed|self-employed|student|retired)\b',  # employment status
    ]
    
    has_info_pattern = any(re.search(pattern, user_message) for pattern in info_patterns)
    
    if has_info_pattern:
        return "providing_info"
    
    # Fallback to LLM for ambiguous cases
    return llm_classify_application_intent(user_message, current_property)

def llm_classify_intent(user_message: str, current_property: str) -> str:
    """LLM fallback for ambiguous cases"""
    prompt = f"""
    Context: User was asked to provide booking info for property with listing id "{current_property}".
    User response: "{user_message}"
    
    Is the user:
    A) Providing their booking information (name, email, phone, dates, requirements)
    B) Requesting to book a different property
    
    Respond with only: A or B
    """
    
    llm = ChatGroq(temperature=0, model_name=settings.TEXT_MODEL_NAME)
    classifier = ChatPromptTemplate.from_messages([
        ("system", "You are an intent classifier. Respond with only 'A' or 'B'."),
        ("human", prompt)
    ]) | llm | StrOutputParser()
    
    result = classifier.invoke({}).strip().upper()
    return "providing_info" if result == "A" else "new_booking"

def llm_classify_application_intent(user_message: str, current_property: str) -> str:
    """LLM fallback for ambiguous application cases"""
    prompt = f"""
    Context: User was asked to provide application info for property with listing id "{current_property}".
    User response: "{user_message}"
    
    Is the user:
    A) Providing their application information (name, email, phone, income, employment, move-in date, lease duration)
    B) Requesting to apply for a different property
    
    Respond with only: A or B
    """
    
    llm = ChatGroq(temperature=0, model_name=settings.TEXT_MODEL_NAME)
    classifier = ChatPromptTemplate.from_messages([
        ("system", "You are an intent classifier. Respond with only 'A' or 'B'."),
        ("human", prompt)
    ]) | llm | StrOutputParser()
    
    result = classifier.invoke({}).strip().upper()
    return "providing_info" if result == "A" else "new_application"

def book_property_viewing(state: AgentState, config: RunnableConfig):
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    required_fields = [
        'viewer_name', 'viewer_email', 'viewer_phone', 'preferred_date', 'preferred_time',
        'alternative_date', 'alternative_time', 'special_requirements'
    ]
    viewing_data = state.get('viewing_data', {})
    user_message = latest_user_message

    if state.get('awaiting_viewing_info'):
        # SMART DETECTION: Check if user is requesting a NEW booking vs providing info
        current_property = state.get('listing_id', 'unknown')
        intent = detect_booking_intent(user_message, current_property, state)
        
        if intent == "new_booking":
            # User is requesting a NEW booking - reset state and start fresh
            print("Detected new booking request while awaiting info - resetting state")
            state['awaiting_viewing_info'] = False
            state['viewing_data'] = {}
            state['listing_id'] = None
            state['agent_email'] = None
            
            # Process the new booking request
            state_for_rewrite = handle_follow_up(state, config)
            sql_state = convert_nl_to_sql(state_for_rewrite, config)
            lookup_state = execute_sql(sql_state)
            rows = lookup_state.get("query_rows", [])
            if rows:
                listing_id = rows[0].get("id")
                agent_email = rows[0].get("email")
                state['listing_id'] = listing_id
                state['agent_email'] = agent_email
                print(f"New booking - Listing ID: {listing_id}, Agent Email: {agent_email}")
                state['query_result'] = (
                    "To book a viewing, could you provide your information in this order: "
                    "full name, email address, phone number, preferred date for inspection, preferred time for inspection, "
                    "alternative date, alternative time, and special requirements?"
                )
                state['awaiting_viewing_info'] = True
                state["messages"].append(AIMessage(content=state['query_result']))
                return state
            else:
                state['query_result'] = f"I couldn't find the property you referenced. Could you provide more details or check the name?"
                return state
        else:
            # User is providing booking information - continue with current booking
            parsed = parse_viewing_info(user_message)
            viewing_data.update(parsed)
            state['viewing_data'] = viewing_data
            state['awaiting_viewing_info'] = False
            
            # Check for missing required fields
            missing = [f for f in required_fields if not viewing_data.get(f)]
            if missing:
                state['query_result'] = (
                    "To book a viewing, could you provide your information in this order: "
                    "full name, email address, phone number, preferred date for inspection, preferred time for inspection, "
                    "alternative date, alternative time, and special requirements?"
                )
                state['awaiting_viewing_info'] = True
                return state
            
            # All info present, submit to backend
            user_id = state.get('current_user_id')
            listing_id = state.get('listing_id')
            payload = {
                'user_id': user_id,
                'listing_id': listing_id,
                **{k: v for k, v in viewing_data.items() if v}
            }
            try:
                response = requests.post('http://127.0.0.1:5000/api/viewing-bookings', json=payload)
                data = response.json()
                if response.ok and data.get('success'):
                    state['query_result'] = data.get('message', 'Inspection booked successfully!')
                    state['viewing_data'] = {}
                    state['listing_id'] = None
                    state['agent_email'] = None
                    state["messages"].append(AIMessage(content=state['query_result']))
                else:
                    state['query_result'] = data.get('error', 'Failed to book viewing.')
            except Exception as e:
                state['query_result'] = f'Failed to book viewing: {str(e)}'
            return state
    else:
        # New booking request - reset state and process
        state['awaiting_viewing_info'] = False
        state['viewing_data'] = {}
        state['listing_id'] = None
        state['agent_email'] = None
        
        # Process the booking request
        state_for_rewrite = handle_follow_up(state, config)
        sql_state = convert_nl_to_sql(state_for_rewrite, config)
        lookup_state = execute_sql(sql_state)
        rows = lookup_state.get("query_rows", [])
        if rows:
            listing_id = rows[0].get("id")
            agent_email = rows[0].get("email")
            state['listing_id'] = listing_id
            state['agent_email'] = agent_email
            state['query_result'] = (
                "To book a viewing, could you provide your information in this order: "
                "full name, email address, phone number, preferred date for inspection, preferred time for inspection, "
                "alternative date, alternative time, and special requirements?"
            )
            state['awaiting_viewing_info'] = True
            state["messages"].append(AIMessage(content=state['query_result']))
            return state
        else:
            state['query_result'] = f"I couldn't find the property you referenced. Could you provide more details or check the name?"
            return state


def submit_property_application(state: AgentState, config: RunnableConfig):
    messages = state.get("messages", [])
    
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_user_message = msg.content
            break
    
    required_fields = [
        'applicant_name', 'applicant_email', 'applicant_phone', 'monthly_income', 
        'employment_status', 'move_in_date', 'lease_duration'
    ]
    application_data = state.get('application_data', {})
    user_message = latest_user_message

    if state.get('awaiting_application_info'):
        # SMART DETECTION: Check if user is requesting a NEW application vs providing info
        current_property = state.get('listing_id', 'unknown')
        intent = detect_application_intent(user_message, current_property, state)
        
        if intent == "new_application":
            # User is requesting a NEW application - reset state and start fresh
            state['awaiting_application_info'] = False
            state['application_data'] = {}
            state['listing_id'] = None
            state['agent_email'] = None
            
            # Process the new application request
            state_for_rewrite = handle_follow_up(state, config)
            sql_state = convert_nl_to_sql(state_for_rewrite, config)
            lookup_state = execute_sql(sql_state)
            rows = lookup_state.get("query_rows", [])
            if rows:
                listing_id = rows[0].get("id")
                agent_email = rows[0].get("email")
                state['listing_id'] = listing_id
                state['agent_email'] = agent_email
                state['query_result'] = (
                    "To submit a property application, please provide your information in this exact format:\n\n"
                    "Full Name (e.g., John Doe), Email Address (e.g., john.doe@gmail.com), Phone Number (e.g., 08012345678), "
                    "Monthly Income (e.g., 500000 - just the number, no commas or currency), Employment Status (e.g., employed/unemployed/self-employed), "
                    "Move-in Date (e.g., 30-07-2025), Lease Duration in months (e.g., 12)\n\n"
                    "Example: John Doe, john.doe@gmail.com, 08012345678, 500000, employed, 30-07-2025, 12"
                )
                state['awaiting_application_info'] = True
                state["messages"].append(AIMessage(content=state['query_result']))
                return state
            else:
                state['query_result'] = f"I couldn't find the property you referenced. Could you provide more details or check the name?"
                return state
        else:
            # User is providing application information - continue with current application
            parsed = parse_application_info(user_message)
            application_data.update(parsed)
            state['application_data'] = application_data
            state['awaiting_application_info'] = False
            
            # Check for missing required fields
            missing = [f for f in required_fields if not application_data.get(f)]
            if missing:
                state['query_result'] = (
                    "To submit a property application, please provide your information in this exact format:\n\n"
                    "**Full Name** (e.g., John Doe), **Email Address** (e.g., john.doe@gmail.com), **Phone Number** (e.g., 08012345678), "
                    "**Monthly Income** (e.g., 500000 - just the number, no commas or currency), **Employment Status** (e.g., employed/unemployed/self-employed), "
                    "**Move-in Date** (e.g., 30-07-2025), **Lease Duration** in months (e.g., 12)\n\n"
                    "**Example**:\nJohn Doe, johndoe@gmail.com, 08012345678, 500000, employed, 30-07-2025, 12"
                )
                state['awaiting_application_info'] = True
                return state
            
            # All info present, submit to backend
            user_id = state.get('current_user_id')
            listing_id = state.get('listing_id')
            payload = {
                'user_id': user_id,
                'listing_id': listing_id,
                **{k: v for k, v in application_data.items() if v}
            }
            print(f"Submitting application payload: {payload}")
            try:
                response = requests.post('http://127.0.0.1:5000/api/property-applications', json=payload)
                data = response.json()
                if response.ok and data.get('success'):
                    state['query_result'] = data.get('message', 'Application submitted successfully!')
                    state['application_data'] = {}
                    state['listing_id'] = None
                    state['agent_email'] = None
                    state["messages"].append(AIMessage(content=state['query_result']))
                else:
                    state['query_result'] = data.get('error', 'Failed to submit application.')
            except Exception as e:
                state['query_result'] = f'Failed to submit application: {str(e)}'
            return state
    else:
        # New application request - reset state and process
        state['awaiting_application_info'] = False
        state['application_data'] = {}
        state['listing_id'] = None
        state['agent_email'] = None
        
        # Process the application request
        state_for_rewrite = handle_follow_up(state, config)
        sql_state = convert_nl_to_sql(state_for_rewrite, config)
        lookup_state = execute_sql(sql_state)
        rows = lookup_state.get("query_rows", [])
        if rows:
            listing_id = rows[0].get("id")
            agent_email = rows[0].get("email")
            state['listing_id'] = listing_id
            state['agent_email'] = agent_email
            print(f"New application - Listing ID: {listing_id}, Agent Email: {agent_email}")
            state['query_result'] = (
                "To submit a property application, please provide your information in this exact format:\n\n"
                "**Full Name** (e.g., John Doe), **Email Address** (e.g., john.doe@gmail.com), **Phone Number** (e.g., 08012345678), "
                "**Monthly Income** (e.g., 500000 - just the number, no commas or currency), **Employment Status** (e.g., employed/unemployed/self-employed), "
                "**Move-in Date** (e.g., 30-07-2025), **Lease Duration** in months (e.g., 12)\n\n"
                "**Example**:\nJohn Doe, johndoe@gmail.com, 08012345678, 500000, employed, 30-07-2025, 12"
            )
            state['awaiting_application_info'] = True
            state["messages"].append(AIMessage(content=state['query_result']))
            return state
        else:
            state['query_result'] = f"I couldn't find the property you referenced. Could you provide more details or check the name?"
            return state