from supabase import create_client, Client
from settings import settings
import os
from typing import Optional, Dict, Any
import json

class SupabaseManager:
    def __init__(self):
        self.supabase: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY
        )
        self.service_client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
    
    def get_client(self) -> Client:
        """Get the main Supabase client for user operations"""
        return self.supabase
    
    def get_service_client(self) -> Client:
        """Get the service role client for admin operations"""
        return self.service_client
    
    # Authentication methods
    def sign_up(self, email: str, password: str, user_metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """Sign up a new user"""
        try:
            response = self.supabase.auth.sign_up({
                "email": email,
                "password": password,
                "options": {
                    "data": user_metadata or {}
                }
            })
            return response
        except Exception as e:
            raise Exception(f"Sign up failed: {str(e)}")
    
    def sign_in(self, email: str, password: str) -> Dict[str, Any]:
        """Sign in a user"""
        try:
            response = self.supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            return response
        except Exception as e:
            raise Exception(f"Sign in failed: {str(e)}")
    
    def sign_out(self) -> Dict[str, Any]:
        """Sign out the current user"""
        try:
            response = self.supabase.auth.sign_out()
            return response
        except Exception as e:
            raise Exception(f"Sign out failed: {str(e)}")
    
    def get_user(self) -> Optional[Dict[str, Any]]:
        """Get the current user"""
        try:
            response = self.supabase.auth.get_user()
            return response.user
        except Exception:
            return None
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify a JWT token"""
        try:
            response = self.supabase.auth.get_user(token)
            return response.user
        except Exception:
            return None
    
    # Storage methods
    def upload_file(self, bucket: str, path: str, file_data: bytes, content_type: str = None) -> str:
        """Upload a file to Supabase storage"""
        try:
            response = self.supabase.storage.from_(bucket).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type} if content_type else {}
            )
            # Get the public URL
            public_url = self.supabase.storage.from_(bucket).get_public_url(path)
            return public_url
        except Exception as e:
            raise Exception(f"File upload failed: {str(e)}")
    
    def delete_file(self, bucket: str, path: str) -> bool:
        """Delete a file from Supabase storage"""
        try:
            self.supabase.storage.from_(bucket).remove([path])
            return True
        except Exception as e:
            raise Exception(f"File deletion failed: {str(e)}")
    
    def get_file_url(self, bucket: str, path: str) -> str:
        """Get the public URL of a file"""
        return self.supabase.storage.from_(bucket).get_public_url(path)
    
    # Database methods
    def insert(self, table: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Insert data into a table"""
        try:
            response = self.supabase.table(table).insert(data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            raise Exception(f"Insert failed: {str(e)}")
    
    def select(self, table: str, query: str = "*", filters: Dict[str, Any] = None) -> Dict[str, Any]:
        """Select data from a table"""
        try:
            query_builder = self.supabase.table(table).select(query)
            if filters:
                for key, value in filters.items():
                    query_builder = query_builder.eq(key, value)
            response = query_builder.execute()
            return response.data
        except Exception as e:
            raise Exception(f"Select failed: {str(e)}")
    
    def update(self, table: str, data: Dict[str, Any], filters: Dict[str, Any]) -> Dict[str, Any]:
        """Update data in a table"""
        try:
            query_builder = self.supabase.table(table).update(data)
            for key, value in filters.items():
                query_builder = query_builder.eq(key, value)
            response = query_builder.execute()
            return response.data[0] if response.data else None
        except Exception as e:
            raise Exception(f"Update failed: {str(e)}")
    
    def delete(self, table: str, filters: Dict[str, Any]) -> bool:
        """Delete data from a table"""
        try:
            query_builder = self.supabase.table(table).delete()
            for key, value in filters.items():
                query_builder = query_builder.eq(key, value)
            response = query_builder.execute()
            return True
        except Exception as e:
            raise Exception(f"Delete failed: {str(e)}")

# Global instance
supabase_manager = SupabaseManager()