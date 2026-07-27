from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError, InvalidMoveError
from app.repositories import challenge_repository
from app.services import challenge_service

CLIENT = object()  # repository is monkeypatched; the client is a forwarded sentinel


class TestSend:
    def test_cannot_challenge_yourself(self) -> None:
        uid = uuid4()
        with pytest.raises(ConflictError):
            challenge_service.send(CLIENT, uid, uid, 300)

    @pytest.mark.parametrize("tc", [0, 60, 301, 1000])
    def test_invalid_time_control_rejected(self, tc: int) -> None:
        with pytest.raises(InvalidMoveError):
            challenge_service.send(CLIENT, uuid4(), uuid4(), tc)

    @pytest.mark.parametrize("tc", [180, 300, 600])
    def test_valid_send_delegates_to_repository(self, monkeypatch, tc: int) -> None:
        sentinel = object()
        captured: dict = {}

        def fake_create(client, challenger, challenged, time_control):
            captured.update(
                client=client, challenger=challenger, challenged=challenged, tc=time_control
            )
            return sentinel

        monkeypatch.setattr(challenge_repository, "create_challenge", fake_create)
        challenger, challenged = uuid4(), uuid4()
        result = challenge_service.send(CLIENT, challenger, challenged, tc)
        assert result is sentinel
        assert captured == {
            "client": CLIENT,
            "challenger": challenger,
            "challenged": challenged,
            "tc": tc,
        }


class TestDelegation:
    def test_list_mine(self, monkeypatch) -> None:
        sentinel = object()
        monkeypatch.setattr(challenge_repository, "get_my_challenges", lambda c, u: sentinel)
        assert challenge_service.list_mine(CLIENT, uuid4()) is sentinel

    def test_accept(self, monkeypatch) -> None:
        sentinel = object()
        seen: dict = {}
        monkeypatch.setattr(
            challenge_repository,
            "accept_challenge",
            lambda c, cid, uid: seen.update(cid=cid, uid=uid) or sentinel,
        )
        cid, uid = uuid4(), uuid4()
        assert challenge_service.accept(CLIENT, cid, uid) is sentinel
        assert seen == {"cid": cid, "uid": uid}

    def test_cancel_or_decline(self, monkeypatch) -> None:
        seen: dict = {}
        monkeypatch.setattr(
            challenge_repository,
            "cancel_or_decline_challenge",
            lambda c, cid, uid: seen.update(cid=cid, uid=uid),
        )
        cid, uid = uuid4(), uuid4()
        challenge_service.cancel_or_decline(CLIENT, cid, uid)
        assert seen == {"cid": cid, "uid": uid}
