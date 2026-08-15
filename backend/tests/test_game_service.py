from __future__ import annotations

from datetime import UTC, datetime
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
from app.schemas.game import BotGameCreate, GameResultRequest, MoveSubmitRequest
from app.services import game_service
from app.services.game_service import record_bot_game, record_game_result, submit_move

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
    last_move_at: str | None = "2020-01-01T00:00:00+00:00",  # long ago: passes the dwell guard
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
            "last_move_at": last_move_at,
        },
        p1,
        p2,
    )


def _mock_client(
    game: dict,
    p1_elo: int = 1500,
    p2_elo: int = 1500,
    rpc_raises: Exception | None = None,
    p1_games: int = 50,
    p2_games: int = 50,
) -> MagicMock:
    """Minimal Supabase mock: games select returns `game`; user rating selects return
    p1_elo/p2_elo with their game counts (defaulting past the provisional window);
    rpc succeeds (or raises rpc_raises)."""
    client = MagicMock()

    game_exec = MagicMock()
    game_exec.data = [game]

    p1_exec = MagicMock()
    p1_exec.data = [{"elo": p1_elo, "games_played": p1_games}]
    p2_exec = MagicMock()
    p2_exec.data = [{"elo": p2_elo, "games_played": p2_games}]

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

    def test_win_claim_on_unfinished_history_rejected(self) -> None:
        """Forgery guard: a legal but mid-game history proves no winner, so a "win"
        claim over it is rejected (nobody has reached a goal row yet)."""
        game, p1, _p2 = _make_game(move_history=["e2", "e8", "e3"])
        client = _mock_client(game)
        with pytest.raises(InvalidMoveError):
            record_game_result(
                client, UUID(game["id"]), GameResultRequest(winner_index=0, reason="win"), UUID(p1)
            )


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


# ── record_game_result: disconnect forfeit (server turn-guarded) ───────────────


class TestRecordGameResultDisconnect:
    """A caller may claim the OPPONENT abandoned, but only when the server's own
    replay shows it is the opponent's turn (the caller has already played and the
    absent player owes the next move). The caller becomes the winner."""

    def test_disconnect_accepted_when_opponent_to_move_awards_caller(self) -> None:
        # Empty history -> player1 (index 0) to move. player2 claims player1 vanished
        # before making the first move; it is genuinely player1's turn, so accepted.
        game, _p1, p2 = _make_game(move_history=[])
        client = _mock_client(game)
        result = record_game_result(
            client,
            UUID(game["id"]),
            GameResultRequest(winner_index=0, reason="disconnect"),
            UUID(p2),
        )
        assert result.winner_id == UUID(p2)

    def test_disconnect_accepted_after_callers_move(self) -> None:
        # After player1 plays "e2" it is player2's turn. player1 (present) claims
        # player2 abandoned -> it is player2's turn, so player1 wins.
        game, p1, _p2 = _make_game(move_history=["e2"])
        client = _mock_client(game)
        result = record_game_result(
            client,
            UUID(game["id"]),
            GameResultRequest(winner_index=0, reason="disconnect"),
            UUID(p1),
        )
        assert result.winner_id == UUID(p1)

    def test_disconnect_rejected_when_last_move_too_recent(self) -> None:
        # Liveness guard: even though it is the opponent's turn, a move happened moments
        # ago, so the opponent has not been idle long enough to forfeit. Blocks the
        # "move then instantly claim a free win" exploit.
        recent = datetime.now(UTC).isoformat()
        game, _p1, p2 = _make_game(move_history=[], last_move_at=recent)
        client = _mock_client(game)
        with pytest.raises(AuthorizationError):
            record_game_result(
                client,
                UUID(game["id"]),
                GameResultRequest(winner_index=0, reason="disconnect"),
                UUID(p2),
            )

    def test_disconnect_rejected_when_it_is_callers_own_turn(self) -> None:
        # Empty history -> player1's turn. player1 cannot claim player2 abandoned:
        # it is player1 who owes the move. Guards the "assert a win on your own turn"
        # forgery.
        game, p1, _p2 = _make_game(move_history=[])
        client = _mock_client(game)
        with pytest.raises(AuthorizationError):
            record_game_result(
                client,
                UUID(game["id"]),
                GameResultRequest(winner_index=0, reason="disconnect"),
                UUID(p1),
            )

    def test_disconnect_ignores_client_winner_index(self) -> None:
        # player2 claims disconnect but maliciously sets winner_index=0 (the opponent).
        # The server derives the winner from caller role, so player2 still wins.
        game, _p1, p2 = _make_game(move_history=[])
        client = _mock_client(game)
        result = record_game_result(
            client,
            UUID(game["id"]),
            GameResultRequest(winner_index=0, reason="disconnect"),
            UUID(p2),
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


class TestRecordGameResultNotInProgress:
    """A new result can only finalize a live game; waiting/resigned are rejected even
    with an otherwise-valid winning history, and never reach the finalize RPC."""

    def test_waiting_game_result_rejected(self) -> None:
        game, p1, _p2 = _make_game(status="waiting", move_history=WINNING_HISTORY_P0)
        client = _mock_client(game)
        with pytest.raises(InvalidMoveError):
            record_game_result(
                client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1)
            )
        client.rpc.assert_not_called()

    def test_resigned_status_game_result_rejected(self) -> None:
        game, p1, _p2 = _make_game(status="resigned", move_history=WINNING_HISTORY_P0)
        client = _mock_client(game)
        with pytest.raises(InvalidMoveError):
            record_game_result(
                client, UUID(game["id"]), GameResultRequest(winner_index=0), UUID(p1)
            )
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


# ── record_bot_game (single-player history, no Elo) ───────────────────────────


class TestRecordBotGame:
    """Bot games are history-only: recorded as player1 = caller, player2 = NULL,
    no Elo/ranked side effects, idempotent on client_game_id."""

    def _patch_repo(self, monkeypatch, *, existing: dict | None):
        """Patch the repository boundary. Returns a dict capturing the inserted
        payload and how many times insert was called."""
        captured: dict = {"insert_calls": 0, "payload": None}

        monkeypatch.setattr(
            game_service.game_repository,
            "get_bot_game_by_client_id",
            lambda c, uid, cid: existing,
        )

        def fake_insert(client, payload):
            captured["insert_calls"] += 1
            captured["payload"] = payload
            return {**payload, "id": str(uuid4())}

        monkeypatch.setattr(game_service.game_repository, "insert_bot_game", fake_insert)
        return captured

    def test_new_game_inserts_as_vs_ai_history_row(self, monkeypatch) -> None:
        captured = self._patch_repo(monkeypatch, existing=None)
        caller = uuid4()
        body = BotGameCreate(
            client_game_id="local-1", ai_difficulty="bot2", winner_index=0, move_history=["e2"]
        )
        res = record_bot_game(MagicMock(), body, caller)

        assert res.created is True
        assert res.winner_index == 0
        payload = captured["payload"]
        assert payload["mode"] == "vs_ai"
        assert payload["status"] == "finished"
        assert payload["player1_id"] == str(caller)
        assert payload["player2_id"] is None
        assert payload["ai_difficulty"] == "bot2"
        assert payload["client_game_id"] == "local-1"
        assert payload["move_history"] == ["e2"]

    def test_user_win_sets_winner_id_to_caller(self, monkeypatch) -> None:
        captured = self._patch_repo(monkeypatch, existing=None)
        caller = uuid4()
        record_bot_game(
            MagicMock(),
            BotGameCreate(client_game_id="g", ai_difficulty="bot0", winner_index=0),
            caller,
        )
        assert captured["payload"]["winner_id"] == str(caller)

    def test_bot_win_leaves_winner_id_null(self, monkeypatch) -> None:
        captured = self._patch_repo(monkeypatch, existing=None)
        record_bot_game(
            MagicMock(),
            BotGameCreate(client_game_id="g", ai_difficulty="extreme", winner_index=1),
            uuid4(),
        )
        assert captured["payload"]["winner_id"] is None

    def test_duplicate_is_idempotent_noop(self, monkeypatch) -> None:
        caller = uuid4()
        stored = {
            "id": str(uuid4()),
            "client_game_id": "dup",
            "ai_difficulty": "bot1",
            "winner_index": 1,
            "status": "finished",
        }
        captured = self._patch_repo(monkeypatch, existing=stored)
        res = record_bot_game(
            MagicMock(),
            BotGameCreate(client_game_id="dup", ai_difficulty="bot1", winner_index=1),
            caller,
        )
        assert res.created is False
        assert res.id == UUID(stored["id"])
        assert captured["insert_calls"] == 0  # never inserts on a duplicate

    def test_concurrent_conflict_returns_stored_row(self, monkeypatch) -> None:
        """get returns None first (so we try to insert), the insert loses the race and
        raises ConflictError, and the follow-up lookup finds the row that won."""
        caller = uuid4()
        stored = {
            "id": str(uuid4()),
            "client_game_id": "race",
            "ai_difficulty": "bot2",
            "winner_index": 0,
            "status": "finished",
        }
        lookups = iter([None, stored])
        monkeypatch.setattr(
            game_service.game_repository,
            "get_bot_game_by_client_id",
            lambda c, uid, cid: next(lookups),
        )

        def raise_conflict(client, payload):
            raise ConflictError("bot game already recorded")

        monkeypatch.setattr(game_service.game_repository, "insert_bot_game", raise_conflict)

        res = record_bot_game(
            MagicMock(),
            BotGameCreate(client_game_id="race", ai_difficulty="bot2", winner_index=0),
            caller,
        )
        assert res.created is False
        assert res.id == UUID(stored["id"])

    @pytest.mark.parametrize("bad", ["easy", "bot3", "", "BOT2"])
    def test_invalid_difficulty_rejected_at_schema(self, bad: str) -> None:
        with pytest.raises(PydanticValidationError):
            BotGameCreate(client_game_id="g", ai_difficulty=bad, winner_index=0)

    @pytest.mark.parametrize("bad", [2, -1])
    def test_winner_index_out_of_range_rejected_at_schema(self, bad: int) -> None:
        with pytest.raises(PydanticValidationError):
            BotGameCreate(client_game_id="g", ai_difficulty="bot0", winner_index=bad)
