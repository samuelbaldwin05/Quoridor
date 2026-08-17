from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.repositories import challenge_repository, matchmaking_repository
from app.schemas.user import UserRead
from app.services import matchmaking_service

# The repository is monkeypatched in every test, so the client is just a sentinel
# the service forwards along.
CLIENT = object()


def _user(elo: int = 1500, username: str = "alice") -> UserRead:
    return UserRead(
        id=uuid4(),
        email="a@b.c",
        username=username,
        elo=elo,
        games_played=0,
        created_at=datetime.now(UTC),
    )


# ── _compute_elo_band ─────────────────────────────────────────────────────────


class TestComputeEloBand:
    def test_recent_join_is_at_base(self) -> None:
        now_iso = datetime.now(UTC).isoformat()
        assert matchmaking_service._compute_elo_band(now_iso) == matchmaking_service.ELO_BAND_BASE

    def test_old_join_caps_at_max(self) -> None:
        assert (
            matchmaking_service._compute_elo_band("2000-01-01T00:00:00+00:00")
            == matchmaking_service.ELO_BAND_MAX
        )

    def test_invalid_iso_falls_back_to_base(self) -> None:
        assert (
            matchmaking_service._compute_elo_band("not-a-date") == matchmaking_service.ELO_BAND_BASE
        )


# ── join_queue ────────────────────────────────────────────────────────────────


class TestJoinQueue:
    def test_existing_waiting_returns_waiting_without_inserting(self, monkeypatch) -> None:
        inserted: list = []
        restarted: list = []
        monkeypatch.setattr(
            matchmaking_repository, "get_queue_entry", lambda c, k: {"matched_game_id": None}
        )
        monkeypatch.setattr(
            matchmaking_repository, "insert_queue_entry", lambda c, e: inserted.append(e)
        )
        monkeypatch.setattr(
            matchmaking_repository,
            "touch_queue_entry",
            lambda c, k, restart_wait=False: restarted.append(restart_wait),
        )
        status = matchmaking_service.join_queue(CLIENT, _user(), 300)
        assert status.status == "waiting"
        assert inserted == []
        assert restarted == [True], "a new Find Match restarts the surviving row's clock"

    def test_join_sweeps_before_reading_the_caller_row(self, monkeypatch) -> None:
        calls: list = []
        monkeypatch.setattr(
            matchmaking_repository,
            "cleanup_stale_entries",
            lambda c, idle, max_wait: calls.append("sweep"),
        )
        monkeypatch.setattr(
            matchmaking_repository, "get_queue_entry", lambda c, k: calls.append("read") or None
        )
        monkeypatch.setattr(matchmaking_repository, "insert_queue_entry", lambda c, e: True)
        monkeypatch.setattr(challenge_repository, "cancel_challenges_for_user", lambda c, u: None)
        monkeypatch.setattr(matchmaking_repository, "match_in_queue", lambda *a: None)

        matchmaking_service.join_queue(CLIENT, _user(), 300)
        assert calls[:2] == ["sweep", "read"]

    def test_no_existing_inserts_and_matches(self, monkeypatch) -> None:
        monkeypatch.setattr(matchmaking_repository, "get_queue_entry", lambda c, k: None)
        monkeypatch.setattr(matchmaking_repository, "insert_queue_entry", lambda c, e: True)
        monkeypatch.setattr(challenge_repository, "cancel_challenges_for_user", lambda c, u: None)
        monkeypatch.setattr(
            matchmaking_repository,
            "match_in_queue",
            lambda *a: {
                "game_id": "g1",
                "opponent_name": "bob",
                "opponent_elo": 1490,
                "player_role": 0,
            },
        )
        status = matchmaking_service.join_queue(CLIENT, _user(), 300)
        assert status.status == "matched"
        assert status.matched_game_id == "g1"
        assert status.opponent_name == "bob"
        assert status.player_role == 0

    def test_no_existing_no_match_returns_waiting(self, monkeypatch) -> None:
        monkeypatch.setattr(matchmaking_repository, "get_queue_entry", lambda c, k: None)
        monkeypatch.setattr(matchmaking_repository, "insert_queue_entry", lambda c, e: True)
        monkeypatch.setattr(challenge_repository, "cancel_challenges_for_user", lambda c, u: None)
        monkeypatch.setattr(matchmaking_repository, "match_in_queue", lambda *a: None)
        status = matchmaking_service.join_queue(CLIENT, _user(), 300)
        assert status.status == "waiting"

    def test_existing_matched_is_cleared_then_rejoined(self, monkeypatch) -> None:
        deleted: list = []
        monkeypatch.setattr(
            matchmaking_repository, "get_queue_entry", lambda c, k: {"matched_game_id": "stale"}
        )
        monkeypatch.setattr(
            matchmaking_repository, "delete_queue_entry", lambda c, k: deleted.append(k)
        )
        monkeypatch.setattr(matchmaking_repository, "insert_queue_entry", lambda c, e: True)
        monkeypatch.setattr(challenge_repository, "cancel_challenges_for_user", lambda c, u: None)
        monkeypatch.setattr(matchmaking_repository, "match_in_queue", lambda *a: None)
        status = matchmaking_service.join_queue(CLIENT, _user(), 300)
        assert deleted, "stale matched entry should be deleted before re-queueing"
        assert status.status == "waiting"


# ── queue_status ──────────────────────────────────────────────────────────────


class TestQueueStatus:
    def test_not_in_queue(self, monkeypatch) -> None:
        monkeypatch.setattr(matchmaking_repository, "get_queue_entry", lambda c, k: None)
        assert matchmaking_service.queue_status(CLIENT, _user()).status == "not_in_queue"

    def test_matched_resolves_caller_role(self, monkeypatch) -> None:
        u = _user()
        monkeypatch.setattr(
            matchmaking_repository,
            "get_queue_entry",
            lambda c, k: {
                "matched_game_id": "g1",
                "opponent_name": "bob",
                "opponent_elo": 1490,
            },
        )
        monkeypatch.setattr(matchmaking_repository, "get_player1_id", lambda c, gid: str(u.id))
        status = matchmaking_service.queue_status(CLIENT, u)
        assert status.status == "matched"
        assert status.matched_game_id == "g1"
        assert status.player_role == 0  # caller is player1

    def test_waiting_attempts_a_match(self, monkeypatch) -> None:
        monkeypatch.setattr(
            matchmaking_repository,
            "get_queue_entry",
            lambda c, k: {
                "matched_game_id": None,
                "joined_at": datetime.now(UTC).isoformat(),
                "time_control": 300,
            },
        )
        monkeypatch.setattr(matchmaking_repository, "match_in_queue", lambda *a: None)
        assert matchmaking_service.queue_status(CLIENT, _user()).status == "waiting"

    def test_waiting_poll_beats_the_heartbeat_and_sweeps(self, monkeypatch) -> None:
        touched: list = []
        swept: list = []
        monkeypatch.setattr(
            matchmaking_repository,
            "get_queue_entry",
            lambda c, k: {
                "matched_game_id": None,
                "joined_at": datetime.now(UTC).isoformat(),
                "time_control": 300,
            },
        )
        monkeypatch.setattr(
            matchmaking_repository,
            "touch_queue_entry",
            lambda c, k, restart_wait=False: touched.append(k),
        )
        monkeypatch.setattr(
            matchmaking_repository,
            "cleanup_stale_entries",
            lambda c, idle, max_wait: swept.append((idle, max_wait)),
        )
        monkeypatch.setattr(matchmaking_repository, "match_in_queue", lambda *a: None)

        user = _user()
        assert matchmaking_service.queue_status(CLIENT, user).status == "waiting"
        assert touched == [str(user.id)], "a live poll must refresh the row's heartbeat"
        assert swept == [
            (
                matchmaking_service.QUEUE_IDLE_TIMEOUT_SECONDS,
                matchmaking_service.QUEUE_MAX_WAIT_SECONDS,
            )
        ]

    def test_past_the_cap_expires_the_row(self, monkeypatch) -> None:
        deleted: list = []
        matched: list = []
        stale = datetime.now(UTC) - timedelta(
            seconds=matchmaking_service.QUEUE_MAX_WAIT_SECONDS + 1
        )
        monkeypatch.setattr(
            matchmaking_repository,
            "get_queue_entry",
            lambda c, k: {
                "matched_game_id": None,
                "joined_at": stale.isoformat(),
                "time_control": 300,
            },
        )
        monkeypatch.setattr(
            matchmaking_repository, "delete_queue_entry", lambda c, k: deleted.append(k)
        )
        monkeypatch.setattr(matchmaking_repository, "match_in_queue", lambda *a: matched.append(a))

        user = _user()
        status = matchmaking_service.queue_status(CLIENT, user)
        assert status.status == "expired"
        assert deleted == [str(user.id)]
        assert matched == [], "an expired search must not be paired with anyone"

    def test_just_under_the_cap_keeps_searching(self, monkeypatch) -> None:
        fresh = datetime.now(UTC) - timedelta(
            seconds=matchmaking_service.QUEUE_MAX_WAIT_SECONDS - 10
        )
        monkeypatch.setattr(
            matchmaking_repository,
            "get_queue_entry",
            lambda c, k: {
                "matched_game_id": None,
                "joined_at": fresh.isoformat(),
                "time_control": 300,
            },
        )
        monkeypatch.setattr(matchmaking_repository, "match_in_queue", lambda *a: None)
        assert matchmaking_service.queue_status(CLIENT, _user()).status == "waiting"


# ── _resolve_player_role ──────────────────────────────────────────────────────


class TestResolvePlayerRole:
    def test_caller_is_player1(self, monkeypatch) -> None:
        monkeypatch.setattr(matchmaking_repository, "get_player1_id", lambda c, gid: "me")
        assert matchmaking_service._resolve_player_role(CLIENT, "g", "me") == 0

    def test_caller_is_player2(self, monkeypatch) -> None:
        monkeypatch.setattr(matchmaking_repository, "get_player1_id", lambda c, gid: "other")
        assert matchmaking_service._resolve_player_role(CLIENT, "g", "me") == 1

    def test_game_not_found_defaults_to_player1(self, monkeypatch) -> None:
        monkeypatch.setattr(matchmaking_repository, "get_player1_id", lambda c, gid: None)
        assert matchmaking_service._resolve_player_role(CLIENT, "g", "me") == 0

    def test_db_error_defaults_to_player1(self, monkeypatch) -> None:
        def boom(c, gid):
            raise RuntimeError("db down")

        monkeypatch.setattr(matchmaking_repository, "get_player1_id", boom)
        assert matchmaking_service._resolve_player_role(CLIENT, "g", "me") == 0


# ── leave_queue ───────────────────────────────────────────────────────────────


def test_leave_queue_delegates_with_player_key(monkeypatch) -> None:
    called: list = []
    monkeypatch.setattr(matchmaking_repository, "delete_queue_entry", lambda c, k: called.append(k))
    user = _user()
    matchmaking_service.leave_queue(CLIENT, user)
    assert called == [str(user.id)]
