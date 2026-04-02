from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from supabase import Client

from core.dependencies import get_supabase
from repositories import friendship_repository
from schemas.friendship import FriendshipCreate, FriendshipRead, FriendWithProfile

router = APIRouter(prefix="/api/friends", tags=["friends"])


def get_current_user_id(x_user_id: str | None = Header(None)) -> UUID:
    """
    Extract the calling user's UUID from the X-User-Id header.

    This is a lightweight stand-in for full JWT auth during the demo phase.
    Returns 401 if the header is absent or not a valid UUID.
    """
    if x_user_id is None:
        raise HTTPException(status_code=401, detail="X-User-Id header is required")
    try:
        return UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="X-User-Id must be a valid UUID")


@router.get("/", response_model=list[FriendWithProfile])
def list_friends(
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
) -> list[FriendWithProfile]:
    """List all friends and pending requests for the authenticated user."""
    return friendship_repository.get_friends(client, user_id)


@router.post("/request", response_model=FriendshipRead, status_code=201)
def send_friend_request(
    body: FriendshipCreate,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
) -> FriendshipRead:
    """Send a friend request to another user."""
    if body.receiver_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot send a friend request to yourself")
    return friendship_repository.create_friendship(client, user_id, body.receiver_id)


@router.put("/{friendship_id}/accept", response_model=FriendshipRead)
def accept_friend_request(
    friendship_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
) -> FriendshipRead:
    """Accept an incoming friend request. Only the receiver may call this."""
    return friendship_repository.accept_friendship(client, friendship_id, user_id)


@router.delete("/{friendship_id}", response_model=dict)
def delete_friendship(
    friendship_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    client: Client = Depends(get_supabase),
) -> dict:
    """Unfriend or cancel a pending friend request."""
    friendship_repository.delete_friendship(client, friendship_id, user_id)
    return {"ok": True}
