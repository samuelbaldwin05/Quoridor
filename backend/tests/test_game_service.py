from __future__ import annotations

from unittest.mock import MagicMock, call, patch
from uuid import UUID, uuid4

import pytest

from app.core.exceptions import AuthorizationError, InvalidMoveError, NotFoundError
from app.schemas.game import GameResultRequest
from app.services.game_service import record_game_result


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_game(
    status: str = "playing",
    player1_id: str | None = None,
    player2_id: str | None = None,
    winner_id: str | None = None,
    elo_change_p1: int | None = None,
    elo_change_p2: int | None = None,
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
    """Build a minimal Supabase mock that satisfies game_service.record_game_result."""
    client = MagicMock()

    # game lookup: supabase.table("games").select("*").eq(...).limit(1).execute()
    game_exec = MagicMock()
    game_exec.data = [game]

    # user lookup: called twice (p1, p2) with different eq(id=...) values
    p1_exec = MagicMock()
    p1_exec.data = [{"elo": p1_elo}]
    p2_exec = MagicMock()
    p2_exec.data = [{"elo": p2_elo}]

    user_eq_mock = MagicMock()
    user_eq_mock.limit.return_value.execute.side_effect = [p1_exec, p2_exec]

    games_table = MagicMock()
    games_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = game_exec

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


# ── game not found ────────────────────────────────────────────────────────────

class TestRecordGameResultNotFound:
    def test_raises_when_game_not_in_db(self) -> None:
        client = MagicMock()
        empty = MagicMock()
        empty.data = []
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = empty

        with pytest.raises(NotFoundError):
            record_game_result(
                client,
                uuid4(),
                GameResultRequest(winner_index=0, move_history=[]),
                uuid4(),
            )


# ── authorization ─────────────────────────────────────────────────────────────

class TestRecordGameResultAuth:
    def test_raises_when_caller_is_not_a_participant(self) -> None:
        game, p1, p2 = _make_game()
        client = _mock_client(game)

        with pytest.raises(AuthorizationError):
            record_game_result(
                client,
                UUID(game["id"]),
                GameResultRequest(winner_index=0, move_history=[]),
                uuid4(),  # random caller — not p1 or p2
            )

    def test_p1_is_authorized(self) -> None:
        game, p1, p2 = _make_game()
        client = _mock_client(game)

        result = record_game_result(
            client,
            UUID(game["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        assert result.winner_id == UUID(p1)

    def test_p2_is_authorized(self) -> None:
        game, p1, p2 = _make_game()
        client = _mock_client(game, p1_elo=1500, p2_elo=1500)

        result = record_game_result(
            client,
            UUID(game["id"]),
            GameResultRequest(winner_index=1, move_history=[]),
            UUID(p2),
        )
        assert result.winner_id == UUID(p2)


# ── winner_index validation ───────────────────────────────────────────────────

class TestRecordGameResultWinnerIndex:
    def test_raises_when_winner_index_is_2(self) -> None:
        game, p1, _ = _make_game()
        client = _mock_client(game)

        with pytest.raises(InvalidMoveError):
            record_game_result(
                client,
                UUID(game["id"]),
                GameResultRequest(winner_index=2, move_history=[]),  # type: ignore[arg-type]
                UUID(p1),
            )

    def test_raises_when_winner_index_is_negative(self) -> None:
        game, p1, _ = _make_game()
        client = _mock_client(game)

        with pytest.raises(InvalidMoveError):
            record_game_result(
                client,
                UUID(game["id"]),
                GameResultRequest(winner_index=-1, move_history=[]),  # type: ignore[arg-type]
                UUID(p1),
            )


# ── elo calculations in response ──────────────────────────────────────────────

class TestRecordGameResultElo:
    def test_winner_elo_change_is_positive(self) -> None:
        game, p1, _ = _make_game()
        client = _mock_client(game, p1_elo=1500, p2_elo=1500)

        result = record_game_result(
            client, UUID(game["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        assert result.elo_change_p1 > 0

    def test_loser_elo_change_is_negative(self) -> None:
        game, p1, _ = _make_game()
        client = _mock_client(game, p1_elo=1500, p2_elo=1500)

        result = record_game_result(
            client, UUID(game["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        assert result.elo_change_p2 < 0

    def test_new_elo_p1_reflects_gain(self) -> None:
        game, p1, _ = _make_game()
        client = _mock_client(game, p1_elo=1500, p2_elo=1500)

        result = record_game_result(
            client, UUID(game["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        assert result.new_elo_p1 == 1500 + result.elo_change_p1

    def test_rpc_called_with_correct_winner_id(self) -> None:
        game, p1, _ = _make_game()
        client = _mock_client(game)

        record_game_result(
            client, UUID(game["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        rpc_kwargs = client.rpc.call_args[1] if client.rpc.call_args.kwargs else client.rpc.call_args[0][1]
        assert rpc_kwargs["p_winner_user_id"] == p1


# ── idempotency bug (documented) ─────────────────────────────────────────────

class TestRecordGameResultIdempotency:
    def test_already_finished_returns_stored_elo_deltas(self) -> None:
        """Second caller gets the stored elo_change values correctly."""
        game, p1, p2 = _make_game(
            status="finished",
            winner_id=p1 if (p1 := str(uuid4())) else None,
            elo_change_p1=16,
            elo_change_p2=-18,
        )
        # Re-extract since _make_game returns a tuple; rebuild cleanly
        game2, p1, p2 = _make_game(status="finished", elo_change_p1=16, elo_change_p2=-18)
        game2["winner_id"] = p1

        client = MagicMock()
        game_exec = MagicMock()
        game_exec.data = [game2]
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = game_exec

        result = record_game_result(
            client, UUID(game2["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        assert result.elo_change_p1 == 16
        assert result.elo_change_p2 == -18

    def test_already_finished_bug_new_elo_is_zero(self) -> None:
        """Documents bug: game_service returns new_elo_p1=0, new_elo_p2=0 for already-finished games.

        The second caller (or a retry) gets the correct ELO deltas but zero for
        the absolute new ELO values. This is incorrect — the backend should query
        the current ELO from the users table and return it. This test should be
        updated to assert the CORRECT ELO values once the bug is fixed.
        """
        game, p1, p2 = _make_game(status="finished", elo_change_p1=16, elo_change_p2=-18)
        game["winner_id"] = p1

        client = MagicMock()
        game_exec = MagicMock()
        game_exec.data = [game]
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = game_exec

        result = record_game_result(
            client, UUID(game["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        # BUG: these should be the actual post-game ELO values, not 0.
        assert result.new_elo_p1 == 0   # incorrect — bug
        assert result.new_elo_p2 == 0   # incorrect — bug

    def test_already_finished_does_not_call_rpc(self) -> None:
        """Idempotency: second caller must not re-run the RPC transaction."""
        game, p1, _ = _make_game(status="finished", elo_change_p1=16, elo_change_p2=-18)
        game["winner_id"] = p1

        client = MagicMock()
        game_exec = MagicMock()
        game_exec.data = [game]
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = game_exec

        record_game_result(
            client, UUID(game["id"]),
            GameResultRequest(winner_index=0, move_history=[]),
            UUID(p1),
        )
        client.rpc.assert_not_called()
