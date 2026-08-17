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


# How a game ended.
#   "win"              a player reached their goal row; proven by replaying move_history.
#   "resign"/"timeout" the CALLER forfeits; the server records the caller as the loser
#                      and ignores any client-supplied winner_index.
#   "disconnect"       the caller reports that the OPPONENT abandoned the game. The
#                      caller is recorded as the winner, but only if the server's own
#                      replay shows it is currently the opponent's turn (i.e. the caller
#                      has already made their move and the absent player owes the next
#                      one). See game_service.record_game_result.
ResultReason = Literal["win", "resign", "timeout", "disconnect"]


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


# Bot difficulty levels, mirroring the frontend Settings.difficulty union. Kept in step with
# the games.ai_difficulty CHECK constraint (migration 018): adding a level here without the
# migration turns every synced game against it into a constraint violation.
BotDifficulty = Literal["bot0", "bot1", "bot2", "extreme", "mcts"]


class BotGameCreate(BaseModel):
    """A completed single-player bot game reported by the client.

    History only: accepted as-is with NO server-side move validation, because there
    is no opponent and nothing at stake (the worst case is a user faking their own
    single-player history). `client_game_id` makes the write idempotent so the
    one-time login backfill can re-send safely. winner_index 0 = the user, 1 = bot.
    """

    client_game_id: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]
    ai_difficulty: BotDifficulty
    winner_index: int = Field(ge=0, le=1)
    move_history: list[MoveNotation] = Field(default_factory=list, max_length=500)

    @field_validator("move_history")
    @classmethod
    def _strip_blanks(cls, v: list[str]) -> list[str]:
        return [s for s in v if _NOTATION_RE.match(s)]


class BotGameRead(BaseModel):
    id: UUID
    client_game_id: str
    ai_difficulty: BotDifficulty
    winner_index: int
    status: GameStatus
    created: bool  # False when the game already existed (idempotent no-op)


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
    # Null until the game finalizes. Carried here so the winner of a forfeit can read the
    # delta it earned them: only the forfeiting player may submit that result, so the
    # winner's client never gets a response with the numbers in it.
    elo_change_p1: int | None = None
    elo_change_p2: int | None = None
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
