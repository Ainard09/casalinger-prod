import pymongo
import certifi
from settings import settings
from langchain_huggingface import HuggingFaceEmbeddings

client = pymongo.MongoClient(settings.MONGODB_URI, tlsCAFile=certifi.where())
db = client["CasaLinger"]
collection = db["property_collection"]

embedding_model = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)


def get_embedding(text: str) -> list[float]:
        if not text.strip():
            print("Attempted to get embedding for empty text.")
            return []
        embedding = embedding_model.embed_query(text)
        return embedding

def vector_search(user_query, collection):
    """
    Perform a vector search in the MongoDB collection based on the user query.

    Args:
    user_query (str): The user's query string.
    collection (MongoCollection): The MongoDB collection to search.

    Returns:
    list: A list of matching documents.
    """

    # Generate embedding for the user query
    query_embedding = get_embedding(user_query)

    if query_embedding is None:
        return "Invalid query or embedding generation failed."

    # Define the vector search pipeline
    vector_search_stage = {
        "$vectorSearch": {
            "index": "vector_index",
            "queryVector": query_embedding,
            "path": "embedding",
            "numCandidates": 150,  # Number of candidate matches to consider
            "limit": 2,  # Return top 4 matches
        }
    }

    unset_stage = {
        "$unset": "embedding"  # Exclude the 'embedding' field from the results
    }

    project_stage = {
        "$project": {
            "_id": 0,  # Exclude the _id field
            "description": 1,  # Include the plot field
            "title": 1,  # Include the title field
            "state": 1,
            "city": 1,
            "price": 1,
            "bedrooms": 1,
            "bathrooms": 1,
            "amenities": 1,
            "interior_features": 1,
            "exterior_features": 1,
            "policy": 1,
            "availability_date": 1,
            "agent_name": 1,
            "agent_email": 1,
            "agent_phone": 1,
            "agent_address": 1,
            "agent_name": 1,  # Include the genres field
            "score": {"$meta": "vectorSearchScore"},  # Include the search score
        }
    }

    pipeline = [vector_search_stage, unset_stage, project_stage]

    # Execute the search
    results = collection.aggregate(pipeline)
    return list(results)


def get_search_result(query, collection):
    get_knowledge = vector_search(query, collection)

    search_result = ""
    for result in get_knowledge:
        search_result += f"Title: {result.get('title', 'N/A')}, Description: {result.get('description', 'N/A')}, State: {result.get('state', 'N/A')}, City: {result.get('city', 'N/A')}, Price: {result.get('price', 'N/A')}, Bedrooms: {result.get('bedrooms', 'N/A')}, Bathrooms: {result.get('bathrooms', 'N/A')}, Amenities: {result.get('amenities', 'N/A')}, Interior Features: {result.get('interior_features', 'N/A')}, Exterior Features: {result.get('exterior_features', 'N/A')}, Policy: {result.get('policy', 'N/A')}, Availability Date: {result.get('availability_date', 'N/A')}, Agent Name: {result.get('agent_name', 'N/A')}, Agent Email: {result.get('agent_email', 'N/A')}, Agent Phone: {result.get('agent_phone', 'N/A')}, Agent Address: {result.get('agent_address', 'N/A')}\n"

    return search_result


if __name__ == "__main__":
    query = "what do you know about Gerard property and liadi homes in lagos"
    result = get_search_result(query, collection)
    print(result)