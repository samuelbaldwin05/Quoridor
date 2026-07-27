from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError
from app.repositories import friendship_repository
from app.services import friendship_service

CLIENT = object()  # repository is monkeypatched; the client is a forwarded sentinel


class TestSendRequest:
    def test_cannot_friend_yourself(self) -> None:
        uid = uuid4()
        with pytest.raises(ConflictError):
            friendship_service.send_request(CLIENT, uid, uid)

    def test_valid_request_delegates_to_repository(self, monkeypatch) -> None:
        sentinel = object()
        captured: dict = {}

        def fake_create(client, requester, receiver):
            captured.update(client=client, requester=requester, receiver=receiver)
            return sentinel

        monkeypatch.setattr(friendship_repository, "create_friendship", fake_create)
        requester, receiver = uuid4(), uuid4()
        result = friendship_service.send_request(CLIENT, requester, receiver)
        assert result is sentinel
        assert captured == {"client": CLIENT, "requester": requester, "receiver": receiver}


class TestDelegation:
    def test_list_friends(self, monkeypatch) -> None:
        sentinel = object()
        monkeypatch.setattr(friendship_repository, "get_friends", lambda c, u: sentinel)
        assert friendship_service.list_friends(CLIENT, uuid4()) is sentinel

    def test_accept_request(self, monkeypatch) -> None:
        sentinel = object()
        seen: dict = {}
        monkeypatch.setattr(
            friendship_repository,
            "accept_friendship",
            lambda c, fid, uid: seen.update(fid=fid, uid=uid) or sentinel,
        )
        fid, uid = uuid4(), uuid4()
        assert friendship_service.accept_request(CLIENT, fid, uid) is sentinel
        assert seen == {"fid": fid, "uid": uid}

    def test_delete(self, monkeypatch) -> None:
        seen: dict = {}
        monkeypatch.setattr(
            friendship_repository,
            "delete_friendship",
            lambda c, fid, uid: seen.update(fid=fid, uid=uid),
        )
        fid, uid = uuid4(), uuid4()
        friendship_service.delete(CLIENT, fid, uid)
        assert seen == {"fid": fid, "uid": uid}
