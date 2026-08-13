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

    # ── MCTS bot ──────────────────────────────────────────────────────────────
    # Strength is budgeted in search iterations rather than milliseconds, so the bot plays
    # the same on a busy box as on an idle one. See docs/MCTS_INTEGRATION.md.

    # Total iterations per move, summed across worker threads. Raise for a stronger bot.
    mcts_target_iterations: int = 8000
    # Floor applied when the box is too slow to reach the target inside the time cap.
    mcts_min_iterations: int = 800
    # Hard ceiling on how long one move may take. The iteration budget is trimmed to fit.
    mcts_time_cap_ms: int = 3000
    # The first search of a process runs at this budget instead of the full target: it
    # produces a real move and measures how fast this box actually is, so the wall-clock cap
    # is enforced from a measurement rather than from a guess about the hardware.
    mcts_calibration_iterations: int = 500
    # Root parallelization width per search, and how many searches may run at once.
    # 0 means derive both from the CPU count.
    mcts_threads: int = 0
    mcts_max_concurrent: int = 0
    # How long a request may wait for a search slot before it is shed with a 503.
    mcts_queue_timeout_s: float = 1.5
    # Tuned in the engine repo (NOTES.md) for a ~500ms-class budget.
    mcts_fence_penalty: float = 0.062
    # Progressive widening. Without it the search only descends into fully expanded nodes, so
    # it spends a visit on every candidate action before gaining any depth. 0 disables it.
    mcts_pw_k: float = 2.0
    mcts_pw_alpha: float = 0.5
    # Positions to remember. Openings repeat across users; 0 disables the cache.
    mcts_cache_size: int = 512


settings = Settings()
