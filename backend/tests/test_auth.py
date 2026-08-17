from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from app.core import auth
from app.repositories import user_repository
from app.schemas.user import UserRead


class _Creds:
    credentials = "a.jwt.token"


def _user(uid) -> UserRead:
    return UserRead(
        id=uid,
        email="x@y.z",
        username="player",
        elo=1000,
        games_played=0,
        created_at=datetime.now(UTC),
    )


def _capture(monkeypatch, claims: dict) -> dict:
    """Run get_current_user against a fixed set of JWT claims and report what it passed
    to the repository. The token itself is not under test; the claim mapping is."""
    seen: dict = {}
    monkeypatch.setattr(auth, "_verify_jwt", lambda _token: claims)

    def fake_upsert(_client, user_id, email, display_name):
        seen.update(user_id=user_id, email=email, display_name=display_name)
        return _user(user_id)

    monkeypatch.setattr(user_repository, "get_or_create_user", fake_upsert)
    asyncio.run(auth.get_current_user(_Creds(), object()))
    return seen


def test_anonymous_token_gets_an_email_of_its_own(monkeypatch) -> None:
    # An anonymous session (the local dev login) has no email claim, and users.email is
    # NOT NULL UNIQUE: without a synthesized one, the first anonymous user takes "" and
    # every later one collides with them.
    uid = uuid4()
    seen = _capture(monkeypatch, {"sub": str(uid)})
    assert seen["email"] == f"{uid}@anonymous.local"
    assert seen["display_name"] == "Dev Player"


def test_anonymous_users_do_not_share_an_email(monkeypatch) -> None:
    first = _capture(monkeypatch, {"sub": str(uuid4())})
    second = _capture(monkeypatch, {"sub": str(uuid4())})
    assert first["email"] != second["email"]


def test_google_token_keeps_its_own_email_and_name(monkeypatch) -> None:
    uid = uuid4()
    seen = _capture(
        monkeypatch,
        {"sub": str(uid), "email": "sam@example.com", "user_metadata": {"full_name": "Sam"}},
    )
    assert seen["email"] == "sam@example.com"
    assert seen["display_name"] == "Sam"


def test_email_token_without_metadata_falls_back_to_the_local_part(monkeypatch) -> None:
    seen = _capture(monkeypatch, {"sub": str(uuid4()), "email": "sam@example.com"})
    assert seen["display_name"] == "sam"
