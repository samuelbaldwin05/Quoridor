from __future__ import annotations

from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    GameAlreadyFinishedError,
    InvalidMoveError,
    NotFoundError,
)
from app.schemas.game import GameResultRequest, MoveSubmitRequest
from app.services.game_service import record_game_result, submit_move

# Legal histories that end in each player reaching their goal row. With per-move
# authority these live on the GAME (server-stored); the result endpoint replays
# game["move_history"] to confirm the winner.
WINNING_HISTORY_P0 = [
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
WINNING_HISTORY_P1 = [
    "d1",
    "e8",
    "c1",
    "e7",
    "d1",
    "e6",
    "c1",
    "e5",
    "d1",
    "e4",
    "c1",
    "e3",
    "d1",
    "e2",
    "c1",
    "e1",
]

# ── helpers ───────────────────────────────────────────────────────────────────


def _make_game(
    status: str = "playing",
    player1_id: str | None = None,
    player2_id: str | None = None,
    winner_id: str | None = None,
    elo_change_p1: int | None = None,
    elo_change_p2: int | None = None,
    move_history: list[str] | None = None,
) -> tuple[dict, str, str]:
    p1 = player1_id or str(uuid4())
    p2 = player2_id or str(uuid4())
    return (
        {
            "id": str(uuid4()),
            "status": status,
            "player1_id": p1,
            "player2_id": p2,
            "winner_id": winner_id,
            "elo_change_p1": elo_change_p1,
            "elo_change_p2": elo_change_p2,
            "move_history": move_history or [],
        },
        p1,
        p2,
    )


def _mock_client(
    game: dict,
    p1_elo: int = 1500,
    p2_elo: int = 1500,
    rpc_raises: Exception | None = None,
) -> MagicMock:
    """Minimal Supabase mock: games select returns `game`; user elo selects return
    p1_elo/p2_elo; rpc succeeds (or raises rpc_raises)."""
    client = MagicMock()

    game_exec = MagicMock()
    game_exec.data = [game]

    p1_exec = MagicMock()
    p1_exec.data = [{"elo": p1_elo}]
    p2_exec = MagicMock()
    p2_exec.data = [{"elo": p2_elo}]

    user_eq_mock = MagicMock()
    user_eq_mock.limit.return_value.execute.side_effect = [p1_exec, p2_exec]

    games_table = MagicMock()
    games_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
        game_exec
    )

    users_table = MagicMock()
    users_table.select.return_value.eq.return_value = user_eq_mock

    def table_dispatch(name: str) -> MagicMock:
        return games_table if name == "games" else users_table

    client.table.side_effect = table_dispatch

    if rpc_raises:
        client.rpc.return_value.execute.side_effect = rpc_raises
    else:
        client.rpc.return_value.execute.return_value = MagicMock()

    return client


# ── record_game_result: game not found ────────────────────────────────────────


class TestRecordGameResultNotFound:
    def test_raises_when_game_not_in_db(self) -> None:
        client = MagicMock()
        empty = MagicMock()
        empty.data = []
        chain = client.table.return_value.select.return_value.eq.return_value
        chain.limit.return_value.execute.return_value = empty

        with pytest.raises(NotFoundError):
            record_game_result(client, uuid4(), GameResultRequest(winner_index=0), uuid4())


# ── record_game_result: authorization ─────────────────────────────────────────


class TestRecordGameResultAuth:
    def test_raises_when_caller_is_not_a_participant(self) -> None:
        game, _p1, _p2 = _make_game(move_history=WINNING_HISTORY_P0)
        client = _mock_client(game)
        with pytest.raises(AuthorizationError):
            record_game_result(client, UUID(game["id"]), GameResultRequest(winner_index=0), uuid4())

    def test_p1_is_authorized(self) -> None:
        game, p1, _p2 = _make_game(move_history=WINNING_HISTORY_P0)
        client = _mock_client(game)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1)
        )
        assert result.winner_id == UUID(p1)

    def test_p2_is_authorized(self) -> None:
        game, _p1, p2 = _make_game(move_history=WINNING_HISTORY_P1)
        client = _mock_client(game)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=1), UUID(p2)
        )
        assert result.winner_id == UUID(p2)


# ── GameResultRequest schema validation ───────────────────────────────────────


class TestRecordGameResultWinnerIndex:
    """winner_index is constrained to {0, 1} by the schema, so out-of-range values
    are rejected at the request boundary before the service runs."""

    @pytest.mark.parametrize("bad", [2, -1])
    def test_winner_index_out_of_range_rejected_at_schema(self, bad: int) -> None:
        with pytest.raises(PydanticValidationError):
            GameResultRequest(winner_index=bad)


# ── record_game_result: outcome-authoritative win path ────────────────────────


class TestRecordGameResultWinReason:
    def test_win_requires_stored_history(self) -> None:
        """A board win can't be confirmed when the game has no recorded moves."""
        game, p1, _p2 = _make_game(move_history=[])
        client = _mock_client(game)
        with pytest.raises(InvalidMoveError):
            record_game_result(
                client, UUID(game["id"]), GameResultRequest(winner_index=0, reason="win"), UUID(p1)
            )

    def test_win_rejects_false_winner_claim(self) -> None:
        """Stored history proves p0 won, but the caller claims p1 -> rejected."""
        game, p1, _p2 = _make_game(move_history=WINNING_HISTORY_P0)
        client = _mock_client(game)
        with pytest.raises(InvalidMoveError):
            record_game_result(
                client, UUID(game["id"]), GameResultRequest(winner_index=1, reason="win"), UUID(p1)
            )

    def test_win_with_valid_stored_history_succeeds(self) -> None:
        game, p1, _p2 = _make_game(move_history=WINNING_HISTORY_P0)
        client = _mock_client(game)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0, reason="win"), UUID(p1)
        )
        assert result.winner_id == UUID(p1)


# ── record_game_result: forfeits ──────────────────────────────────────────────


class TestRecordGameResultForfeit:
    """resign/timeout: the calling player forfeits, so the opponent wins and any
    client-supplied winner_index is ignored. No move history required."""

    def test_resign_by_p1_makes_p2_winner(self) -> None:
        game, p1, p2 = _make_game()
        client = _mock_client(game)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0, reason="resign"), UUID(p1)
        )
        assert result.winner_id == UUID(p2)

    def test_resign_by_p2_makes_p1_winner(self) -> None:
        game, p1, p2 = _make_game()
        client = _mock_client(game)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=1, reason="resign"), UUID(p2)
        )
        assert result.winner_id == UUID(p1)

    def test_resign_ignores_self_winner_claim(self) -> None:
        # p1 resigns but maliciously claims winner_index=0 (self) — opponent still wins.
        game, p1, p2 = _make_game()
        client = _mock_client(game)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0, reason="resign"), UUID(p1)
        )
        assert result.winner_id == UUID(p2)

    def test_timeout_by_p1_makes_p2_winner(self) -> None:
        game, p1, p2 = _make_game()
        client = _mock_client(game)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0, reason="timeout"), UUID(p1)
        )
        assert result.winner_id == UUID(p2)


# ── record_game_result: ELO in the response ───────────────────────────────────


class TestRecordGameResultElo:
    def _win(self, p1_elo=1500, p2_elo=1500):
        game, p1, _p2 = _make_game(move_history=WINNING_HISTORY_P0)
        client = _mock_client(game, p1_elo=p1_elo, p2_elo=p2_elo)
        return record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1)
        )

    def test_winner_elo_change_is_positive(self) -> None:
        assert self._win().elo_change_p1 > 0

    def test_loser_elo_change_is_negative(self) -> None:
        assert self._win().elo_change_p2 < 0

    def test_new_elo_p1_reflects_gain(self) -> None:
        result = self._win()
        assert result.new_elo_p1 == 1500 + result.elo_change_p1

    def test_rpc_called_with_correct_winner_id(self) -> None:
        game, p1, _p2 = _make_game(move_history=WINNING_HISTORY_P0)
        client = _mock_client(game)
        record_game_result(client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1))
        rpc_kwargs = (
            client.rpc.call_args[1] if client.rpc.call_args.kwargs else client.rpc.call_args[0][1]
        )
        assert rpc_kwargs["p_winner_user_id"] == p1


# ── record_game_result: idempotency (finished-game replay) ────────────────────


class TestRecordGameResultIdempotency:
    def test_already_finished_returns_stored_elo_deltas(self) -> None:
        game, p1, _p2 = _make_game(status="finished", elo_change_p1=16, elo_change_p2=-18)
        game["winner_id"] = p1
        client = _mock_client(game, p1_elo=1516, p2_elo=1484)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1)
        )
        assert (result.elo_change_p1, result.elo_change_p2) == (16, -18)

    def test_already_finished_returns_current_absolute_elo(self) -> None:
        """Regression guard for the prior new_elo=0 bug."""
        game, p1, _p2 = _make_game(status="finished", elo_change_p1=16, elo_change_p2=-18)
        game["winner_id"] = p1
        client = _mock_client(game, p1_elo=1516, p2_elo=1484)
        result = record_game_result(
            client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1)
        )
        assert (result.new_elo_p1, result.new_elo_p2) == (1516, 1484)

    def test_already_finished_without_winner_raises(self) -> None:
        game, p1, _p2 = _make_game(status="finished", elo_change_p1=16, elo_change_p2=-18)
        game["winner_id"] = None
        client = _mock_client(game, p1_elo=1516, p2_elo=1484)
        with pytest.raises(InvalidMoveError):
            record_game_result(
                client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1)
            )

    def test_already_finished_does_not_call_rpc(self) -> None:
        game, p1, _p2 = _make_game(status="finished", elo_change_p1=16, elo_change_p2=-18)
        game["winner_id"] = p1
        client = _mock_client(game, p1_elo=1516, p2_elo=1484)
        record_game_result(client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1))
        client.rpc.assert_not_called()


# ── submit_move (per-move server authority) ───────────────────────────────────


class TestSubmitMove:
    def test_valid_first_move_appends_and_flips_turn(self) -> None:
        game, p1, _p2 = _make_game(move_history=[])  # empty -> p0's turn
        client = _mock_client(game)
        resp = submit_move(client, UUID(game["id"]), MoveSubmitRequest(notation="e2"), UUID(p1))
        assert resp.move_number == 1
        assert resp.current_player_index == 1  # turn flips to p1
        assert resp.status == "playing"
        assert resp.winner is None
        # appended atomically with the expected (pre-move) count
        kwargs = (
            client.rpc.call_args[1] if client.rpc.call_args.kwargs else client.rpc.call_args[0][1]
        )
        assert kwargs["p_move"] == "e2"
        assert kwargs["p_expected_count"] == 0

    def test_winning_move_reports_finished(self) -> None:
        game, p1, _p2 = _make_game(move_history=WINNING_HISTORY_P0[:-1])  # one move from p0 win
        client = _mock_client(game)
        resp = submit_move(client, UUID(game["id"]), MoveSubmitRequest(notation="e9"), UUID(p1))
        assert resp.status == "finished"
        assert resp.winner == 0
        assert resp.move_number == len(WINNING_HISTORY_P0)

    def test_not_your_turn_rejected(self) -> None:
        game, p1, _p2 = _make_game(move_history=["e2"])  # now p1's turn
        client = _mock_client(game)
        with pytest.raises(AuthorizationError):
            submit_move(client, UUID(game["id"]), MoveSubmitRequest(notation="e3"), UUID(p1))

    def test_illegal_move_rejected(self) -> None:
        game, p1, _p2 = _make_game(move_history=[])
        client = _mock_client(game)
        with pytest.raises(InvalidMoveError):
            submit_move(client, UUID(game["id"]), MoveSubmitRequest(notation="e3"), UUID(p1))

    def test_non_participant_rejected(self) -> None:
        game, _p1, _p2 = _make_game(move_history=[])
        client = _mock_client(game)
        with pytest.raises(AuthorizationError):
            submit_move(client, UUID(game["id"]), MoveSubmitRequest(notation="e2"), uuid4())

    def test_finished_game_rejected(self) -> None:
        game, p1, _p2 = _make_game(status="finished")
        client = _mock_client(game)
        with pytest.raises(GameAlreadyFinishedError):
            submit_move(client, UUID(game["id"]), MoveSubmitRequest(notation="e2"), UUID(p1))

    def test_count_mismatch_maps_to_conflict(self) -> None:
        game, p1, _p2 = _make_game(move_history=[])
        client = _mock_client(game, rpc_raises=Exception("move count mismatch"))
        with pytest.raises(ConflictError):
            submit_move(client, UUID(game["id"]), MoveSubmitRequest(notation="e2"), UUID(p1))

    def test_bad_notation_rejected_at_schema(self) -> None:
        with pytest.raises(PydanticValidationError):
            MoveSubmitRequest(notation="GARBAGE")
