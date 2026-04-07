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
    player1_id: UUID | None
    player2_id: UUID | None
    winner_id: UUID | None
    mode: GameMode
    status: GameStatus
    time_control: int | None
    move_history: list[str]
    player1_name: str | None
    player2_name: str | None
    elo_change_p1: int | None
    elo_change_p2: int | None
    created_at: datetime
    completed_at: datetime | None


class MoveCreate(BaseModel):
    notation: str  # e.g. "e2" for pawn, "e3h" for wall


class GameResultRequest(BaseModel):
    winner_index: int        # 0 = player1 won, 1 = player2 won
    move_history: list[str] = []


class GameResultResponse(BaseModel):
    game_id: UUID
    winner_id: UUID
    elo_change_p1: int
    elo_change_p2: int
    new_elo_p1: int
    new_elo_p2: int
