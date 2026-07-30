from __future__ import annotations

import pytest

from app.core.exceptions import InvalidMoveError
from app.engine.replay import replay, validate_history_winner

# ── replay ────────────────────────────────────────────────────────────────────


class TestReplay:
    def test_empty_history_returns_fresh_playing_state(self) -> None:
        state = replay([])
        assert state.status == "playing"
        assert state.winner is None

    def test_single_valid_move(self) -> None:
        state = replay(["e2"])
        assert state.players[0].position.row == 7
        assert state.players[0].position.col == 4

    def test_multiple_moves_apply_correctly(self) -> None:
        state = replay(["e2", "e8", "e3"])
        assert state.players[0].position.row == 6  # e3 = row 9-3=6
        assert state.current_player_index == 1

    def test_wall_move_in_history(self) -> None:
        state = replay(["e7h", "e8"])
        assert len(state.walls) == 1

    def test_invalid_notation_raises(self) -> None:
        with pytest.raises(InvalidMoveError):
            replay(["e2", "INVALID", "e3"])

    def test_illegal_move_raises(self) -> None:
        # e3 from start is illegal (two squares)
        with pytest.raises(InvalidMoveError):
            replay(["e3"])

    def test_duplicate_wall_raises(self) -> None:
        with pytest.raises(InvalidMoveError):
            replay(["e7h", "e8", "e7h"])  # p0 places same wall twice

    def test_full_game_winner_in_state(self) -> None:
        history = [
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
        state = replay(history)
        assert state.status == "finished"
        assert state.winner == 0

    def test_non_adjacent_jump_raises(self) -> None:
        # Corpus case: e2 then e2 again (occupied cell) is illegal
        with pytest.raises(InvalidMoveError):
            replay(["e2", "e2"])

    def test_alternating_players_correctly(self) -> None:
        # After 4 moves (2 each), it should be p0's turn again
        state = replay(["e2", "e8", "e3", "e7"])
        assert state.current_player_index == 0


# ── validate_history_winner ───────────────────────────────────────────────────


class TestValidateHistoryWinner:
    def test_empty_history_rejected(self) -> None:
        # A board win cannot be confirmed without history — must raise for either
        # claimed winner. (Forfeit results derive the winner from the caller and
        # never reach this function.)
        with pytest.raises(InvalidMoveError):
            validate_history_winner([], 0)
        with pytest.raises(InvalidMoveError):
            validate_history_winner([], 1)

    def test_valid_history_correct_winner(self) -> None:
        history = [
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
        validate_history_winner(history, 0)  # should not raise

    def test_valid_history_wrong_winner_raises(self) -> None:
        history = [
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
        with pytest.raises(InvalidMoveError):
            validate_history_winner(history, 1)  # p0 wins, not p1

    def test_history_not_finished_raises(self) -> None:
        # After just two moves the game is still playing
        with pytest.raises(InvalidMoveError):
            validate_history_winner(["e2", "e8"], 0)

    def test_illegal_move_in_history_raises(self) -> None:
        with pytest.raises(InvalidMoveError):
            validate_history_winner(["e3"], 0)  # e3 from start is illegal

    def test_bad_notation_in_history_raises(self) -> None:
        with pytest.raises(InvalidMoveError):
            validate_history_winner(["e2", "GARBAGE"], 0)

    def test_empty_history_cannot_claim_a_winner(self) -> None:
        """Regression guard for the closed forge-a-win gap: an empty history can no
        longer assert any winner. A board win must be proven by replaying real moves;
        forfeits are handled separately in game_service (caller = loser)."""
        with pytest.raises(InvalidMoveError):
            validate_history_winner([], 0)
        with pytest.raises(InvalidMoveError):
            validate_history_winner([], 1)
