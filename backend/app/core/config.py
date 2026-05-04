from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str
    supabase_service_role_key: str

    # HS256 shared secret — only used when verifying tokens from Supabase Local Dev.
    # Prod tokens are signed with asymmetric keys and verified via JWKS.
    supabase_jwt_secret: str | None = None

    environment: str = "development"  # "development" | "production"

    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
