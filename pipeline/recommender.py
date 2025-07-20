from supabase_models import Listing, Interaction, User
from sqlalchemy import func, desc
from sklearn.metrics.pairwise import cosine_similarity
import pandas as pd
import numpy as np


class Recommender:
    def __init__(self, user_id, rec_num=5):
        self.user_id = user_id
        self.rec_num = rec_num

    def rank_based(self):
        # Get top listings by number of interactions (views + saves)
        top_listing_ids = (
            Interaction.query
            .with_entities(Interaction.listing_id, func.count(Interaction.id).label('num_interactions'))
            .group_by(Interaction.listing_id)
            .order_by(desc('num_interactions'))
            .limit(self.rec_num)
            .all()
        )
        listing_ids = [row.listing_id for row in top_listing_ids]
        top_listings = Listing.query.filter(Listing.id.in_(listing_ids)).all()
        return top_listings

    def user_rec(self):
        # Get the user's saved listings
        saved_interactions = Interaction.query.filter_by(user_id=self.user_id, interaction_type="saved").all()
        saved_listing_ids = [i.listing_id for i in saved_interactions]
        if not saved_listing_ids:
            return self.rank_based()

        # Get the areas and cities of the user's saved listings
        saved_listings = Listing.query.filter(Listing.id.in_(saved_listing_ids)).all()
        saved_areas = set(l.area for l in saved_listings if l.area)
        saved_cities = set(l.city for l in saved_listings if l.city)

        # Find other users who have saved listings in the same areas/cities
        similar_user_ids = (
            Interaction.query
            .with_entities(Interaction.user_id)
            .filter(Interaction.listing_id.in_(saved_listing_ids), Interaction.user_id != self.user_id)
            .distinct()
            .all()
        )
        similar_user_ids = [row.user_id for row in similar_user_ids]

        # Get listings saved by similar users, prioritize by area/city
        recs = []
        if similar_user_ids:
            similar_interactions = (
                Interaction.query
                .filter(Interaction.user_id.in_(similar_user_ids), Interaction.interaction_type == "saved")
                .all()
            )
            for interaction in similar_interactions:
                listing = Listing.query.get(interaction.listing_id)
                if not listing or listing.id in saved_listing_ids or listing.id in recs:
                    continue
                if listing.area in saved_areas:
                    recs.append(listing.id)
                elif listing.city in saved_cities:
                    recs.append(listing.id)
                else:
                    recs.append(listing.id)
                if len(recs) >= self.rec_num:
                    break
        # Fallback to rank-based if not enough recs
        if len(recs) < self.rec_num:
            more = [l.id for l in self.rank_based() if l.id not in recs and l.id not in saved_listing_ids]
            recs.extend(more[:self.rec_num - len(recs)])
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
