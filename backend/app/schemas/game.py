from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, field_validator

# Supported clock lengths (seconds): 3 / 5 / 10 minutes. Shared by GameCreate,
# ChallengeCreate, and the matchmaking JoinQueueRequest so an invalid clock is
# rejected at the request boundary rather than persisted.
TimeControl = Literal[180, 300, 600]


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


# Pawn move ("e2") or wall move ("e3v"). Walls can only sit on ranks 2..9
# (engine row 0..7) but matching it here makes invalid notation fail at the
# request boundary instead of inside the engine.
_NOTATION_RE = re.compile(r"^[a-i][1-9][hv]?$")
MoveNotation = Annotated[
    str, StringConstraints(pattern=r"^[a-i][1-9][hv]?$", strip_whitespace=True)
]


class GameCreate(BaseModel):
    mode: GameMode
    time_control: TimeControl | None = None


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
    notation: MoveNotation


# How a game ended. "win" = a player reached their goal row and must be proven by
# replaying move_history. "resign"/"timeout" = the CALLER forfeits; the server
# records the caller as the loser and ignores any client-supplied winner_index.
ResultReason = Literal["win", "resign", "timeout"]


class GameResultRequest(BaseModel):
    winner_index: int = Field(ge=0, le=1)
    move_history: list[MoveNotation] = Field(default_factory=list, max_length=500)
    reason: ResultReason = "win"

    @field_validator("move_history")
    @classmethod
    def _strip_blanks(cls, v: list[str]) -> list[str]:
        # Pydantic already enforces the per-item regex via the annotated type;
        # this is just an extra guard against empty strings sneaking in.
        return [s for s in v if _NOTATION_RE.match(s)]


class GameResultResponse(BaseModel):
    game_id: UUID
    winner_id: UUID
    elo_change_p1: int
    elo_change_p2: int
    new_elo_p1: int
    new_elo_p2: int


class GameSummary(BaseModel):
    """One finished game from a specific player's perspective (history list row)."""

    id: UUID
    mode: GameMode
    time_control: int | None
    opponent_id: UUID | None
    opponent_name: str | None
    result: Literal["win", "loss"]
    elo_change: int | None  # the requested player's delta
    move_count: int
    completed_at: datetime | None


class GameDetail(BaseModel):
    """Full record for replaying a finished game (public — no per-player view)."""

    id: UUID
    mode: GameMode
    status: GameStatus
    time_control: int | None
    player1_id: UUID | None
    player2_id: UUID | None
    player1_name: str | None
    player2_name: str | None
    winner_index: int | None
    move_history: list[str]
    completed_at: datetime | None
    created_at: datetime


class MoveSubmitRequest(BaseModel):
    notation: MoveNotation


class MoveSubmitResponse(BaseModel):
    # Authoritative state after the move was validated + recorded server-side.
    move_number: int  # 1-based index of the move just applied
    current_player_index: int  # whose turn it is now (0 or 1)
    status: GameStatus
    winner: int | None = None  # 0/1 if the move ended the game, else None
