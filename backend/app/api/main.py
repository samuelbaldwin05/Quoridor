from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, challenges, friends, games, matchmaking, users
from app.core.config import settings
from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    DatabaseError,
    GameAlreadyFinishedError,
    InvalidMoveError,
    NotFoundError,
    QuoridorError,
)

app = FastAPI(title="Quoridor API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        *settings.cors_origins,
        "http://localhost:8000",
    ],
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
    DatabaseError: 500,
}


@app.exception_handler(QuoridorError)
async def quoridor_exception_handler(_: Request, exc: QuoridorError) -> JSONResponse:
    status = _STATUS_BY_EXCEPTION.get(type(exc), 500)
    return JSONResponse(status_code=status, content={"detail": str(exc) or exc.__class__.__name__})


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(friends.router)
app.include_router(challenges.router)
app.include_router(matchmaking.router)
app.include_router(games.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
