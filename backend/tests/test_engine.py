"""Engine corpus parity test.

Loads the same JSON fixture as the frontend Vitest suite (tests/fixtures/
engine_cases.json at the repo root) so any divergence between the TS and
Python ports surfaces as a failing case in one of the two suites.
"""
from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from app.engine import (
    PawnMove,
    WallMove,
    apply_move,
    create_initial_state,
    parse_move,
    start_game,
)
from app.engine.move_validation import get_valid_pawn_moves, is_valid_wall_placement

CORPUS_PATH = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "engine_cases.json"


def _load_corpus() -> list[dict]:
    return json.loads(CORPUS_PATH.read_text(encoding="utf-8"))["cases"]


def _apply_history(history: list[str]):
    state = start_game(create_initial_state())
    for text in history:
        result = apply_move(state, parse_move(text))
        if not result.valid:
            return state, False
        state = result.next_state
    return state, True


@pytest.mark.parametrize("case", _load_corpus(), ids=lambda c: c["name"])
def test_corpus(case: dict) -> None:
    state, ok = _apply_history(case["history"])
    kind = case["kind"]

    if kind == "pawn_legal":
        assert ok, f"setup history failed: {case['history']}"
        move = parse_move(case["candidate"])
        assert isinstance(move, PawnMove)
        legal = move.to in get_valid_pawn_moves(state, state.current_player_index)
        assert legal is case["expected"]

    elif kind == "wall_legal":
        assert ok, f"setup history failed: {case['history']}"
        move = parse_move(case["candidate"])
        assert isinstance(move, WallMove)
        # Duplicate-wall case: candidate already in state.walls is illegal by definition.
        if move.wall in state.walls:
            assert case["expected"] is False
            return
        assert is_valid_wall_placement(state, move.wall) is case["expected"]

    elif kind == "history_winner":
        assert ok, f"history rejected: {case['history']}"
        assert state.status == "finished"
        assert state.winner == case["expected_winner"]

    elif kind == "history_invalid":
        assert ok is False

    else:
        pytest.fail(f"unknown case kind: {kind}")


def test_initial_state_invariants() -> None:
    s = create_initial_state()
    assert s.status == "idle"
    assert s.winner is None
    assert s.current_player_index == 0
    assert s.players[0].position.row == 8 and s.players[0].position.col == 4
    assert s.players[1].position.row == 0 and s.players[1].position.col == 4
    assert s.players[0].walls_remaining == 10
    assert s.players[1].walls_remaining == 10


def test_apply_move_decrements_walls_remaining() -> None:
    s = start_game(create_initial_state())
    before = s.players[0].walls_remaining
    result = apply_move(s, parse_move("e7h"))
    assert result.valid
    assert result.next_state.players[0].walls_remaining == before - 1
    assert result.next_state.current_player_index == 1


def test_apply_move_rejects_when_idle() -> None:
    s = create_initial_state()  # idle, not started
    result = apply_move(s, parse_move("e2"))
    assert not result.valid
    assert result.next_state == s


def test_apply_move_returns_unchanged_state_on_illegal_move() -> None:
    s = start_game(create_initial_state())
    result = apply_move(s, parse_move("e3"))
    assert not result.valid
    assert result.next_state == s


def test_walls_remaining_zero_blocks_wall_placement() -> None:
    s = start_game(create_initial_state())
    # Force walls_remaining=0 for current player.
    p0 = replace(s.players[0], walls_remaining=0)
    s = replace(s, players=(p0, s.players[1]))
    result = apply_move(s, parse_move("e7h"))
    assert not result.valid
