from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, field_validator


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
MoveNotation = Annotated[str, StringConstraints(pattern=r"^[a-i][1-9][hv]?$", strip_whitespace=True)]


class GameCreate(BaseModel):
    mode: GameMode
    time_control: int | None = None


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


class GameResultRequest(BaseModel):
    winner_index: int = Field(ge=0, le=1)
    move_history: list[MoveNotation] = Field(default_factory=list, max_length=500)

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
