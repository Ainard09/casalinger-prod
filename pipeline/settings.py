from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_file_encoding="utf-8")

    # Environment detection
    ENVIRONMENT: str = "development"
    
    # Core API Keys
    GROQ_API_KEY: str
    APP_SECRET_KEY: str
    MONGODB_URI: str

    # Supabase Configuration
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_SQLALCHEMY_DATABASE_URI: str
    SUPABASE_PUBLIC_URL: str

    # Vector Database Configuration
    QDRANT_API_KEY: str | None = None
    QDRANT_URL: str
    QDRANT_PORT: str = "6333"
    QDRANT_HOST: str | None = None

    # AI Model Configuration
    TEXT_MODEL_NAME: str = "llama-3.3-70b-versatile"
    SMALL_TEXT_MODEL_NAME: str = "gemma2-9b-it"

    # Email Configuration for Gmail
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = "Liadiazeez3@gmail.com"
    SMTP_PASSWORD: str 
    FROM_EMAIL: str = "noreply@casalinger.com"
    FROM_NAME: str = "CasaLinger"

    # Enhanced memory settings
    MEMORY_TOP_K: int = 5
    MEMORY_CONSOLIDATION_THRESHOLD: int = 10
    MEMORY_SIMILARITY_THRESHOLD: float = 0.8
    MEMORY_CACHE_SIZE: int = 100
    
    # Memory type weights for retrieval
    SEMANTIC_MEMORY_WEIGHT: float = 0.5
    EPISODIC_MEMORY_WEIGHT: float = 0.3
    PROCEDURAL_MEMORY_WEIGHT: float = 0.2
    
    # Conversation management
    ROUTER_MESSAGES_TO_ANALYZE: int = 3
    TOTAL_MESSAGES_SUMMARY_TRIGGER: int = 20
    TOTAL_MESSAGES_AFTER_SUMMARY: int = 5
    
    # Memory consolidation frequency
    MEMORY_CONSOLIDATION_FREQUENCY: int = 50  # Every 50 interactions


    # Environment-based properties
    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.ENVIRONMENT.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return self.ENVIRONMENT.lower() == "development"
    
    @property
    def debug_mode(self) -> bool:
        """Return debug mode based on environment"""
        return not self.is_production
    
    @property
    def cors_origins(self) -> list:
        """Return CORS origins based on environment"""
        if self.is_production:
            return [
                "https://yourdomain.com", 
                "https://www.yourdomain.com",
                "https://casalinger.com",
                "https://www.casalinger.com"
            ]
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    
    @property
    def api_url(self) -> str:
        """Return API URL based on environment"""
        if self.is_production:
            return "https://your-api-domain.com"  # Update with your production API domain
        return "http://127.0.0.1:5000"
    
    @property
    def frontend_url(self) -> str:
        """Return frontend URL based on environment"""
        if self.is_production:
            return "https://yourdomain.com"  # Update with your production frontend domain
        return "http://localhost:5173"
    
    @property
    def session_config(self) -> dict:
        """Return session configuration based on environment"""
        return {
            'secure': self.is_production,
            'httponly': True,
            'samesite': 'Lax' if self.is_production else None,
            'domain': None  # Let Flask handle it
        }
    
    @property
    def redis_config(self) -> dict:
        """Return Redis configuration based on environment"""
        if self.is_production:
            # Production Redis Cloud configuration
            return {
                'host': 'your-redis-cloud-host',  # Update with your Redis Cloud host
                'port': 6379,
                'username': 'your-redis-username',  # Update with your Redis Cloud username
                'password': 'your-redis-password',  # Update with your Redis Cloud password
                'ssl': True,
                'ssl_cert_reqs': None
            }
        else:
            # Development local Redis
            return {
                'host': 'localhost',
                'port': 6379,
                'db': 0
            }


settings = Settings()