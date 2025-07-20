import re
import io
import requests
from bs4 import BeautifulSoup
import osclear
import tabula
from langchain.schema import Document
from langchain_huggingface import HuggingFaceEmbeddings
from sentence_transformers import SentenceTransformer
from langchain_community.vectorstores import FAISS, Chroma
from langchain_community.document_loaders import WebBaseLoader, PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_mongodb.retrievers import MongoDBAtlasParentDocumentRetriever
import pymongo
import certifi
from settings import settings
import pandas as pd
from pathlib import Path
from datetime import datetime
import asyncio
from typing import List, Generator
from sqlalchemy import create_engine, text


# Connect to Supabase database
engine = create_engine(settings.SUPABASE_SQLALCHEMY_DATABASE_URI)

# Connect to MongoDB
client = pymongo.MongoClient(settings.MONGODB_URI, tlsCAFile=certifi.where())
db = client["CasaLinger"]
collection = db["property_collection"]

# STEP 1: Query listings with agent info
query = '''
SELECT l.*, 
       a.name as agent_name, 
       a.email as agent_email, 
       a.phone as agent_phone, 
       a.address as agent_address, 
       a.agent_type, 
       a.languages as agent_languages,  
       a.specialty as agent_specialty
FROM listings l
LEFT JOIN agents a ON l.agent_id = a.id
'''
df = pd.read_sql_query(text(query), engine)




url_dict = {
    "serene_cities_in_Nigeria.html":"https://afrocritik.com/five-most-serene-nigerian-cities/",
    "police_fight_against_violence_and_crime_in_Nigeria.html":"https://eajournals.org/gjpsa/wp-content/uploads/sites/35/2024/03/Nigerian-Police-Force-and-Fight-Against-Urban-Crimes-in-Nigeria.pdf",
    "top_Nigerian_cities_for_renters.html":"https://www.nigeriahousingmarket.com/real-estate-guide-nigeria/top-nigerian-cities-for-renters-in-2024-navigating-growth-and-rising-costs",
    "Nigeria_rental_crisis.html":"https://www.nigeriahousingmarket.com/interviews-opinions/the-nigerian-rental-crisis-inflation-greed-and-speculation",
    "Government_efforts_to_curb_rental_crisis.html":"https://www.nigeriahousingmarket.com/interviews-opinions/is-the-nigerian-government-doing-enough-to-address-the-housing-deficit-for-low-income-earners",
    "weos_of_renters_in_Abuja.html":"https://www.housingtvafrica.com/woes-of-abuja-house-hunters/",
    "areas_to_find_cheap_housing_in_Abuja.html":"https://www.housingtvafrica.com/top-10-areas-to-find-cheap-accommodation-in-abuja/",
    "Abuja_rent_crisis_and_cost_rise.html":"https://www.housingtvafrica.com/abuja-rent-crisis-how-the-cost-of-housing-has-skyrocketed-in-just-two-years/",
    "rent_soars_to_unprecedented_highs.html":"https://www.housingtvafrica.com/rent-soars-to-unprecedented-highs-amid-nigerias-housing-crisis/",
    "lagosians_prefer_yearly_to_monthly_rent_payment.html":"https://nairametrics.com/2024/08/13/lagosians-prefer-yearly-rent-payment-over-monthly-payment-survey/",
    "rents_up_100_percent_in_cities.html":"https://guardian.ng/property/rents-up-by-100-in-cities-spike-triggers-shift-in-demand/",
    "Enugu_moves_to_regulate_rent_sparks_lagos_debate.html":"https://businessday.ng/news/article/enugus-move-to-regulate-rent-sparks-debate-on-lagos-housing-crisis/",
    "things_you_should_know_as_a_tenant_in_Lagos_by_law.html":"https://businessday.ng/news/article/top-12-things-you-should-know-as-a-tenant-in-lagos-lawyer/",
    "right_and_responsibilities_of_tenants_in_Lagos.html":"https://businessday.ng/e-edition/womens-hub/article/understanding-the-rights-and-responsibilities-of-tenants-in-lagos/",
    "most_affordable_areas_in_Lagos_for_renters.html":"https://businessday.ng/news/article/6-most-affordable-areas-in-lagos-where-renters-can-find-homes/",
    "CasaLinger_projections_and_missions.html": "https://casalinger.vercel.app/",
    "Insurity_and_terrorists_attacks_on_selected_cities_Nigeria.html":"https://journal.ucc.edu.gh/index.php/ucclj/article/view/1361/661",
    "mass_abduction_and_kidnapping_in_Nigeria.html":"https://globalinitiative.net/analysis/mass-abductions-kidnappings-nigeria/",
    "Nigeria_most_violent_states.html":"https://reliefweb.int/report/nigeria/nigerias-most-violent-states-june-21-2022",
    "lekki_floods_agony_of_the_rich.html":"https://dailytrust.com/lekki-floods-agony-of-the-rich/",
    "relationship_between_landlord_and_tenant.html":"/Users/azeez/Documents/GitHub/casa-prod-ready1/pipeline/database/RAG data/Landlord_tenant_relationship_in_Nigeria_by_Bukola_Bankole.pdf",
    "Terror_attacks_and_kidnappings_spread_in_Nigeria_why_Lagos_could_be_target": "/Users/azeez/Documents/GitHub/casa-prod-ready1/pipeline/database/RAG data/Terror attacks and kidnapping_lagos.pdf",
    "comparative_analysis_of_private_and_public_housing_estate":"/Users/azeez/Documents/GitHub/casa-prod-ready1/pipeline/database/RAG data/A_comparative_analysis_of_residential_qu.pdf",
    "Effective_strategies_for_improving_multi-tenants_low_income":"/Users/azeez/Documents/GitHub/casa-prod-ready1/pipeline/database/RAG data/Effective_Strategies_for_Improving_Multi.pdf",
    "Assessment_of_the_relationship_between_house_quality_and_income_earner_renters.html":"/Users/azeez/Documents/GitHub/casa-prod-ready1/pipeline/database/RAG data/Assessment_of_the_relationship_between_h.pdf"
}


# Lazy load embedding model to reduce memory usage
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
    return _embedding_model


def get_embedding(text: str) -> list[float]:
        if not text.strip():
            print("Attempted to get embedding for empty text.")
            return []
        embedding = get_embedding_model().embed_query(text)
        return embedding


def database_vectorize(df):
    """
    Vectorizes property listings and stores them in MongoDB.
    Each document contains the listing text, embedding, and relevant metadata.
    """
    import pandas as pd

    # 2. Load units table
    units_df = pd.read_sql_query(text("SELECT * FROM units"), engine)

    # 3. Group units to get min/max of bedrooms, bathrooms, and price
    unit_stats = units_df.groupby('listing_id').agg({
        'bedrooms': ['min', 'max'],
        'bathrooms': ['min', 'max'],
        'price_min': 'min',
        'price_max': 'max'
    }).reset_index()

    # Flatten MultiIndex columns
    unit_stats.columns = ['listing_id', 'bedrooms_min', 'bedrooms_max', 'bathrooms_min', 'bathrooms_max', 'price_min', 'price_max']

    # 4. Merge stats back into listings
    merged_df = df.merge(unit_stats, how='left', left_on='id', right_on='listing_id')

    # 5. Fill complex listings' values with computed ranges
    def format_range(min_val, max_val):
        if pd.isnull(min_val) or pd.isnull(max_val):
            return None
        if min_val == max_val:
            return str(int(min_val))
        return f"{int(min_val)} - {int(max_val)}"

    def resolve_value(row, col):
        if row[col] != 0:
            return str(int(row[col]))
        if col == 'bedrooms':
            return format_range(row['bedrooms_min'], row['bedrooms_max'])
        elif col == 'bathrooms':
            return format_range(row['bathrooms_min'], row['bathrooms_max'])
        elif col == 'price':
            return format_range(row['price_min'], row['price_max'])
        return None

    merged_df['final_bedrooms'] = merged_df.apply(lambda row: resolve_value(row, 'bedrooms'), axis=1)
    merged_df['final_bathrooms'] = merged_df.apply(lambda row: resolve_value(row, 'bathrooms'), axis=1)
    merged_df['final_price'] = merged_df.apply(lambda row: resolve_value(row, 'price'), axis=1)

    # 6. Create the 'combined' field for MongoDB
    merged_df['combined'] = (
        merged_df['title'].fillna('') + ' | ' +
        merged_df['description'].fillna('') + ' | ' +
        '₦' + merged_df['final_price'].fillna('') + ' | ' +
        merged_df['final_bedrooms'].fillna('') + ' bed | ' +
        merged_df['final_bathrooms'].fillna('') + ' bath | ' +
        merged_df['state'].fillna('') + ', ' + merged_df['city'].fillna('') + ', ' + merged_df['area'].fillna('') + ' | ' +
        'Agent name: ' + merged_df['agent_name'].fillna('')
    )
    merged_df.drop(columns=[
        'bedrooms_min', 'bedrooms_max',
        'bathrooms_min', 'bathrooms_max',
        'price_min', 'price_max', 'listing_id',
        'bedrooms', 'bathrooms', 'price', 'image_paths', 'agent_id'
    ], inplace=True)

    merged_df.rename(columns={
        'final_bedrooms': 'bedrooms',
        'final_bathrooms': 'bathrooms',
        'final_price': 'price'
    }, inplace=True)



    merged_df["embedding"] = merged_df["combined"].apply(get_embedding)
    merged_df.drop(columns=["combined"], inplace=True)

    documents = merged_df.to_dict("records")
    collection.delete_many({})
    collection.insert_many(documents)

    print("Data ingestion into MongoDB completed")


def enhanced_web_loader(url: str, name: str) -> list[Document]:
    """Enhanced web loader that properly handles tables using BeautifulSoup and pandas."""
    documents = []
    try:
        response = requests.get(url, timeout=20)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'lxml')

        # Extract and process tables
        for i, table in enumerate(soup.find_all('table')):
            try:
                # Use pandas to read the HTML table
                df = pd.read_html(io.StringIO(str(table)))[0]
                if not df.empty:
                    # Add table as a structured document
                    table_content = f"Table from {name} - Part {i+1}:\n{df.to_string(index=False)}"
                    table_doc = Document(
                        page_content=table_content,
                        metadata={
                            'source': url,
                            'type': 'table',
                            'source_name': name,
                            'table_index': i
                        }
                    )
                    documents.append(table_doc)
            except Exception as e:
                print(f"  - Could not parse table {i} from {url}: {e}")
            # Remove the table from the soup to avoid duplicating content
            table.decompose()
        
        # Extract and clean remaining text content
        text_content = soup.get_text(separator=' ', strip=True)
        text_content = re.sub(r'\s+', ' ', text_content).strip()
        if text_content:
            text_doc = Document(
                page_content=text_content,
                metadata={'source': url, 'type': 'web_text', 'source_name': name}
            )
            documents.append(text_doc)
            
    except requests.RequestException as e:
        print(f"  - Failed to load URL {url}: {e}")
    
    return documents

def pdf_table_extractor(pdf_path: str, name: str) -> list[Document]:
    """Extracts tables from local PDFs using tabula-py."""
    documents = []
    try:
        # Extract all tables from the PDF
        tables = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True, silent=True)
        for i, table_df in enumerate(tables):
            if not table_df.empty:
                table_content = f"Table from PDF {name} - Part {i+1}:\n{table_df.to_string(index=False)}"
                doc = Document(
                    page_content=table_content,
                    metadata={
                        'source': pdf_path,
                        'type': 'pdf_table',
                        'source_name': name,
                        'table_index': i
                    }
                )
                documents.append(doc)
    except Exception as e:
        print(f"  - Could not extract tables from PDF {pdf_path}: {e}")
    return documents



def prepare_docs_for_mongodb(raw_docs: list[Document], metadata_fields=["source", "source_name", "type"]) -> list[Document]:
    docs = []
    now = datetime.utcnow().isoformat()
    for doc in raw_docs:
        content = doc.page_content
        metadata = {field: doc.metadata.get(field, "") for field in metadata_fields}
        metadata.update({
            "updated": now,
            "url": doc.metadata.get("source", ""),
            "title": doc.metadata.get("source_name", ""),
        })
        docs.append(Document(page_content=content, metadata=metadata))
    return docs

def get_splitter(chunk_size: int = 200) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=chunk_size,
        chunk_overlap=int(0.15 * chunk_size),
    )

base_uri = (settings.MONGODB_URI + "CasaLinger"
        f"?tlsCAFile={certifi.where()}"
)

parent_doc_retriever = MongoDBAtlasParentDocumentRetriever.from_connection_string(
    connection_string=base_uri,
    embedding_model=embedding_model,
    child_splitter=get_splitter(200),
    database_name="CasaLinger",
    collection_name="real_estate_info_collection",
    text_key="page_content",
    search_kwargs={"top_k": 5},
)

BATCH_SIZE = 256
MAX_CONCURRENCY = 4

async def process_batch(batch: List[Document], semaphore: asyncio.Semaphore) -> None:
    async with semaphore:
        await parent_doc_retriever.aadd_documents(batch)
        print(f"Processed batch of {len(batch)} documents")

def get_batches(docs: List[Document], batch_size: int) -> Generator:
    for i in range(0, len(docs), batch_size):
        yield docs[i : i + batch_size]

async def process_docs(docs: List[Document]) -> List[None]:
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    tasks = [process_batch(batch, semaphore) for batch in get_batches(docs, BATCH_SIZE)]
    return await asyncio.gather(*tasks)

def run_mongodb_parent_rag_pipeline(url_dict):
    # Step 1: Load and clean documents
    all_documents = []

    for name, path in url_dict.items():
        print(f"Processing: {name}")
        if path.startswith("http"):
            all_documents.extend(enhanced_web_loader(path, name))
        elif path.endswith(".pdf"):
            all_documents.extend(pdf_table_extractor(path, name))
            try:
                loader = PyPDFLoader(path)
                text_docs = loader.load()
                for doc in text_docs:
                    doc.metadata.update({'source': path, 'type': 'pdf_text', 'source_name': name})
                all_documents.extend(text_docs)
            except Exception as e:
                print(f"Failed to load PDF text from {path}: {e}")

    # Step 2: Clean + convert to MongoDB documents
    langchain_docs = prepare_docs_for_mongodb(all_documents)

    # Step 3: Clear collection before ingestion
    print("Clearing existing documents from MongoDB...")
    client = pymongo.MongoClient(settings.MONGODB_URI, tlsCAFile=certifi.where())
    collection = client["CasaLinger"]["real_estate_info_collection"]
    collection.delete_many({})
    print("MongoDB collection cleared.")

    # Step 4: Asynchronously ingest
    print("Ingesting documents into MongoDB with parent doc retriever...")
    asyncio.run(process_docs(langchain_docs))
    print("✅ MongoDB RAG ingestion completed.")


if __name__ == "__main__":
    print("--- Starting Database Vectorization ---")
    database_vectorize(df)
    
    print("\n--- Starting Web Content Vectorization (with table parsing) ---")
    print("NOTE: This may take a while depending on the number of URLs and PDFs.")
    print("Please ensure you have installed the required libraries: pip install beautifulsoup4 tabula-py lxml\n")
    run_mongodb_parent_rag_pipeline(url_dict)
    