from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Must match GoTrue's JWT_SECRET
    supabase_jwt_secret: str = "super-secret-jwt-token-with-at-least-32-characters-long"

    environment: str = "development"  # "development" | "production"

    # Comma-separated list of allowed CORS origins
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
