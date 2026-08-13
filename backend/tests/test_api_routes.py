from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

# Importing the app pulls in the AI router -> torch_agent -> torch. Skip the whole
# module cleanly where torch isn't installed (e.g. a headless CI).
if importlib.util.find_spec("torch") is None:  # pragma: no cover
    pytest.skip("torch not installed", allow_module_level=True)

from fastapi.testclient import TestClient

from app.api.main import app
from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    CooldownError,
    NotFoundError,
    ValidationError,
)
from app.schemas.game import BotGameRead
from app.schemas.user import UserProfile, UserRead


def _fake_user() -> UserRead:
    return UserRead(
        id=uuid4(),
        email="alice@example.com",
        username="alice",
        elo=1500,
        games_played=3,
        created_at=datetime.now(UTC),
    )


FAKE_USER = _fake_user()


@pytest.fixture
def client():
    """TestClient with auth + supabase dependencies overridden (authenticated)."""
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase] = lambda: MagicMock()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── auth gating ───────────────────────────────────────────────────────────────


def test_authed_endpoint_without_token_is_rejected():
    app.dependency_overrides.clear()  # no auth override -> real HTTPBearer runs
    with TestClient(app) as c:
        resp = c.get("/api/friends/")
    assert resp.status_code in (401, 403)


# ── domain exception -> HTTP status mapping ───────────────────────────────────


class TestExceptionMapping:
    def test_cooldown_error_maps_to_429(self, client, monkeypatch):
        def raise_cooldown(*a, **k):
            raise CooldownError("try again later")

        monkeypatch.setattr("app.services.user_service.update_username", raise_cooldown)
        resp = client.patch("/api/users/me", json={"username": "newname"})
        assert resp.status_code == 429

    def test_validation_error_maps_to_422(self, client, monkeypatch):
        def raise_validation(*a, **k):
            raise ValidationError("bad username")

        monkeypatch.setattr("app.services.user_service.update_username", raise_validation)
        resp = client.patch("/api/users/me", json={"username": "x"})
        assert resp.status_code == 422

    def test_not_found_maps_to_404(self, client, monkeypatch):
        def raise_not_found(*a, **k):
            raise NotFoundError("no such user")

        monkeypatch.setattr("app.services.user_service.get_profile", raise_not_found)
        resp = client.get(f"/api/users/{uuid4()}")
        assert resp.status_code == 404

    def test_conflict_maps_to_409(self, client, monkeypatch):
        def raise_conflict(*a, **k):
            raise ConflictError("cannot challenge yourself")

        monkeypatch.setattr("app.services.challenge_service.send", raise_conflict)
        resp = client.post(
            "/api/challenges/", json={"challenged_id": str(uuid4()), "time_control": 300}
        )
        assert resp.status_code == 409

    def test_authorization_error_maps_to_403(self, client, monkeypatch):
        def raise_authz(*a, **k):
            raise AuthorizationError("not a participant")

        # games.py imports record_game_result by name, so patch it in that module.
        monkeypatch.setattr("app.api.games.record_game_result", raise_authz)
        resp = client.post(
            f"/games/{uuid4()}/result",
            json={"winner_index": 0, "move_history": [], "reason": "resign"},
        )
        assert resp.status_code == 403


# ── happy paths + response shape ──────────────────────────────────────────────


class TestHappyPaths:
    def test_get_profile_returns_200_without_email(self, client, monkeypatch):
        profile = UserProfile(
            id=uuid4(),
            username="bob",
            elo=1600,
            games_played=10,
            created_at=datetime.now(UTC),
            time_stats=[],
        )
        monkeypatch.setattr("app.services.user_service.get_profile", lambda c, uid: profile)
        resp = client.get(f"/api/users/{profile.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "bob"
        assert "email" not in body  # public profile must not leak email

    def test_update_username_success_returns_200(self, client, monkeypatch):
        monkeypatch.setattr(
            "app.services.user_service.update_username", lambda c, u, name: FAKE_USER
        )
        resp = client.patch("/api/users/me", json={"username": "newname"})
        assert resp.status_code == 200


# ── 204 deletes ───────────────────────────────────────────────────────────────


class TestNoContentDeletes:
    def test_leave_queue_returns_204(self, client, monkeypatch):
        monkeypatch.setattr("app.services.matchmaking_service.leave_queue", lambda c, u: None)
        resp = client.delete("/matchmaking/leave")
        assert resp.status_code == 204
        assert resp.content == b""

    def test_delete_friendship_returns_204(self, client, monkeypatch):
        monkeypatch.setattr("app.services.friendship_service.delete", lambda c, fid, uid: None)
        resp = client.delete(f"/api/friends/{uuid4()}")
        assert resp.status_code == 204

    def test_delete_challenge_returns_204(self, client, monkeypatch):
        monkeypatch.setattr(
            "app.services.challenge_service.cancel_or_decline", lambda c, cid, uid: None
        )
        resp = client.delete(f"/api/challenges/{uuid4()}")
        assert resp.status_code == 204


# ── request validation (Pydantic -> 422) ──────────────────────────────────────


class TestRequestValidation:
    def test_join_queue_rejects_invalid_time_control(self, client):
        resp = client.post("/matchmaking/join", json={"time_control": 999})
        assert resp.status_code == 422  # Literal[180,300,600]

    def test_update_me_rejects_missing_username(self, client):
        resp = client.patch("/api/users/me", json={})
        assert resp.status_code == 422

    def test_result_rejects_out_of_range_winner_index(self, client):
        resp = client.post(
            f"/games/{uuid4()}/result",
            json={"winner_index": 2, "move_history": [], "reason": "win"},
        )
        assert resp.status_code == 422


# ── game history routes ────────────────────────────────────────────────────────


class TestGameHistoryRoutes:
    def test_list_user_games_returns_200(self, client, monkeypatch):
        monkeypatch.setattr(
            "app.services.game_service.list_user_games", lambda c, uid, lim, off: []
        )
        resp = client.get(f"/api/users/{uuid4()}/games")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_game_detail_not_found_maps_to_404(self, client, monkeypatch):
        def raise_not_found(*a, **k):
            raise NotFoundError("no game")

        # games.py imports get_game_detail by name, so patch it in that module.
        monkeypatch.setattr("app.api.games.get_game_detail", raise_not_found)
        resp = client.get(f"/games/{uuid4()}")
        assert resp.status_code == 404


# ── record bot game route ───────────────────────────────────────────────────────


class TestBotGameRoute:
    def test_record_bot_game_returns_200(self, client, monkeypatch):
        stored = BotGameRead(
            id=uuid4(),
            client_game_id="local-1",
            ai_difficulty="bot2",
            winner_index=0,
            status="finished",
            created=True,
        )
        # games.py imports record_bot_game by name, so patch it in that module.
        monkeypatch.setattr("app.api.games.record_bot_game", lambda s, b, uid: stored)
        resp = client.post(
            "/games/bot",
            json={
                "client_game_id": "local-1",
                "ai_difficulty": "bot2",
                "winner_index": 0,
                "move_history": ["e2", "e8"],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ai_difficulty"] == "bot2"
        assert body["created"] is True

    def test_record_bot_game_rejects_bad_difficulty(self, client):
        resp = client.post(
            "/games/bot",
            json={"client_game_id": "x", "ai_difficulty": "easy", "winner_index": 0},
        )
        assert resp.status_code == 422

    def test_record_bot_game_rejects_out_of_range_winner(self, client):
        resp = client.post(
            "/games/bot",
            json={"client_game_id": "x", "ai_difficulty": "bot0", "winner_index": 2},
        )
        assert resp.status_code == 422


# ── move submission route (per-move authority wiring) ─────────────────────────


class TestSubmitMoveRoute:
    def test_submit_move_returns_200(self, client, monkeypatch):
        from app.schemas.game import MoveSubmitResponse

        resp_obj = MoveSubmitResponse(
            move_number=1, current_player_index=1, status="playing", winner=None
        )
        monkeypatch.setattr("app.api.games.submit_move", lambda s, gid, b, uid: resp_obj)
        resp = client.post(f"/games/{uuid4()}/move", json={"notation": "e2"})
        assert resp.status_code == 200
        assert resp.json()["move_number"] == 1

    def test_submit_move_bad_notation_rejected_at_schema(self, client):
        resp = client.post(f"/games/{uuid4()}/move", json={"notation": "GARBAGE"})
        assert resp.status_code == 422

    def test_submit_move_conflict_maps_to_409(self, client, monkeypatch):
        # A stale / double-submitted move (optimistic-concurrency mismatch) surfaces as
        # ConflictError -> 409, telling the client to resync rather than duplicating.
        def raise_conflict(*a, **k):
            raise ConflictError("game state changed; resync required")

        monkeypatch.setattr("app.api.games.submit_move", raise_conflict)
        resp = client.post(f"/games/{uuid4()}/move", json={"notation": "e2"})
        assert resp.status_code == 409

    def test_result_disconnect_authz_rejection_maps_to_403(self, client, monkeypatch):
        # A disconnect-forfeit claim made when it is the caller's own turn is rejected
        # server-side (AuthorizationError -> 403).
        def raise_authz(*a, **k):
            raise AuthorizationError("cannot claim a disconnect forfeit while it is your move")

        monkeypatch.setattr("app.api.games.record_game_result", raise_authz)
        resp = client.post(
            f"/games/{uuid4()}/result",
            json={"winner_index": 0, "move_history": [], "reason": "disconnect"},
        )
        assert resp.status_code == 403


class TestAiEngineRoutes:
    """The AI endpoints are unauthenticated (guests play bots), so these use a bare client."""

    def _state_payload(self) -> dict:
        return {
            "state": {
                "players": [
                    {"position": {"row": 8, "col": 4}, "walls_remaining": 10, "goal_row": 0},
                    {"position": {"row": 0, "col": 4}, "walls_remaining": 10, "goal_row": 8},
                ],
                "walls": [],
                "current_player_index": 1,
            },
            "engine": "mcts",
        }

    def test_engines_endpoint_reports_availability(self, client, monkeypatch):
        from app.schemas.ai import EngineStatusResponse

        monkeypatch.setattr(
            "app.api.ai.ai_service.engine_status",
            lambda: EngineStatusResponse(mcts_available=True, engine_commit="abc1234"),
        )
        resp = client.get("/api/ai/engines")
        assert resp.status_code == 200
        assert resp.json() == {"mcts_available": True, "engine_commit": "abc1234"}

    def test_busy_engine_maps_to_503_with_retry_after(self, client, monkeypatch):
        """A shed request has to be distinguishable from a broken one, and has to carry
        Retry-After, because the client falls back to its own engine on this signal."""
        from app.core.exceptions import EngineBusyError

        async def raise_busy(body, *, authenticated):
            raise EngineBusyError("MCTS engine is saturated")

        monkeypatch.setattr("app.api.ai.ai_service.choose_move", raise_busy)
        resp = client.post("/api/ai/move", json=self._state_payload())
        assert resp.status_code == 503
        assert resp.headers["retry-after"] == "2"

    def test_missing_engine_maps_to_503(self, client, monkeypatch):
        from app.core.exceptions import EngineUnavailableError

        async def raise_unavailable(body, *, authenticated):
            raise EngineUnavailableError("MCTS engine module is not installed")

        monkeypatch.setattr("app.api.ai.ai_service.choose_move", raise_unavailable)
        resp = client.post("/api/ai/move", json=self._state_payload())
        assert resp.status_code == 503

    def test_unknown_engine_is_rejected_at_the_schema(self, client):
        body = self._state_payload()
        body["engine"] = "nope"
        resp = client.post("/api/ai/move", json=body)
        assert resp.status_code == 422


class TestAiEngineAuth:
    """The route resolves identity itself, so the gate needs a test at this level too: a service
    check that nothing calls is worthless."""

    def _mcts_payload(self) -> dict:
        return {
            "state": {
                "players": [
                    {"position": {"row": 8, "col": 4}, "walls_remaining": 10, "goal_row": 0},
                    {"position": {"row": 0, "col": 4}, "walls_remaining": 10, "goal_row": 8},
                ],
                "walls": [],
                "current_player_index": 1,
            },
            "engine": "mcts",
        }

    def test_anonymous_caller_is_refused_the_search_engine(self, monkeypatch):
        from app.core.auth import get_optional_user_id

        app.dependency_overrides[get_optional_user_id] = lambda: None
        try:
            with TestClient(app) as c:
                resp = c.post("/api/ai/move", json=self._mcts_payload())
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 403

    def test_signed_in_caller_reaches_the_search_engine(self, monkeypatch):
        from uuid import uuid4

        from app.core.auth import get_optional_user_id
        from app.schemas.ai import AIMoveResponse, MovePayload, PositionPayload

        async def fake_choose(body, *, authenticated):
            assert authenticated is True
            return AIMoveResponse(
                move=MovePayload(kind="pawn", to=PositionPayload(row=1, col=4)), stats=None
            )

        monkeypatch.setattr("app.api.ai.ai_service.choose_move", fake_choose)
        app.dependency_overrides[get_optional_user_id] = lambda: uuid4()
        try:
            with TestClient(app) as c:
                resp = c.post("/api/ai/move", json=self._mcts_payload())
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["move"]["to"] == {"row": 1, "col": 4}

    def test_guest_can_still_reach_the_default_engine(self, monkeypatch):
        from app.core.auth import get_optional_user_id
        from app.schemas.ai import AIMoveResponse, MovePayload, PositionPayload

        async def fake_choose(body, *, authenticated):
            assert authenticated is False
            return AIMoveResponse(
                move=MovePayload(kind="pawn", to=PositionPayload(row=7, col=4)), stats=None
            )

        monkeypatch.setattr("app.api.ai.ai_service.choose_move", fake_choose)
        app.dependency_overrides[get_optional_user_id] = lambda: None
        try:
            body = self._mcts_payload()
            body.pop("engine")
            with TestClient(app) as c:
                resp = c.post("/api/ai/move", json=body)
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200

    def test_a_garbage_bearer_token_is_rejected_rather_than_treated_as_a_guest(self):
        with TestClient(app) as c:
            resp = c.post(
                "/api/ai/move",
                json=self._mcts_payload(),
                headers={"Authorization": "Bearer not-a-jwt"},
            )
        assert resp.status_code == 401
