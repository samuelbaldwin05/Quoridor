from __future__ import annotations

import asyncio
import importlib.util

import pytest

# ai_service imports torch_agent -> torch at module load; skip cleanly where torch
# isn't installed (e.g. a headless CI) before those imports run.
if importlib.util.find_spec("torch") is None:  # pragma: no cover
    pytest.skip("torch not installed", allow_module_level=True)

from app.ai import torch_agent
from app.core.exceptions import InvalidMoveError
from app.engine.game_types import PawnMove, Position, Wall, WallMove
from app.schemas.ai import (
    AIMoveRequest,
    GameStatePayload,
    PlayerStatePayload,
    PositionPayload,
    WallPayload,
)
from app.services import ai_service


def _state(p0_goal: int = 0, p1_goal: int = 8, walls=None) -> GameStatePayload:
    return GameStatePayload(
        players=(
            PlayerStatePayload(
                position=PositionPayload(row=8, col=4), walls_remaining=10, goal_row=p0_goal
            ),
            PlayerStatePayload(
                position=PositionPayload(row=0, col=4), walls_remaining=10, goal_row=p1_goal
            ),
        ),
        walls=walls or [],
        current_player_index=0,
    )


class TestToEngineState:
    def test_converts_positions_walls_and_turn(self) -> None:
        payload = _state(walls=[WallPayload(row=2, col=3, orientation="h")])
        state = ai_service._to_engine_state(payload)
        assert state.players[0].position == Position(8, 4)
        assert state.players[0].goal_row == 0
        assert state.players[1].goal_row == 8
        assert state.walls == (Wall(2, 3, "h"),)
        assert state.current_player_index == 0
        assert state.status == "playing"
        assert state.winner is None


class TestSerializeMove:
    def test_pawn_move(self) -> None:
        payload = ai_service._serialize_move(PawnMove(to=Position(row=7, col=4)))
        assert payload.kind == "pawn"
        assert payload.to is not None
        assert (payload.to.row, payload.to.col) == (7, 4)
        assert payload.wall is None

    def test_wall_move(self) -> None:
        payload = ai_service._serialize_move(WallMove(wall=Wall(row=2, col=3, orientation="v")))
        assert payload.kind == "wall"
        assert payload.wall is not None
        assert (payload.wall.row, payload.wall.col, payload.wall.orientation) == (2, 3, "v")
        assert payload.to is None


class TestChooseMove:
    def test_shared_goal_row_rejected(self) -> None:
        body = AIMoveRequest(state=_state(p0_goal=0, p1_goal=0))
        with pytest.raises(InvalidMoveError):
            asyncio.run(ai_service.choose_move(body))

    def test_returns_serialized_model_move(self, monkeypatch) -> None:
        async def fake_get_move(state, budget):
            return PawnMove(to=Position(row=7, col=4))

        monkeypatch.setattr(torch_agent, "get_move", fake_get_move)
        resp = asyncio.run(ai_service.choose_move(AIMoveRequest(state=_state())))
        assert resp.move.kind == "pawn"
        assert resp.move.to is not None
        assert (resp.move.to.row, resp.move.to.col) == (7, 4)
