// API Configuration
const rawApiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';
const API_BASE_URL = rawApiUrl.replace(/\/$/, ''); // Remove trailing slash
const IS_PRODUCTION = import.meta.env.MODE === 'production';

// Debug logging
console.log('🔧 Environment Variables:', {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  MODE: import.meta.env.MODE,
  API_BASE_URL: API_BASE_URL,
  IS_PRODUCTION: IS_PRODUCTION
});

// Supabase Configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// API Endpoints
const API_ENDPOINTS = {
  // Auth & User
  USER_PROFILE: `${API_BASE_URL}/api/user/profile`,
  USER_DASHBOARD: (userId) => `${API_BASE_URL}/api/user/${userId}/dashboard`,
  USER_ONBOARDING: `${API_BASE_URL}/api/user/onboarding`,
  
  // Agent
  AGENT_PROFILE: `${API_BASE_URL}/api/agent/profile`,
  AGENT_PROFILE_UPDATE: `${API_BASE_URL}/api/agent/profile/update`,
  AGENT_ONBOARDING: `${API_BASE_URL}/api/agent/onboarding`,
  AGENT_LOGIN: `${API_BASE_URL}/api/agent/login`,
  AGENT_REGISTER: `${API_BASE_URL}/api/agent/register`,
  AGENT_LISTINGS: (agentId) => `${API_BASE_URL}/api/agent/${agentId}/listings`,
  AGENT_APPLICATIONS: (agentId) => `${API_BASE_URL}/api/agent/${agentId}/applications`,
  AGENT_BOOKINGS: (agentId) => `${API_BASE_URL}/api/agent/${agentId}/bookings`,
  AGENT_ANALYTICS: (agentId) => `${API_BASE_URL}/api/agent/${agentId}/analytics`,
  AGENT_TRENDS: (agentId) => `${API_BASE_URL}/api/agent/${agentId}/trends`,
  AGENT_LOCATIONS: (agentId) => `${API_BASE_URL}/api/agent/${agentId}/locations`,
  CHECK_AGENT_EXISTS: `${API_BASE_URL}/api/check-agent-exists`,
  
  // Admin
  ADMIN_PROFILE: `${API_BASE_URL}/api/admin/profile`,
  ADMIN_ONBOARDING: `${API_BASE_URL}/api/admin/onboarding`,
  ADMIN_PROPERTIES: `${API_BASE_URL}/api/admin/properties`,
  ADMIN_AGENTS: `${API_BASE_URL}/api/admin/agents`,
  ADMIN_FEATURED_PROPERTIES: `${API_BASE_URL}/api/admin/featured-properties`,
  ADMIN_PROPERTY_FEATURE: (propertyId, action) => `${API_BASE_URL}/api/admin/property/${propertyId}/${action}`,
  
  // Properties
  FEATURED_PROPERTIES: `${API_BASE_URL}/api/featured-properties`,
  SEARCH_PROPERTIES: `${API_BASE_URL}/api/search-properties`,
  LISTING_DETAILS: (id) => `${API_BASE_URL}/api/listing/${id}`,
  UPDATE_LISTING: (id) => `${API_BASE_URL}/api/listing/${id}`,
  CREATE_LISTING: `${API_BASE_URL}/api/listings`,
  PROMOTE_LISTING: (id) => `${API_BASE_URL}/api/listing/${id}/promote`,
  PAUSE_PROMOTION: (id) => `${API_BASE_URL}/api/listing/${id}/pause-promotion`,
  RESUME_PROMOTION: (id) => `${API_BASE_URL}/api/listing/${id}/resume-promotion`,
  
  // Interactions
  INTERACTION: `${API_BASE_URL}/api/interaction`,
  SAVE_LISTING: (id) => `${API_BASE_URL}/toggle_save_listing/${id}`,
  
  // Community
  COMMUNITY_POSTS: `${API_BASE_URL}/api/community`,
  COMMUNITY_POST: (id) => `${API_BASE_URL}/api/community/post/${id}`,
  COMMUNITY_LIKE: `${API_BASE_URL}/api/community/like`,
  COMMUNITY_COMMENT: `${API_BASE_URL}/api/community/comment`,
  COMMUNITY_COMMENT_LIKE: `${API_BASE_URL}/api/community/comment/like`,
  
  // Applications & Bookings
  PROPERTY_APPLICATIONS: `${API_BASE_URL}/api/property-applications`,
  USER_APPLICATIONS: (userId) => `${API_BASE_URL}/api/property-applications/${userId}`,
  VIEWING_BOOKINGS: `${API_BASE_URL}/api/viewing-bookings`,
  USER_BOOKINGS: (userId) => `${API_BASE_URL}/api/viewing-bookings/${userId}`,
  UPDATE_APPLICATION_STATUS: (id) => `${API_BASE_URL}/api/agent/application/${id}/status`,
  UPDATE_BOOKING_STATUS: (id) => `${API_BASE_URL}/api/agent/booking/${id}/status`,
  
  // Media & Content
  UPLOAD_REEL: `${API_BASE_URL}/api/upload-reel`,
  DELETE_REEL: `${API_BASE_URL}/api/delete-reel`,
  USER_REELS: `${API_BASE_URL}/api/user-reels`,
  PERSONALIZED_REELS: `${API_BASE_URL}/api/personalized-reels`,
  
  // Analytics & Market
  MARKET_ANALYTICS: `${API_BASE_URL}/api/market/analytics`,
  
  // Messaging
  SEND_MESSAGE: `${API_BASE_URL}/api/send-message`,
  
  // AI
  ASK_AI: `${API_BASE_URL}/ask_ai`,
  
  // Cache
  CACHE_STATS: `${API_BASE_URL}/api/cache/stats`,
  CACHE_CLEAR: `${API_BASE_URL}/api/cache/clear`,
  CACHE_CLEAR_AGENT: (agentId) => `${API_BASE_URL}/api/cache/clear-agent/${agentId}`,
  
  // Auth Checks
  CHECK_USER_EXISTS: `${API_BASE_URL}/api/check-user-exists`,
};

// Helper function to build URLs with query parameters
const buildUrl = (baseUrl, params = {}) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};

export {
  API_BASE_URL,
  IS_PRODUCTION,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  API_ENDPOINTS,
  buildUrl
}; 