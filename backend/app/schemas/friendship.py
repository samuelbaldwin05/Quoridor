from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


class FriendshipStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    BLOCKED = "blocked"


class FriendshipCreate(BaseModel):
    receiver_id: UUID


class FriendshipRead(BaseModel):
    id: UUID
    requester_id: UUID
    receiver_id: UUID
    status: FriendshipStatus
    created_at: datetime
    requester_name: str | None = None
    receiver_name: str | None = None


class FriendWithProfile(BaseModel):
    friendship_id: UUID
    friend_id: UUID
    requester_id: UUID  # lets client determine sent vs received
    display_name: str
    username: str | None = None
    elo: int
    status: FriendshipStatus
