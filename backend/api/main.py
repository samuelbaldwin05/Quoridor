from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from api import friends, matchmaking, users

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

app.include_router(users.router)
app.include_router(friends.router)
app.include_router(matchmaking.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
