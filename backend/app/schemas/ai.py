from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PositionPayload(BaseModel):
    row: int = Field(ge=0, le=8)
    col: int = Field(ge=0, le=8)


class WallPayload(BaseModel):
    row: int = Field(ge=0, le=7)
    col: int = Field(ge=0, le=7)
    orientation: Literal["h", "v"]


class PlayerStatePayload(BaseModel):
    position: PositionPayload
    walls_remaining: int = Field(ge=0, le=10)
    goal_row: Literal[0, 8]


class GameStatePayload(BaseModel):
    """Raw state submitted by the client. Validated and converted before
    handing to the engine."""

    players: tuple[PlayerStatePayload, PlayerStatePayload]
    walls: list[WallPayload] = Field(default_factory=list, max_length=20)
    current_player_index: Literal[0, 1]


class MovePayload(BaseModel):
    kind: Literal["pawn", "wall"]
    to: PositionPayload | None = None
    wall: WallPayload | None = None


class AIMoveRequest(BaseModel):
    state: GameStatePayload
    # Reserved for the future C++ MCTS agent. Ignored by the torch model.
    time_budget_s: float = Field(default=1.0, ge=0.1, le=15.0)


class AIMoveResponse(BaseModel):
    move: MovePayload
