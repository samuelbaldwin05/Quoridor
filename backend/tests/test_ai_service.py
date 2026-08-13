from __future__ import annotations

import asyncio
import importlib.util

import pytest

# ai_service imports torch_agent -> torch at module load; skip cleanly where torch
# isn't installed (e.g. a headless CI) before those imports run.
if importlib.util.find_spec("torch") is None:  # pragma: no cover
    pytest.skip("torch not installed", allow_module_level=True)

from app.ai import mcts_agent, torch_agent
from app.core.exceptions import AuthorizationError, InvalidMoveError
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
            asyncio.run(ai_service.choose_move(body, authenticated=True))

    def test_returns_serialized_model_move(self, monkeypatch) -> None:
        async def fake_get_move(state, budget):
            return PawnMove(to=Position(row=7, col=4))

        monkeypatch.setattr(torch_agent, "get_move", fake_get_move)
        resp = asyncio.run(
            ai_service.choose_move(AIMoveRequest(state=_state()), authenticated=False)
        )
        assert resp.move.kind == "pawn"
        assert resp.move.to is not None
        assert (resp.move.to.row, resp.move.to.col) == (7, 4)

    def test_default_engine_is_the_torch_model(self, monkeypatch) -> None:
        """An older client that sends no `engine` field must keep getting the PPO bot."""
        calls: list[str] = []

        async def fake_torch(state, budget):
            calls.append("torch")
            return PawnMove(to=Position(row=7, col=4))

        async def fake_mcts(state):
            calls.append("mcts")
            raise AssertionError("mcts should not be called by default")

        monkeypatch.setattr(torch_agent, "get_move", fake_torch)
        monkeypatch.setattr(mcts_agent, "get_move", fake_mcts)
        asyncio.run(ai_service.choose_move(AIMoveRequest(state=_state()), authenticated=False))
        assert calls == ["torch"]

    def test_mcts_engine_is_dispatched_and_reports_stats(self, monkeypatch) -> None:
        async def fake_mcts(state):
            return (
                WallMove(wall=Wall(row=2, col=3, orientation="v")),
                mcts_agent.SearchStats(
                    iterations=1234,
                    elapsed_ms=567,
                    target_iterations=8000,
                    threads=2,
                    cached=False,
                    engine_commit="deadbee",
                ),
            )

        monkeypatch.setattr(mcts_agent, "get_move", fake_mcts)
        resp = asyncio.run(
            ai_service.choose_move(AIMoveRequest(state=_state(), engine="mcts"), authenticated=True)
        )

        assert resp.move.kind == "wall"
        assert resp.stats is not None
        assert resp.stats.iterations == 1234
        assert resp.stats.threads == 2
        assert resp.stats.engine_commit == "deadbee"

    def test_guest_cannot_use_the_search_engine(self, monkeypatch) -> None:
        """The MCTS tier costs a second of CPU per move, so it is members-only. The UI locks it
        for guests; this is the check that actually enforces it."""
        called = False

        async def fake_mcts(state):
            nonlocal called
            called = True
            raise AssertionError("the engine should never be reached")

        monkeypatch.setattr(mcts_agent, "get_move", fake_mcts)
        with pytest.raises(AuthorizationError):
            asyncio.run(
                ai_service.choose_move(
                    AIMoveRequest(state=_state(), engine="mcts"), authenticated=False
                )
            )
        assert called is False

    def test_guest_can_still_use_the_torch_model(self, monkeypatch) -> None:
        async def fake_torch(state, budget):
            return PawnMove(to=Position(row=7, col=4))

        monkeypatch.setattr(torch_agent, "get_move", fake_torch)
        resp = asyncio.run(
            ai_service.choose_move(AIMoveRequest(state=_state()), authenticated=False)
        )
        assert resp.move.kind == "pawn"

    def test_torch_path_reports_no_search_stats(self, monkeypatch) -> None:
        async def fake_torch(state, budget):
            return PawnMove(to=Position(row=7, col=4))

        monkeypatch.setattr(torch_agent, "get_move", fake_torch)
        resp = asyncio.run(
            ai_service.choose_move(AIMoveRequest(state=_state()), authenticated=False)
        )
        assert resp.stats is None


class TestEngineStatus:
    def test_reports_availability_and_build(self, monkeypatch) -> None:
        monkeypatch.setattr(mcts_agent, "is_available", lambda: True)
        monkeypatch.setattr(mcts_agent, "engine_commit", lambda: "abc1234")
        status = ai_service.engine_status()
        assert status.mcts_available is True
        assert status.engine_commit == "abc1234"

    def test_reports_missing_engine(self, monkeypatch) -> None:
        monkeypatch.setattr(mcts_agent, "is_available", lambda: False)
        monkeypatch.setattr(mcts_agent, "engine_commit", lambda: "unavailable")
        status = ai_service.engine_status()
        assert status.mcts_available is False
