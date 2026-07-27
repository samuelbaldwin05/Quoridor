from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str
    supabase_service_role_key: str

    # HS256 shared secret — only used when verifying tokens from Supabase Local Dev.
    # Prod tokens are signed with asymmetric keys and verified via JWKS.
    supabase_jwt_secret: str | None = None

    # Expected `iss` claim for access tokens (e.g. https://<ref>.supabase.co/auth/v1).
    # OPT-IN: leave unset to skip issuer verification. Do NOT derive it from
    # supabase_url — inside Docker that's an internal hostname (kong) that never
    # matches the token's external issuer, which would 401 every login.
    supabase_jwt_issuer: str | None = None

    environment: str = "development"  # "development" | "production"

    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
