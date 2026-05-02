from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str
    supabase_service_role_key: str

    # Must match GoTrue's JWT_SECRET. Required — no default to prevent prod
    # accidentally running with a well-known signing key.
    supabase_jwt_secret: str

    environment: str = "development"  # "development" | "production"

    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()

# Fail fast if a prod deployment somehow ships with the dev JWT secret baked in.
_DEV_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"
if settings.environment == "production" and settings.supabase_jwt_secret == _DEV_JWT_SECRET:
    raise RuntimeError(
        "Refusing to start: SUPABASE_JWT_SECRET is the well-known dev value but "
        "ENVIRONMENT=production. Set a real secret."
    )
