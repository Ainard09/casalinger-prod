import pandas as pd
import numpy as np
import sqlite3
from scipy.sparse import csr_matrix


def load_datasets(filepath):
    """
    INPUT:
    filepath - (str) the path to the SQLite database
    
    OUTPUT:
    df - (pandas dataframe) a DataFrame with processed interactions
    
    Description:
    Reads the interactions table and maps interaction types to numerical values.
    """
    # Connect to the SQLite database
    conn = sqlite3.connect(filepath)
    # Read the 'interaction' table into a DataFrame
    df = pd.read_sql_query("SELECT * FROM interactions", conn)
    conn.close()
    
    # Keep relevant columns
    df = df[["user_id", "listing_id", "interaction_type"]]
    
    # Map interaction types to numeric values
    interaction_mapping = {
        "viewed": 1,
        "saved": 2
    }
    df["interaction_type"] = df["interaction_type"].map(interaction_mapping)
    
    return df

def load_listing_data(filepath):
    # Connect to the SQLite database
    conn = sqlite3.connect(filepath)
    # Read the 'interaction' table into a DataFrame
    df = pd.read_sql_query("SELECT * FROM listings", conn)
    conn.close()

    df = df[["id", "bedrooms", "bathrooms", "price", "area", "city", "state"]]
    return df


def get_top_listing_ids(n, df):
    '''
    INPUT:
    n - (int) the number of top articles to return
    df - (pandas dataframe) df as defined at the top of the notebook 
    
    OUTPUT:
    top_articles - (list) A list of the top 'n' article ids

    '''
    top_list_ids = df.groupby("listing_id").size().sort_values(ascending=False).index
    return list(top_list_ids[:n])

def create_user_item_matrix(df):
    '''
    INPUT:
    df - pandas dataframe with article_id, title, user_id columns
    
    OUTPUT:
    user_item - user item matrix 
    
    Description:
    Return a matrix with user ids as rows and article ids on the columns with 1 values where a user interacted with 
    an article and a 0 otherwise
    '''
    user_article_mat = df.groupby(["user_id", "listing_id"])["interaction_type"].count().unstack()

    return user_article_mat.notnull().astype(int)


def create_user_item_matrix(df):
    """
    INPUT:
    df - pandas dataframe with user_id, listing_id, and interaction_type columns
    
    OUTPUT:
    user_item - user-item matrix with interaction weights
    
    Description:
    Creates a matrix where rows are user_ids, columns are listing_ids, and values are interaction weights.
    """
    user_item = df.pivot_table(
        index="user_id",
        columns="listing_id",
        values="interaction_type",
        aggfunc="sum",
        fill_value=0
    )
    return user_item

def find_similar_listings(listing_id, df):
    '''
    INPUT:
    article_id - (float) a article_id
    df - pandas dataframe with article_id, title, user_id columns
    
    OUTPUT:
    similar_articles - (list) an ordered list where the closest users (largest dot product users)
                    are listed first
    
    '''
    listing_user_mat = df.groupby(["listing_id", "user_id"])["interaction_type"].count().unstack()
    item_user = listing_user_mat.notnull().astype(int)
    listings_sim = item_user.dot(item_user.loc[listing_id])
    sorted_lists = listings_sim.sort_values(ascending=False)
    most_sim_lists = list(sorted_lists.index)
    most_sim_lists.remove(listing_id)
    return most_sim_lists

def get_user_listings(user_id, user_item):
    """
    Retrieve all listing IDs a user has interacted with (viewed or saved).

    Args:
    - user_id: The ID of the user.
    - user_item: User-item matrix with interaction weights.

    Returns:
    - List of listing IDs where the user has interacted with the listing (interaction > 0).
    """
    # Identify columns (listings) where the user has any interaction (value > 0)
    inter_list_ids = list(user_item.columns[user_item.loc[user_id] > 0])
    
    return inter_list_ids

def get_top_sorted_lists(user_id, df, user_item):
    ''' 
    INPUT:
    user_id - (int)
    df - (pandas dataframe) df as define at the top of the notebook
    
    OUTPUT:
    sorted_articles - (list) list of top sorted article_ids viewed by the user
    '''
    rec = dict()
    sorted_lists = []

    user_list_inter = pd.DataFrame(df.groupby("listing_id")["user_id"].count().sort_values(ascending=False))
    list_ids = get_user_listings(user_id, user_item)

    for list_id in list_ids:
        list_idx = np.where(user_list_inter.index==list_id)[0][0]
        rec[list_id] = list_idx
        
    sorted_recs = sorted(rec.items(), key=lambda item: item[1])
    for i in sorted_recs:
        sorted_lists.append(i[0])
    
    return sorted_lists

def get_top_sorted_users(user_id, df, user_item):
    '''
    INPUT:
    user_id - (int)
    df - (pandas dataframe) df as defined at the top of the notebook 
    user_item - (pandas dataframe) matrix of users by articles: 
            1's when a user has interacted with an article, 0 otherwise
    
            
    OUTPUT:
    neighbors_df - (pandas dataframe) a dataframe with:
                    neighbor_id - is a neighbor user_id
                    similarity - measure of the similarity of each user to the provided user_id
                    num_interactions - the number of articles viewed by the user - if a u
                    
    Other Details - sort the neighbors_df by the similarity and then by number of interactions where 
                    highest of each is higher in the dataframe
     
    '''
    # Your code here
    user_id_sims = user_item.dot(user_item.loc[user_id]).sort_values(ascending=False)
    user_id_sims.drop(user_id, inplace=True)
    similar_ids_df = pd.DataFrame({'similarity': user_id_sims}).reset_index()
    
    user_list_inter = pd.DataFrame(df.groupby('user_id')['listing_id'].count())
    user_list_inter.columns = ['num_interactions']
    
    #join the two dataframe together
    neighbors_df = similar_ids_df.merge(user_list_inter, left_on= 'user_id', right_index=True)
    neighbors_df.rename(columns={'user_id':'neighbor_id'}, inplace=True)
    neighbors_df = neighbors_df.sort_values(by=['similarity','num_interactions'], ascending=False)
    
    return neighbors_df # Return the dataframe specified in the doc_string


def user_user_recs(user_id, rec_num, df, user_item, exclude_listings=None):
    """
    Generate user-user collaborative filtering recommendations, with optional exclusion.

    Args:
    - user_id: The ID of the user for whom recommendations are to be made.
    - rec_num: The number of recommendations to generate.
    - df: DataFrame containing interaction data.
    - user_item: User-item matrix.
    - exclude_listings: Optional list of listing IDs to exclude from recommendations.

    Returns:
    - List of recommended listing IDs.
    """
    recs = []
    list_ids_seen = get_user_listings(user_id, user_item)
    list_ids_seen_set = set(list_ids_seen)

    # Combine exclude_listings with list_ids_seen for filtering
    if exclude_listings:
        list_ids_seen_set.update(exclude_listings)

    neighbors_df = get_top_sorted_users(user_id, df, user_item)

    for neighbor in neighbors_df['neighbor_id']:
        list_ids = get_top_sorted_lists(neighbor, df, user_item)
        for list_id in list_ids:
            if list_id not in list_ids_seen_set:
                recs.append(list_id)
                if len(recs) >= rec_num:
                    break

    return recs[:rec_num]


def clear_user_memory(db_path: str, thread_id: int):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    thread_key = f"thread:{thread_id}"
    
    cursor.execute("DELETE FROM checkpoints WHERE key = ?", (thread_key,))
    cursor.execute("DELETE FROM writes WHERE key = ?", (thread_key,))
    
    conn.commit()
    conn.close()
