import pandas as pd
import numpy as np


def load_dataset(data_filepath):

    df = pd.read_csv(data_filepath)[["article_id", "title", "email"]]
    coded_email = email_mapper(df)
    del df["email"]
    df["user_id"] = coded_email
    return df


def email_mapper(df):
    
    coded_dict = dict()
    cter = 1
    email_encoded = []
    
    for val in df['email']:
        if val not in coded_dict:
            coded_dict[val] = cter
            cter+=1
        
        email_encoded.append(coded_dict[val])
    return email_encoded

def get_top_article_ids(n, df):
    '''
    INPUT:
    n - (int) the number of top articles to return
    df - (pandas dataframe) df as defined at the top of the notebook 
    
    OUTPUT:
    top_articles - (list) A list of the top 'n' article ids

    '''
    top_article_ids = df.groupby("article_id").size().sort_values(ascending=False).index
    return list(top_article_ids[:n])

def get_top_articles(n, df):
    '''
    INPUT:
    n - (int) the number of top articles to return
    df - (pandas dataframe) df as defined at the top of the notebook 
    
    OUTPUT:
    top_articles - (list) A list of the top 'n' article titles 
    
    '''
    top_titles = df.groupby("title").size().sort_values(ascending=False).index
    return list(top_titles[:n])

# User-user based
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
    user_article_mat = df.groupby(["user_id", "article_id"])["title"].count().unstack()
    return user_article_mat.notnull().astype(int)


def get_article_names(article_ids, df):
    '''
    INPUT:
    article_ids - (list) a list of article ids
    df - (pandas dataframe) df as defined at the top of the notebook
    
    OUTPUT:
    article_names - (list) a list of article names associated with the list of article ids 
                    (this is identified by the title column)
    '''
    # Your code here
    article_names =[]
    for i in article_ids:
        article_names.append(df[df['article_id']==i]['title'].values[0])
    
    return article_names # Return the article names associated with list of article ids

def get_user_articles(user_id, user_item, df):
    '''
    INPUT:
    user_id - (int) a user id
    user_item - (pandas dataframe) matrix of users by articles: 
                1's when a user has interacted with an article, 0 otherwise
    
    OUTPUT:
    article_ids - (list) a list of the article ids seen by the user
    article_names - (list) a list of article names associated with the list of article ids 
                    (this is identified by the doc_full_name column in df_content)
    
    Description:
    Provides a list of the article_ids and article titles that have been seen by a user
    '''
    # Your code here
    # find the columns with article is 1
    inter_article_idx = np.where(user_item.loc[user_id]==1)
    inter_article_idx = list(user_item.columns[inter_article_idx])
    article_names = get_article_names(inter_article_idx, df)
    
    return inter_article_idx, article_names # return the ids and names


def find_similar_articles(article_id, df):
    '''
    INPUT:
    article_id - (float) a article_id
    df - pandas dataframe with article_id, title, user_id columns
    
    OUTPUT:
    similar_articles - (list) an ordered list where the closest users (largest dot product users)
                    are listed first
    
    '''
    user_article_mat = df.groupby(["article_id", "user_id"])["title"].count().unstack()
    item_user = user_article_mat.notnull().astype(int)
    articles_sim = item_user.dot(item_user.loc[article_id])
    sorted_arts = articles_sim.sort_values(ascending=False)
    most_sim_arts = list(sorted_arts.index)
    most_sim_arts.remove(article_id)
    return most_sim_arts


def get_top_sorted_arts(user_id, df, user_item):
    ''' 
    INPUT:
    user_id - (int)
    df - (pandas dataframe) df as define at the top of the notebook
    
    OUTPUT:
    sorted_articles - (list) list of top sorted article_ids viewed by the user
    '''
    rec = dict()
    sorted_arts = []

    user_article_inter = pd.DataFrame(df.groupby("article_id")["user_id"].count().sort_values(ascending=False))
    article_ids = get_user_articles(user_id, user_item, df)[0]

    for article_id in article_ids:
        article_idx = np.where(user_article_inter.index==article_id)[0][0]
        rec[article_id] = article_idx
        
    sorted_recs = sorted(rec.items(), key=lambda item: item[1])
    for i in sorted_recs:
        sorted_arts.append(i[0])
    
    return sorted_arts


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
    
    user_article_inter = pd.DataFrame(df.groupby('user_id')['article_id'].count())
    user_article_inter.columns = ['num_interactions']
    
    #join the two dataframe together
    neighbors_df = similar_ids_df.merge(user_article_inter, left_on= 'user_id', right_index=True)
    neighbors_df.rename(columns={'user_id':'neighbor_id'}, inplace=True)
    neighbors_df = neighbors_df.sort_values(by=['similarity','num_interactions'], ascending=False)
    
    return neighbors_df # Return the dataframe specified in the doc_string