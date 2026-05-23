from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import ConflictError
from app.repositories import friendship_repository
from app.schemas.friendship import FriendshipRead, FriendWithProfile


def list_friends(client: Client, user_id: UUID) -> list[FriendWithProfile]:
    return friendship_repository.get_friends(client, user_id)


def send_request(client: Client, requester_id: UUID, receiver_id: UUID) -> FriendshipRead:
    if requester_id == receiver_id:
        raise ConflictError("cannot send a friend request to yourself")
    return friendship_repository.create_friendship(client, requester_id, receiver_id)


def accept_request(client: Client, friendship_id: UUID, user_id: UUID) -> FriendshipRead:
    return friendship_repository.accept_friendship(client, friendship_id, user_id)


def delete(client: Client, friendship_id: UUID, user_id: UUID) -> None:
    friendship_repository.delete_friendship(client, friendship_id, user_id)
