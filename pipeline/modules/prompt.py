MEMORY_ANALYSIS_PROMPT = """Extract and format important personal real estate–related facts about the user from their message.
Focus on useful information that could help personalize property recommendations or support their housing journey.

Important facts include:
- Personal info (name, location, family size)
- Budget or price ranges
- Property preferences (type, size, amenities, style)
- Lifestyle needs (remote work setup, walkability, privacy)
- Real estate goals (buying vs. renting, investing, relocating)
- Constraints (pet-friendly, wheelchair accessible, proximity to school/work)
- Areas of interest (cities, neighborhoods)

Rules:
1. Only extract actual facts — ignore vague commentary or general conversation
2. Rephrase facts into clear, third-person statements
3. If no useful real estate context is present, mark as not important
4. Remove conversational fluff and extract only core, actionable info

Examples:
Input: "Hey, please remember I’m looking to rent a 2-bedroom apartment in Lekki"
Output: {{
    "is_important": true,
    "formatted_memory": "Looking to rent a 2-bedroom apartment in Lekki"
}}

Input: "My budget is around ₦3 million, and I prefer modern interiors"
Output: {{
    "is_important": true,
    "formatted_memory": "Has a ₦3 million budget and prefers modern interiors"
}}

Input: "Can you remember I work remotely and need good internet?"
Output: {{
    "is_important": true,
    "formatted_memory": "Works remotely and needs good internet access"
}}

Input: "I'm just browsing for now"
Output: {{
    "is_important": false,
    "formatted_memory": null
}}

Input: "Remember this: I want something close to my kids’ school"
Output: {{
    "is_important": true,
    "formatted_memory": "Wants a property close to their kids' school"
}}

Input: "Can you save my search?"
Output: {{
    "is_important": false,
    "formatted_memory": null
}}

Message: {message}
Output:
"""
