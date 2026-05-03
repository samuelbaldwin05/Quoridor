from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.ai import torch_agent
from app.core.exceptions import InvalidMoveError
from app.core.rate_limit import limiter
from app.engine.game_types import (
    GameState,
    PawnMove,
    PlayerState,
    Position,
    Wall,
    WallMove,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class _Position(BaseModel):
    row: int = Field(ge=0, le=8)
    col: int = Field(ge=0, le=8)


class _Wall(BaseModel):
    row: int = Field(ge=0, le=7)
    col: int = Field(ge=0, le=7)
    orientation: Literal["h", "v"]


class _PlayerState(BaseModel):
    position: _Position
    walls_remaining: int = Field(ge=0, le=10)
    goal_row: Literal[0, 8]


class GameStatePayload(BaseModel):
    """Raw state submitted by the client. Validated and converted before
    handing to the engine."""

    players: tuple[_PlayerState, _PlayerState]
    walls: list[_Wall] = Field(default_factory=list, max_length=20)
    current_player_index: Literal[0, 1]


class MovePayload(BaseModel):
    kind: Literal["pawn", "wall"]
    to: _Position | None = None
    wall: _Wall | None = None


class AIMoveRequest(BaseModel):
    state: GameStatePayload
    # Reserved for the future C++ MCTS agent. Ignored by the torch model.
    time_budget_s: float = Field(default=1.0, ge=0.1, le=15.0)


class AIMoveResponse(BaseModel):
    move: MovePayload


def _to_engine_state(payload: GameStatePayload) -> GameState:
    return GameState(
        players=(
            PlayerState(
                position=Position(
                    row=payload.players[0].position.row,
                    col=payload.players[0].position.col,
                ),
                walls_remaining=payload.players[0].walls_remaining,
                goal_row=payload.players[0].goal_row,
            ),
            PlayerState(
                position=Position(
                    row=payload.players[1].position.row,
                    col=payload.players[1].position.col,
                ),
                walls_remaining=payload.players[1].walls_remaining,
                goal_row=payload.players[1].goal_row,
            ),
        ),
        walls=tuple(Wall(row=w.row, col=w.col, orientation=w.orientation) for w in payload.walls),
        current_player_index=payload.current_player_index,
        status="playing",
        winner=None,
    )


def _serialize_move(move: PawnMove | WallMove) -> MovePayload:
    if isinstance(move, PawnMove):
        return MovePayload(kind="pawn", to=_Position(row=move.to.row, col=move.to.col))
    return MovePayload(
        kind="wall",
        wall=_Wall(row=move.wall.row, col=move.wall.col, orientation=move.wall.orientation),
    )


@router.post("/move", response_model=AIMoveResponse)
@limiter.limit("60/minute")
async def ai_move(request: Request, body: AIMoveRequest) -> AIMoveResponse:
    """Choose a move for the current player using the trained PPO model."""
    if body.state.players[0].goal_row == body.state.players[1].goal_row:
        raise InvalidMoveError("players cannot share a goal row")

    state = _to_engine_state(body.state)
    move = await torch_agent.get_move(state, body.time_budget_s)
    return AIMoveResponse(move=_serialize_move(move))
