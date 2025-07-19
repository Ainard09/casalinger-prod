from helpers import *
from supabase_models import Listing
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class Recommender():
    def __init__(self, user_id, data, rec_num=5) -> None:
        self.user_id = user_id
        self.rec_num = rec_num
        self.data = load_datasets(data)
        self.listing_data = load_listing_data(data)
        self.user_item_mat = create_user_item_matrix(self.data)

    def rank_based(self):
        top_listing_ids = get_top_listing_ids(self.rec_num, self.data)
        # Fetch the listings from the database
        top_listings = Listing.query.filter(Listing.id.in_(top_listing_ids)).all()
        return top_listings

    def user_rec(self):
        """
        Generate personalized recommendations based on saved listings' area and city.
        
        Returns:
        - A list of recommended listing objects.
        """
        recs = []

        # Get the user's saved listing IDs and their associated areas/cities
        saved_listings = get_user_listings(self.user_id, self.user_item_mat)
        saved_areas = self.listing_data[self.listing_data['id'].isin(saved_listings)]['area'].unique()
        saved_cities = self.listing_data[self.listing_data['id'].isin(saved_listings)]['city'].unique()

        # Get the neighbors (similar users)
        neighbors_df = get_top_sorted_users(self.user_id, self.data, self.user_item_mat)

        for neighbor in neighbors_df['neighbor_id']:
            neighbor_listings = get_top_sorted_lists(neighbor, self.data, self.user_item_mat)

            # Prioritize by area and city
            for listing_id in neighbor_listings:
                listing = self.listing_data[self.listing_data['id'] == listing_id].iloc[0]
                if listing_id not in saved_listings:  # Exclude already saved listings
                    if listing['area'] in saved_areas:
                        recs.append(listing_id)
                    elif listing['city'] in saved_cities and listing['area'] not in saved_areas:
                        recs.append(listing_id)
                    else:
                        recs.append(listing_id)
                    if len(recs) >= self.rec_num:
                        break
            if len(recs) >= self.rec_num:
                break

        # Fetch listings from the database
        recommended_listings = Listing.query.filter(Listing.id.in_(recs[:self.rec_num])).all()

        return recommended_listings


    # def content_based(self, listing_id):
    #     # Get saved listings for the user
    #     saved_listings = get_user_listings(self.user_id, self.user_item_mat)

    #     # Get similar listings using content-based filtering
    #     similar_listings = find_similar_listings(listing_id, self.data)

    #     # Exclude saved listings
    #     filtered_similar_listings = [listing for listing in similar_listings if listing not in saved_listings]
    #     # Fetch the listings from the database
    #     filtered_similar_listings = Listing.query.filter(Listing.id.in_(filtered_similar_listings)).all()

    #     return filtered_similar_listings[:self.rec_num]
    
    def content_based(self, listing_id):
        """
        Recommend similar listings based on content attributes and prioritize by area and city.

        Args:
        - listing_id: The ID of the listing the user is viewing.

        Returns:
        - List of recommended listing objects.
        """
        feature_columns = ["bedrooms", "bathrooms", "price"]  # Features to compare
        content_features = self.listing_data[feature_columns]

        # Normalize the feature values
        content_features_normalized = (content_features - content_features.mean()) / content_features.std()

        # Compute cosine similarity between listings
        similarity_matrix = cosine_similarity(content_features_normalized)

        # Get the index of the given listing_id
        listing_index = self.listing_data.index[self.listing_data['id'] == listing_id].tolist()[0]

        # Get similarity scores and sort
        similarity_scores = similarity_matrix[listing_index]
        similar_indices = similarity_scores.argsort()[::-1]
        similar_indices = [idx for idx in similar_indices if idx != listing_index]  # Exclude the current listing

        # Retrieve the listing data for filtering
        current_listing = self.listing_data.iloc[listing_index]
        current_area = current_listing['area']
        current_city = current_listing['city']

        # Split similar listings into prioritized groups
        similar_listings = self.listing_data.iloc[similar_indices]
        area_listings = similar_listings[similar_listings['area'] == current_area]
        city_listings = similar_listings[(similar_listings['city'] == current_city) & (similar_listings['area'] != current_area)]
        other_listings = similar_listings[(similar_listings['city'] != current_city)]

        # Combine prioritized groups
        final_recommendations = pd.concat([area_listings, city_listings, other_listings])

        # Limit the recommendations to the top rec_num listings
        recommended_ids = final_recommendations['id'].tolist()[:self.rec_num]

        # Fetch the listings from the database
        recommended_listings = Listing.query.filter(Listing.id.in_(recommended_ids)).all()

        return recommended_listings
