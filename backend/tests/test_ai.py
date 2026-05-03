from __future__ import annotations

import importlib.util

import pytest

from app.engine.game_types import (
    GameState,
    PawnMove,
    PlayerState,
    Position,
    WallMove,
)

torch_unavailable = importlib.util.find_spec("torch") is None
pytestmark = pytest.mark.skipif(torch_unavailable, reason="torch not installed in this environment")


def _starting_state(current: int = 0) -> GameState:
    return GameState(
        players=(
            PlayerState(position=Position(row=8, col=4), walls_remaining=10, goal_row=0),
            PlayerState(position=Position(row=0, col=4), walls_remaining=10, goal_row=8),
        ),
        walls=(),
        current_player_index=current,  # type: ignore[arg-type]
        status="playing",
        winner=None,
    )


def test_get_move_returns_legal_pawn_or_wall_move() -> None:
    from app.ai import torch_agent  # local import — torch loads here

    move = torch_agent._sync_get_move(_starting_state())
    assert isinstance(move, (PawnMove, WallMove))


def test_starting_pawn_move_lands_on_adjacent_square() -> None:
    """The model can play either side, and from the start position any chosen
    pawn move must be one of the three legal directions for P0."""
    from app.ai import torch_agent

    move = torch_agent._sync_get_move(_starting_state(current=0))
    if isinstance(move, PawnMove):
        # Legal first moves for P0: e2 (7,4), d1 (8,3), f1 (8,5)
        assert (move.to.row, move.to.col) in {(7, 4), (8, 3), (8, 5)}


def test_p1_pawn_move_lands_on_adjacent_square() -> None:
    from app.ai import torch_agent

    move = torch_agent._sync_get_move(_starting_state(current=1))
    if isinstance(move, PawnMove):
        # Legal first moves for P1: e8 (1,4), d9 (0,3), f9 (0,5)
        assert (move.to.row, move.to.col) in {(1, 4), (0, 3), (0, 5)}


def test_adapter_walls_round_trip() -> None:
    """Backend Wall(row, col, h|v) maps directly to QuoridorAI's h_walls / v_walls."""
    from app.ai.torch_agent import _to_quoridor_state
    from app.engine.game_types import Wall

    state = GameState(
        players=(
            PlayerState(position=Position(row=8, col=4), walls_remaining=8, goal_row=0),
            PlayerState(position=Position(row=0, col=4), walls_remaining=10, goal_row=8),
        ),
        walls=(
            Wall(row=2, col=4, orientation="h"),
            Wall(row=5, col=3, orientation="v"),
        ),
        current_player_index=1,
        status="playing",
        winner=None,
    )
    q = _to_quoridor_state(state)
    assert q.h_walls[2, 4] is True or q.h_walls[2, 4]  # numpy bool
    assert q.v_walls[5, 3] is True or q.v_walls[5, 3]
    assert int(q.walls_left[0]) == 8
    assert int(q.walls_left[1]) == 10
    assert q.turn == 1


def test_adapter_legal_mask_matches_get_valid_moves() -> None:
    """Adapter-built QuoridorState should report the same legal moves as a
    fresh QuoridorState (no walls, P0 at start)."""
    from app.ai.torch.game import QuoridorState
    from app.ai.torch_agent import _to_quoridor_state

    fresh = QuoridorState()
    converted = _to_quoridor_state(_starting_state(current=0))

    assert sorted(fresh.get_valid_moves()) == sorted(converted.get_valid_moves())
