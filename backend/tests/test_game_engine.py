from __future__ import annotations

from dataclasses import replace

from app.engine import apply_move, create_initial_state, parse_move, start_game
from app.engine.game_engine import check_win
from app.engine.game_types import GameState, Position, Wall


def playing() -> GameState:
    return start_game(create_initial_state())


def apply_history(moves: list[str]) -> GameState:
    s = playing()
    for text in moves:
        result = apply_move(s, parse_move(text))
        assert result.valid, f"illegal move in setup: {text}"
        s = result.next_state
    return s


# ── create_initial_state ──────────────────────────────────────────────────────


class TestCreateInitialState:
    def test_status_is_idle(self) -> None:
        assert create_initial_state().status == "idle"

    def test_p0_position(self) -> None:
        s = create_initial_state()
        assert s.players[0].position == Position(8, 4)
        assert s.players[0].goal_row == 0

    def test_p1_position(self) -> None:
        s = create_initial_state()
        assert s.players[1].position == Position(0, 4)
        assert s.players[1].goal_row == 8

    def test_both_start_with_10_walls(self) -> None:
        s = create_initial_state()
        assert s.players[0].walls_remaining == 10
        assert s.players[1].walls_remaining == 10

    def test_no_walls_on_board(self) -> None:
        assert create_initial_state().walls == ()

    def test_p0_moves_first(self) -> None:
        assert create_initial_state().current_player_index == 0

    def test_no_winner(self) -> None:
        assert create_initial_state().winner is None


# ── start_game ────────────────────────────────────────────────────────────────


class TestStartGame:
    def test_status_becomes_playing(self) -> None:
        assert start_game(create_initial_state()).status == "playing"

    def test_other_fields_unchanged(self) -> None:
        s = start_game(create_initial_state())
        assert s.players[0].position == Position(8, 4)
        assert s.current_player_index == 0


# ── applyMove — non-playing states ───────────────────────────────────────────


class TestApplyMoveNonPlayingStates:
    def test_rejects_when_idle(self) -> None:
        result = apply_move(create_initial_state(), parse_move("e2"))
        assert not result.valid
        assert result.next_state.status == "idle"

    def test_rejects_when_finished(self) -> None:
        finished = replace(playing(), status="finished")
        result = apply_move(finished, parse_move("e2"))
        assert not result.valid


# ── applyMove — valid pawn moves ──────────────────────────────────────────────


class TestApplyMovePawn:
    def test_e2_is_valid_for_p0(self) -> None:
        result = apply_move(playing(), parse_move("e2"))
        assert result.valid

    def test_position_updates(self) -> None:
        result = apply_move(playing(), parse_move("e2"))
        assert result.next_state.players[0].position == Position(7, 4)

    def test_turn_switches_to_p1(self) -> None:
        result = apply_move(playing(), parse_move("e2"))
        assert result.next_state.current_player_index == 1

    def test_turn_switches_back_to_p0(self) -> None:
        s = apply_history(["e2"])
        result = apply_move(s, parse_move("e8"))
        assert result.next_state.current_player_index == 0

    def test_p0_cannot_move_two_squares(self) -> None:
        assert not apply_move(playing(), parse_move("e3")).valid

    def test_p0_cannot_move_diagonally(self) -> None:
        assert not apply_move(playing(), parse_move("d2")).valid

    def test_p0_cannot_stay_put(self) -> None:
        assert not apply_move(playing(), parse_move("e1")).valid

    def test_p1_cannot_move_on_p0_turn(self) -> None:
        # e8 is p1's start — illegal because it's p0's turn and p0 is not at e8
        result = apply_move(playing(), parse_move("e8"))
        assert not result.valid

    def test_sideways_move_valid(self) -> None:
        result = apply_move(playing(), parse_move("d1"))
        assert result.valid
        assert result.next_state.players[0].position == Position(8, 3)


# ── applyMove — wall moves ────────────────────────────────────────────────────


class TestApplyMoveWall:
    def test_valid_wall_placement(self) -> None:
        result = apply_move(playing(), parse_move("e7h"))
        assert result.valid

    def test_wall_appears_in_state(self) -> None:
        result = apply_move(playing(), parse_move("e7h"))
        assert len(result.next_state.walls) == 1
        assert result.next_state.walls[0] == Wall(2, 4, "h")

    def test_walls_remaining_decrements(self) -> None:
        result = apply_move(playing(), parse_move("e7h"))
        assert result.next_state.players[0].walls_remaining == 9

    def test_opponent_walls_unchanged(self) -> None:
        result = apply_move(playing(), parse_move("e7h"))
        assert result.next_state.players[1].walls_remaining == 10

    def test_turn_switches_after_wall(self) -> None:
        result = apply_move(playing(), parse_move("e7h"))
        assert result.next_state.current_player_index == 1

    def test_rejects_when_no_walls_remaining(self) -> None:
        s = replace(
            playing(),
            players=(
                replace(playing().players[0], walls_remaining=0),
                playing().players[1],
            ),
        )
        assert not apply_move(s, parse_move("e7h")).valid

    def test_rejects_duplicate_wall(self) -> None:
        s = apply_history(["e7h", "e8"])
        assert not apply_move(s, parse_move("e7h")).valid

    def test_rejects_out_of_bounds_wall(self) -> None:
        assert not apply_move(playing(), parse_move("i2v")).valid


# ── check_win ─────────────────────────────────────────────────────────────────


class TestCheckWin:
    def test_no_winner_at_start(self) -> None:
        assert check_win(playing()) is None

    def test_p0_wins_on_row_0(self) -> None:
        s = replace(
            playing(),
            players=(
                replace(playing().players[0], position=Position(0, 4)),
                playing().players[1],
            ),
        )
        assert check_win(s) == 0

    def test_p1_wins_on_row_8(self) -> None:
        s = replace(
            playing(),
            players=(
                playing().players[0],
                replace(playing().players[1], position=Position(8, 4)),
            ),
        )
        assert check_win(s) == 1

    def test_no_winner_when_neither_on_goal_row(self) -> None:
        s = apply_history(["e2", "e8"])
        assert check_win(s) is None


# ── full game scenarios ───────────────────────────────────────────────────────


class TestFullGameScenarios:
    def test_p0_wins_straight_march(self) -> None:
        state = apply_history(
            [
                "e2",
                "d9",
                "e3",
                "e9",
                "e4",
                "d9",
                "e5",
                "e9",
                "e6",
                "d9",
                "e7",
                "e9",
                "e8",
                "d9",
                "e9",
            ]
        )
        assert state.status == "finished"
        assert state.winner == 0

    def test_game_stays_playing_before_win(self) -> None:
        state = apply_history(["e2", "e8"])
        assert state.status == "playing"
        assert state.winner is None

    def test_no_moves_accepted_after_finish(self) -> None:
        finished = apply_history(
            [
                "e2",
                "d9",
                "e3",
                "e9",
                "e4",
                "d9",
                "e5",
                "e9",
                "e6",
                "d9",
                "e7",
                "e9",
                "e8",
                "d9",
                "e9",
            ]
        )
        assert not apply_move(finished, parse_move("d9")).valid

    def test_10_walls_exhausts_supply(self) -> None:
        # p0 places 10 legal walls on the left (cols 0+2, rows 0-4), leaving a clear
        # col 4-7 corridor so every placement passes the path check; p1 oscillates d9/e9.
        wall_moves = [
            "a9h",
            "d9",
            "c9h",
            "e9",
            "a8h",
            "d9",
            "c8h",
            "e9",
            "a7h",
            "d9",
            "c7h",
            "e9",
            "a6h",
            "d9",
            "c6h",
            "e9",
            "a5h",
            "d9",
            "c5h",
            "e9",
        ]
        state = apply_history(wall_moves)
        assert state.players[0].walls_remaining == 0
        assert not apply_move(state, parse_move("e3h")).valid

    def test_walls_accumulate_across_turns(self) -> None:
        state = apply_history(["e7h", "e8", "e5h", "e7"])
        assert len(state.walls) == 2

    def test_p0_state_unchanged_after_p1_wall(self) -> None:
        state = apply_history(["e2", "e5h"])
        assert state.players[0].walls_remaining == 10
        assert state.players[1].walls_remaining == 9
