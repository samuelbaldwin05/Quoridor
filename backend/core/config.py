from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""

    secret_key: str = "change-me-in-production"
    debug: bool = False

    # Comma-separated list of allowed CORS origins
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
