from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import ai, auth, challenges, friends, games, matchmaking, users
from app.core.config import settings
from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    CooldownError,
    DatabaseError,
    EngineBusyError,
    EngineUnavailableError,
    GameAlreadyFinishedError,
    InvalidMoveError,
    NotFoundError,
    QuoridorError,
    ValidationError,
)
from app.core.logging import configure_logging
from app.core.middleware import RequestIdMiddleware
from app.core.rate_limit import limiter

configure_logging()

app = FastAPI(title="Quoridor API", version="0.1.0")

app.state.limiter = limiter

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestIdMiddleware)

# The dev frontend can be served from localhost:8000; only allow it outside prod
# so a credentialed CORS context isn't opened to localhost in production.
_cors_origins = list(settings.cors_origins)
if settings.environment == "development":
    _cors_origins.append("http://localhost:8000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_STATUS_BY_EXCEPTION: dict[type[QuoridorError], int] = {
    NotFoundError: 404,
    AuthorizationError: 403,
    ConflictError: 409,
    GameAlreadyFinishedError: 409,
    InvalidMoveError: 422,
    ValidationError: 422,
    CooldownError: 429,
    DatabaseError: 500,
    EngineBusyError: 503,
    EngineUnavailableError: 503,
}

# How long a client should wait before asking the search engine again. Short, because the
# client is expected to play the move with its own engine now and only come back next turn.
_ENGINE_RETRY_AFTER_S = "2"


@app.exception_handler(QuoridorError)
async def quoridor_exception_handler(_: Request, exc: QuoridorError) -> JSONResponse:
    status = _STATUS_BY_EXCEPTION.get(type(exc), 500)
    headers = {"Retry-After": _ENGINE_RETRY_AFTER_S} if status == 503 else None
    return JSONResponse(
        status_code=status,
        content={"detail": str(exc) or exc.__class__.__name__},
        headers=headers,
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(status_code=429, content={"detail": f"rate limit exceeded: {exc.detail}"})


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(friends.router)
app.include_router(challenges.router)
app.include_router(matchmaking.router)
app.include_router(games.router)
app.include_router(ai.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
