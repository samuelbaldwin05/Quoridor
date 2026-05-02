from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.core.rate_limit import limiter
from app.schemas.friendship import FriendshipCreate, FriendshipRead, FriendWithProfile
from app.schemas.user import UserRead
from app.services import friendship_service

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("/", response_model=list[FriendWithProfile])
def list_friends(
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> list[FriendWithProfile]:
    """List all friends and pending requests for the authenticated user."""
    return friendship_service.list_friends(client, user.id)


@router.post("/request", response_model=FriendshipRead, status_code=201)
@limiter.limit("20/minute")
def send_friend_request(
    request: Request,
    body: FriendshipCreate,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> FriendshipRead:
    """Send a friend request to another user."""
    return friendship_service.send_request(client, user.id, body.receiver_id)


@router.put("/{friendship_id}/accept", response_model=FriendshipRead)
def accept_friend_request(
    friendship_id: UUID,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> FriendshipRead:
    """Accept an incoming friend request. Only the receiver may call this."""
    return friendship_service.accept_request(client, friendship_id, user.id)


@router.delete("/{friendship_id}", response_model=dict)
def delete_friendship(
    friendship_id: UUID,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> dict:
    """Unfriend or cancel a pending friend request."""
    friendship_service.delete(client, friendship_id, user.id)
    return {"ok": True}
