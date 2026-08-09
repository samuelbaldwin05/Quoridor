from __future__ import annotations

from unittest.mock import MagicMock

from app.repositories import game_repository


def _users_client(name_by_id: dict[str, str]) -> MagicMock:
    """Supabase mock whose users.select(...).in_(...).execute() returns id/username rows."""
    client = MagicMock()
    exec_result = MagicMock()
    exec_result.data = [{"id": uid, "username": name} for uid, name in name_by_id.items()]
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = (
        exec_result
    )
    return client


class TestAttachCurrentNames:
    def test_overwrites_snapshot_with_current_username(self) -> None:
        rows = [
            {"player1_id": "u1", "player2_id": "u2", "player1_name": "OldA", "player2_name": "OldB"}
        ]
        client = _users_client({"u1": "NewA", "u2": "NewB"})
        (row,) = game_repository._attach_current_names(client, rows)
        assert row["player1_name"] == "NewA"
        assert row["player2_name"] == "NewB"

    def test_keeps_snapshot_when_user_missing(self) -> None:
        rows = [
            {"player1_id": "u1", "player2_id": "u2", "player1_name": "OldA", "player2_name": "OldB"}
        ]
        client = _users_client({"u1": "NewA"})  # u2 not returned
        (row,) = game_repository._attach_current_names(client, rows)
        assert row["player1_name"] == "NewA"
        assert row["player2_name"] == "OldB"  # unchanged fallback

    def test_no_player_ids_skips_lookup(self) -> None:
        client = MagicMock()
        rows = [{"player1_id": None, "player2_id": None, "player1_name": "X", "player2_name": None}]
        out = game_repository._attach_current_names(client, rows)
        assert out == rows
        client.table.assert_not_called()  # no query when there is nothing to resolve

    def test_lookup_failure_falls_back_to_snapshot(self) -> None:
        rows = [
            {"player1_id": "u1", "player2_id": None, "player1_name": "OldA", "player2_name": None}
        ]
        client = MagicMock()
        client.table.return_value.select.return_value.in_.return_value.execute.side_effect = (
            Exception("boom")
        )
        (row,) = game_repository._attach_current_names(client, rows)
        assert row["player1_name"] == "OldA"  # snapshot preserved, no crash


class TestGetBotGameByClientId:
    def test_returns_first_row(self) -> None:
        client = MagicMock()
        exec_result = MagicMock()
        exec_result.data = [{"id": "g1", "client_game_id": "c1"}]
        (
            client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value
        ) = exec_result
        row = game_repository.get_bot_game_by_client_id(client, "u1", "c1")
        assert row == {"id": "g1", "client_game_id": "c1"}

    def test_returns_none_when_absent(self) -> None:
        client = MagicMock()
        exec_result = MagicMock()
        exec_result.data = []
        (
            client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value
        ) = exec_result
        assert game_repository.get_bot_game_by_client_id(client, "u1", "c1") is None
