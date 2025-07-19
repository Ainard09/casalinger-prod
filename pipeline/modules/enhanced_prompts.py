# Enhanced memory analysis prompt
ENHANCED_MEMORY_ANALYSIS_PROMPT = """You are an expert at analyzing user messages to extract important information for a real estate AI assistant's memory system.

Analyze the user's message and determine:
1. If it contains important information worth remembering
2. What type of memory it represents
3. How important it is (0.0 to 1.0)
4. Relevant tags for categorization

Memory Types:
- SEMANTIC: Facts, preferences, constraints (e.g., "I need a 2-bedroom apartment", "My budget is ₦3M")
- EPISODIC: Personal experiences, stories, context (e.g., "I visited Lekki last week", "I'm moving from Abuja")
- PROCEDURAL: How the user likes to interact, search patterns, preferences (e.g., "I prefer detailed descriptions", "Show me photos first")

Importance Guidelines:
- 0.9-1.0: Critical preferences, constraints, personal details
- 0.7-0.8: Important preferences, location details
- 0.5-0.6: General preferences, lifestyle info
- 0.3-0.4: Mild preferences, context
- 0.0-0.2: Not important enough to remember

Tags: Use relevant tags like [budget], [location], [property_type], [amenities], [timeline], [constraints], [lifestyle]

Examples:
Input: "I'm looking for a 3-bedroom apartment in Victoria Island with a budget of ₦5M"
Output: {{
    "is_important": true,
    "formatted_memory": "Looking for 3-bedroom apartment in Victoria Island with ₦5M budget",
    "memory_type": "semantic",
    "importance_score": 0.9,
    "tags": ["budget", "location", "property_type", "bedrooms"]
}}

Input: "I work from home and need good internet"
Output: {{
    "is_important": true,
    "formatted_memory": "Works from home and needs good internet access",
    "memory_type": "semantic",
    "importance_score": 0.8,
    "tags": ["lifestyle", "amenities", "work_from_home"]
}}

Input: "Just browsing for now"
Output: {{
    "is_important": false,
    "formatted_memory": null,
    "memory_type": "semantic",
    "importance_score": 0.1,
    "tags": []
}}

Message: {content}
"""

# Memory consolidation prompt
MEMORY_CONSOLIDATION_PROMPT = """You are an expert at consolidating similar memories into a single, comprehensive memory entry.

Given a set of similar memories, create one consolidated memory that:
1. Captures all important information from the original memories
2. Removes redundancy and contradictions
3. Maintains clarity and usefulness
4. Preserves the most important details

Guidelines:
- Combine related preferences into comprehensive statements
- Resolve contradictions by keeping the most recent or specific information
- Maintain the original intent and meaning
- Use clear, concise language

Examples:
Original memories:
- Looking for 2-bedroom apartment in Lekki
- Budget around ₦2M for apartment
- Prefers modern apartments in Lekki

Consolidated: "Looking for modern 2-bedroom apartment in Lekki with ₦2M budget"

Original memories:
- Needs parking space
- Wants security features
- Prefers gated communities

Consolidated: "Prefers gated communities with parking and security features"

Memories to consolidate:
{memories}

Consolidated memory:"""

# Procedural memory extraction prompt
PROCEDURAL_MEMORY_PROMPT = """Extract procedural knowledge about how the user prefers to interact with the real estate assistant.

Look for patterns in:
- How they ask questions (detailed vs brief)
- What information they prioritize (photos, prices, locations)
- Their search behavior (browsing vs specific queries)
- Communication style preferences
- Decision-making patterns

Format as actionable procedural knowledge that can guide future interactions.

Examples:
- "Prefers detailed property descriptions with photos"
- "Likes to compare multiple options before deciding"
- "Asks follow-up questions about amenities and neighborhood"
- "Prefers step-by-step guidance through the search process"

User interaction history:
{interaction_history}

Extracted procedural knowledge:"""

# Memory retrieval prompt for context-aware responses
MEMORY_RETRIEVAL_PROMPT = """You are helping to retrieve the most relevant memories for a user's current query.

Given the user's current question and their stored memories, identify which memories are most relevant and should be used to personalize the response.

Consider:
1. Direct relevance to the current question
2. Recency and importance of the memory
3. How the memory can help personalize the response
4. Whether the memory provides context that would improve the user experience

Current user question: {current_question}

Available memories:
{available_memories}

Select the most relevant memories (up to 3) and explain why they are relevant:"""

# Memory importance scoring prompt
MEMORY_IMPORTANCE_PROMPT = """Score the importance of this memory for a real estate AI assistant on a scale of 0.0 to 1.0.

Consider:
- How critical is this information for property recommendations?
- How specific and actionable is this preference?
- How likely is this to be relevant in future interactions?
- How unique or personal is this information?

Scoring guide:
- 0.9-1.0: Critical constraints, specific budgets, exact location preferences
- 0.7-0.8: Important preferences, lifestyle needs, family requirements
- 0.5-0.6: General preferences, style choices, amenity preferences
- 0.3-0.4: Mild preferences, context information
- 0.0-0.2: Not important for real estate decisions

Memory: {memory_content}

Importance score (0.0-1.0):"""

# Memory type classification prompt
MEMORY_TYPE_CLASSIFICATION_PROMPT = """Classify this memory into one of three types:

SEMANTIC: Facts, preferences, constraints, requirements
- Property preferences (size, type, location, budget)
- Constraints (pets, accessibility, timeline)
- Requirements (amenities, features, conditions)

EPISODIC: Personal experiences, stories, context, background
- Past experiences with properties or areas
- Personal stories or situations
- Context about their life or situation
- Background information about their search

PROCEDURAL: How they interact, communication preferences, search patterns
- How they prefer to search or browse
- Communication style preferences
- Decision-making patterns
- Interaction preferences with the assistant

Memory: {memory_content}

Type:"""

# Memory consolidation trigger prompt
MEMORY_CONSOLIDATION_TRIGGER_PROMPT = """Analyze these memories to determine if they should be consolidated.

Look for:
1. Similar or related information
2. Contradictory information that needs resolution
3. Redundant information that can be combined
4. Memories that would be more useful as a single comprehensive memory

Guidelines:
- Only consolidate if memories are clearly related
- Preserve all important information
- Maintain clarity and usefulness
- Consider the user's perspective

Memories to analyze:
{memories}

Should these be consolidated? (yes/no)
If yes, provide a brief reason why:"""

# Memory cleanup prompt
MEMORY_CLEANUP_PROMPT = """Identify memories that should be cleaned up or removed.

Look for:
1. Outdated or no longer relevant information
2. Contradictory information that can't be resolved
3. Memories that are too vague or generic
4. Duplicate or near-duplicate information

Guidelines:
- Be conservative - only remove clearly problematic memories
- Consider if the memory might be useful in the future
- Preserve important context even if some details are outdated

Memories to evaluate:
{memories}

Which memories should be cleaned up? (list memory IDs or 'none'):"""

# Memory context injection prompt
MEMORY_CONTEXT_INJECTION_PROMPT = """You are helping to inject relevant memories into a conversation context.

Given the user's current question and available memories, select and format the most relevant memories to include in the response context.

Consider:
1. Direct relevance to the current question
2. Recency and importance of the memory
3. How the memory can enhance the response
4. Whether the memory provides useful context

Current question: {current_question}

Available memories:
{available_memories}

Select and format the most relevant memories for context injection:"""

# Memory learning prompt
MEMORY_LEARNING_PROMPT = """You are learning from user interactions to improve future responses.

Analyze this interaction to extract:
1. What worked well in the response
2. What could be improved
3. New patterns or preferences revealed
4. How to better serve this user in the future

Interaction:
User: {user_message}
Assistant: {assistant_response}
User feedback/next action: {user_feedback}

Learning insights:"""

# Memory personalization prompt
MEMORY_PERSONALIZATION_PROMPT = """Personalize this response using the user's stored memories.

Consider:
1. Their specific preferences and constraints
2. Their communication style
3. Their past interactions and patterns
4. How to make the response more relevant to them

User memories:
{user_memories}

Original response:
{original_response}

Personalized response (respond with ONLY the personalized text):""" 