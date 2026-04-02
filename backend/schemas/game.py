from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


class GameMode(StrEnum):
    PASS_AND_PLAY = "pass_and_play"
    VS_AI = "vs_ai"
    RANKED = "ranked"
    CASUAL = "casual"


class GameStatus(StrEnum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"
    RESIGNED = "resigned"


class GameCreate(BaseModel):
    mode: GameMode
    time_control: int | None = None  # seconds per player, None = untimed


class GameRead(BaseModel):
    id: UUID
    player1_id: UUID
    player2_id: UUID | None
    winner_id: UUID | None
    mode: GameMode
    status: GameStatus
    time_control: int | None
    move_history: list[str]
    created_at: datetime
    completed_at: datetime | None


class MoveCreate(BaseModel):
    notation: str  # e.g. "e2" for pawn, "e3h" for wall
