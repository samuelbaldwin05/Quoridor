from __future__ import annotations

from dataclasses import replace

import pytest

from app.engine import (
    PawnMove,
    WallMove,
    apply_move,
    create_initial_state,
    parse_move,
    start_game,
)
from app.engine.game_types import GameState, PlayerState, Position, Wall
from app.engine.move_validation import get_valid_pawn_moves, has_path_to_goal, is_valid_wall_placement


def playing() -> GameState:
    return start_game(create_initial_state())


def with_players(
    p0_pos: tuple[int, int],
    p1_pos: tuple[int, int],
    walls: list[Wall] | None = None,
) -> GameState:
    s = playing()
    p0 = PlayerState(Position(*p0_pos), 10, 0)
    p1 = PlayerState(Position(*p1_pos), 10, 8)
    return replace(s, players=(p0, p1), walls=tuple(walls or []))


def apply_history(moves: list[str]) -> GameState:
    s = playing()
    for text in moves:
        result = apply_move(s, parse_move(text))
        assert result.valid, f"illegal move in setup: {text}"
        s = result.next_state
    return s


# ── get_valid_pawn_moves — basic movement ─────────────────────────────────────

class TestGetValidPawnMovesBasic:
    def test_p0_at_start_has_3_moves(self) -> None:
        s = playing()
        moves = get_valid_pawn_moves(s, 0)
        assert len(moves) == 3
        assert Position(7, 4) in moves  # forward
        assert Position(8, 3) in moves  # left
        assert Position(8, 5) in moves  # right

    def test_p1_at_start_has_3_moves(self) -> None:
        s = apply_history(["e2"])  # advance to p1 turn
        moves = get_valid_pawn_moves(s, 1)
        assert len(moves) == 3
        assert Position(1, 4) in moves  # p1 forward
        assert Position(0, 3) in moves
        assert Position(0, 5) in moves

    def test_p0_at_corner_8_0_has_2_moves(self) -> None:
        s = with_players((8, 0), (0, 4))
        moves = get_valid_pawn_moves(s, 0)
        assert len(moves) == 2
        assert Position(7, 0) in moves
        assert Position(8, 1) in moves

    def test_p0_in_open_center_has_4_moves(self) -> None:
        s = with_players((4, 4), (1, 0))
        moves = get_valid_pawn_moves(s, 0)
        assert len(moves) == 4

    def test_p0_cannot_move_off_board_backward(self) -> None:
        moves = get_valid_pawn_moves(playing(), 0)
        assert Position(9, 4) not in moves

    def test_p0_top_row_cannot_move_further(self) -> None:
        s = with_players((0, 4), (8, 0))
        moves = get_valid_pawn_moves(s, 0)
        assert Position(-1, 4) not in moves


class TestGetValidPawnMovesWalls:
    def test_h_wall_blocks_forward(self) -> None:
        # H-wall at (7,3) spans cols 3-4, blocks (8,4)→(7,4)
        s = with_players((8, 4), (0, 4), [Wall(7, 3, "h")])
        moves = get_valid_pawn_moves(s, 0)
        assert Position(7, 4) not in moves
        assert Position(8, 3) in moves   # sideways still ok
        assert Position(8, 5) in moves

    def test_v_wall_blocks_right(self) -> None:
        # V-wall at (7,4) blocks (8,4)→(8,5)
        s = with_players((8, 4), (0, 4), [Wall(7, 4, "v")])
        moves = get_valid_pawn_moves(s, 0)
        assert Position(8, 5) not in moves
        assert Position(7, 4) in moves

    def test_v_wall_blocks_left(self) -> None:
        # V-wall at (7,3) blocks (8,4)→(8,3)
        s = with_players((8, 4), (0, 4), [Wall(7, 3, "v")])
        moves = get_valid_pawn_moves(s, 0)
        assert Position(8, 3) not in moves
        assert Position(8, 5) in moves


class TestGetValidPawnMovesJumps:
    def test_p0_jumps_straight_over_p1(self) -> None:
        # p0 at (4,4), p1 at (3,4): p0 can jump to (2,4)
        s = with_players((4, 4), (3, 4))
        moves = get_valid_pawn_moves(s, 0)
        assert Position(2, 4) in moves

    def test_straight_jump_only_no_diagonals_when_straight_clear(self) -> None:
        s = with_players((4, 4), (3, 4))
        moves = get_valid_pawn_moves(s, 0)
        # Diagonal jumps should not appear when straight is available
        assert Position(3, 3) not in moves
        assert Position(3, 5) not in moves

    def test_diagonal_jump_when_straight_blocked_by_wall(self) -> None:
        # h-wall at (2,4) blocks (3,4)→(2,4)
        s = with_players((4, 4), (3, 4), [Wall(2, 4, "h")])
        moves = get_valid_pawn_moves(s, 0)
        assert Position(2, 4) not in moves
        assert Position(3, 3) in moves
        assert Position(3, 5) in moves

    def test_diagonal_jump_when_straight_goes_off_board(self) -> None:
        # p0 at (1,4), p1 at (0,4): straight would be row -1 (off board)
        s = with_players((1, 4), (0, 4))
        moves = get_valid_pawn_moves(s, 0)
        assert Position(0, 3) in moves
        assert Position(0, 5) in moves
        assert Position(-1, 4) not in moves

    def test_diagonal_blocked_by_wall(self) -> None:
        # h-wall blocks straight; v-wall blocks one diagonal
        s = with_players((4, 4), (3, 4), [
            Wall(2, 4, "h"),   # blocks straight jump
            Wall(2, 3, "v"),   # blocks (3,4)→(3,3)
        ])
        moves = get_valid_pawn_moves(s, 0)
        assert Position(3, 3) not in moves   # diagonal left blocked
        assert Position(3, 5) in moves       # diagonal right still ok

    def test_p1_jumps_over_p0_corpus_case(self) -> None:
        # Corpus case from fixture
        s = apply_history(["e2", "e8", "e3", "e7", "e4", "e6", "e5"])
        assert s.current_player_index == 1
        moves = get_valid_pawn_moves(s, 1)
        assert Position(5, 4) in moves  # e4 = row 5, col 4


# ── has_path_to_goal ──────────────────────────────────────────────────────────

class TestHasPathToGoal:
    def test_p0_has_path_from_start(self) -> None:
        assert has_path_to_goal(Position(8, 4), 0, ())

    def test_p1_has_path_from_start(self) -> None:
        assert has_path_to_goal(Position(0, 4), 8, ())

    def test_already_on_goal_row(self) -> None:
        assert has_path_to_goal(Position(0, 4), 0, ())
        assert has_path_to_goal(Position(8, 4), 8, ())

    def test_single_wall_does_not_block_full_path(self) -> None:
        walls = (Wall(4, 4, "h"),)
        assert has_path_to_goal(Position(8, 4), 0, walls)

    def test_four_h_walls_seal_cols_0_to_7_path_via_col_8_still_open(self) -> None:
        walls = (
            Wall(0, 0, "h"), Wall(0, 2, "h"),
            Wall(0, 4, "h"), Wall(0, 6, "h"),
        )
        # Col 8 is still open — path from (1,4) to row 0 exists via (1,8)→(0,8)
        assert has_path_to_goal(Position(1, 4), 0, walls)


# ── is_valid_wall_placement — bounds ─────────────────────────────────────────

class TestWallBounds:
    def test_valid_at_max_position_7_7(self) -> None:
        assert is_valid_wall_placement(playing(), Wall(7, 7, "h"))

    def test_valid_at_min_position_0_0(self) -> None:
        assert is_valid_wall_placement(playing(), Wall(0, 0, "h"))

    def test_rejects_row_8(self) -> None:
        assert not is_valid_wall_placement(playing(), Wall(8, 4, "h"))

    def test_rejects_col_8_corpus_case(self) -> None:
        assert not is_valid_wall_placement(playing(), Wall(0, 8, "v"))

    def test_rejects_negative_row(self) -> None:
        assert not is_valid_wall_placement(playing(), Wall(-1, 4, "h"))

    def test_rejects_negative_col(self) -> None:
        assert not is_valid_wall_placement(playing(), Wall(4, -1, "h"))


# ── is_valid_wall_placement — duplicates, overlap, intersection ───────────────

class TestWallConflicts:
    def test_rejects_duplicate(self) -> None:
        s = apply_history(["e7h"])
        assert not is_valid_wall_placement(s, Wall(2, 4, "h"))  # e7h → row=2, col=4

    def test_rejects_post_overlap_h_then_v(self) -> None:
        s = replace(playing(), walls=(Wall(4, 4, "h"),))
        assert not is_valid_wall_placement(s, Wall(4, 4, "v"))

    def test_rejects_adjacent_h_wall_overlapping_span(self) -> None:
        s = apply_history(["e7h"])  # (2,4,'h')
        assert not is_valid_wall_placement(s, Wall(2, 5, "h"))

    def test_accepts_non_adjacent_h_wall_same_row(self) -> None:
        s = replace(playing(), walls=(Wall(4, 3, "h"),))
        assert is_valid_wall_placement(s, Wall(4, 5, "h"))

    def test_rejects_adjacent_v_wall_overlapping_span(self) -> None:
        s = replace(playing(), walls=(Wall(4, 4, "v"),))
        assert not is_valid_wall_placement(s, Wall(5, 4, "v"))

    def test_h_and_v_different_positions_no_conflict(self) -> None:
        s = replace(playing(), walls=(Wall(4, 4, "h"),))
        assert is_valid_wall_placement(s, Wall(3, 3, "v"))


# ── is_valid_wall_placement — path connectivity ───────────────────────────────

class TestWallPathConnectivity:
    def test_accepts_single_wall_in_center(self) -> None:
        assert is_valid_wall_placement(playing(), Wall(4, 4, "h"))

    def test_rejects_wall_that_traps_p0_in_starting_cell(self) -> None:
        # v(7,3) + v(7,4) block left and right; h(7,3) blocks forward.
        # All three together trap p0 at (8,4) with no exits.
        s = replace(playing(), walls=(Wall(7, 3, "v"), Wall(7, 4, "v")))
        # Placing h(7,3) completes the cage
        assert not is_valid_wall_placement(s, Wall(7, 3, "h"))

    def test_wall_that_restricts_but_does_not_block_is_accepted(self) -> None:
        # Wall to the side of players' corridor does not block any path
        s = replace(playing(), walls=(Wall(4, 0, "h"),))
        assert is_valid_wall_placement(s, Wall(4, 2, "h"))
