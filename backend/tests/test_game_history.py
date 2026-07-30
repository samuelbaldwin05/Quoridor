from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from app.core.exceptions import NotFoundError
from app.repositories import game_repository
from app.services import game_service

# game_repository is monkeypatched, so the client is a forwarded sentinel.
CLIENT = object()


def _row(**overrides) -> dict:
    row = {
        "id": str(uuid4()),
        "mode": "ranked",
        "status": "finished",
        "time_control": 300,
        "player1_id": str(uuid4()),
        "player2_id": str(uuid4()),
        "player1_name": "Alice",
        "player2_name": "Bob",
        "winner_id": None,
        "winner_index": 0,
        "elo_change_p1": 12,
        "elo_change_p2": -14,
        "move_history": ["e2", "e8", "e3"],
        "completed_at": "2026-07-01T00:00:00+00:00",
        "created_at": "2026-07-01T00:00:00+00:00",
    }
    row.update(overrides)
    return row


class TestListUserGames:
    def test_win_from_player1_perspective(self, monkeypatch) -> None:
        row = _row()
        row["winner_id"] = row["player1_id"]
        monkeypatch.setattr(
            game_repository, "list_finished_games_for_user", lambda c, uid, lim, off: [row]
        )
        (summary,) = game_service.list_user_games(CLIENT, UUID(row["player1_id"]))
        assert summary.result == "win"
        assert summary.opponent_id == UUID(row["player2_id"])
        assert summary.opponent_name == "Bob"
        assert summary.elo_change == 12  # p1 delta
        assert summary.move_count == 3

    def test_loss_from_player2_perspective(self, monkeypatch) -> None:
        row = _row()
        row["winner_id"] = row["player1_id"]  # p1 won -> p2 lost
        monkeypatch.setattr(
            game_repository, "list_finished_games_for_user", lambda c, uid, lim, off: [row]
        )
        (summary,) = game_service.list_user_games(CLIENT, UUID(row["player2_id"]))
        assert summary.result == "loss"
        assert summary.opponent_id == UUID(row["player1_id"])
        assert summary.opponent_name == "Alice"
        assert summary.elo_change == -14  # p2 delta

    def test_pagination_args_forwarded(self, monkeypatch) -> None:
        seen: dict = {}
        monkeypatch.setattr(
            game_repository,
            "list_finished_games_for_user",
            lambda c, uid, lim, off: seen.update(limit=lim, offset=off) or [],
        )
        game_service.list_user_games(CLIENT, uuid4(), limit=5, offset=10)
        assert seen == {"limit": 5, "offset": 10}

    def test_empty_history(self, monkeypatch) -> None:
        monkeypatch.setattr(
            game_repository, "list_finished_games_for_user", lambda c, uid, lim, off: []
        )
        assert game_service.list_user_games(CLIENT, uuid4()) == []


class TestGetGameDetail:
    def test_maps_full_detail(self, monkeypatch) -> None:
        row = _row(winner_index=1)
        monkeypatch.setattr(game_repository, "get_game", lambda c, gid: row)
        detail = game_service.get_game_detail(CLIENT, UUID(row["id"]))
        assert detail.player1_name == "Alice"
        assert detail.player2_name == "Bob"
        assert detail.winner_index == 1
        assert detail.move_history == ["e2", "e8", "e3"]
        assert detail.status == "finished"

    def test_missing_game_raises_not_found(self, monkeypatch) -> None:
        monkeypatch.setattr(game_repository, "get_game", lambda c, gid: None)
        with pytest.raises(NotFoundError):
            game_service.get_game_detail(CLIENT, uuid4())
