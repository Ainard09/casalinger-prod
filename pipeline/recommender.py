from helpers import *
from supabase_models import Listing
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class Recommender():
    def __init__(self, user_id, rec_num=5) -> None:
        self.user_id = user_id
        self.rec_num = rec_num
        self.data = load_datasets()
        self.listing_data = load_listing_data()
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

    
    def content_based(self, listing_id):
        """
        Recommend similar listings based on content attributes and prioritize by area and city.

        Args:
        - listing_id: The ID of the listing the user is viewing.

        Returns:
        - List of recommended listing objects.
        """
        feature_columns = ["bedrooms", "bathrooms", "price"]
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

        # Get all similar listings
        similar_listings = self.listing_data.iloc[similar_indices]
        
        # Create priority groups with explicit ordering
        recommended_ids = []
        seen_ids = set()
        
        # 1. First priority: Same area (maintain original similarity order)
        area_listings = similar_listings[similar_listings['area'] == current_area]
        for _, listing in area_listings.iterrows():
            if listing['id'] not in seen_ids:
                recommended_ids.append(listing['id'])
                seen_ids.add(listing['id'])
                if len(recommended_ids) >= self.rec_num:
                    break
        
        # 2. Second priority: Same city, different area (maintain original similarity order)
        if len(recommended_ids) < self.rec_num:
            city_listings = similar_listings[(similar_listings['city'] == current_city) & (similar_listings['area'] != current_area)]
            for _, listing in city_listings.iterrows():
                if listing['id'] not in seen_ids:
                    recommended_ids.append(listing['id'])
                    seen_ids.add(listing['id'])
                    if len(recommended_ids) >= self.rec_num:
                        break
        
        # 3. Third priority: Other cities (maintain original similarity order)
        if len(recommended_ids) < self.rec_num:
            other_listings = similar_listings[similar_listings['city'] != current_city]
            for _, listing in other_listings.iterrows():
                if listing['id'] not in seen_ids:
                    recommended_ids.append(listing['id'])
                    seen_ids.add(listing['id'])
                    if len(recommended_ids) >= self.rec_num:
                        break
        
        # exclude saved listings
        saved_listings = get_user_listings(self.user_id, self.user_item_mat)

        # Fetch the listings from the database in the correct order
        recommended_listings = []
        for listing_id in recommended_ids:
            if listing_id not in saved_listings:  #skip saved listings
                listing = Listing.query.get(listing_id)
                if listing:
                    recommended_listings.append(listing)
        return recommended_listings