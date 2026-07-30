from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.core.rate_limit import limiter
from app.schemas.matchmaking import JoinQueueRequest, QueueStatus
from app.schemas.user import UserRead
from app.services import matchmaking_service

router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])


@router.post("/join", response_model=QueueStatus)
@limiter.limit("30/minute")
def join_queue(
    request: Request,
    body: JoinQueueRequest,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> QueueStatus:
    """Join the matchmaking queue. Uses the authenticated user's ID as the stable key."""
    return matchmaking_service.join_queue(client, user, body.time_control)


@router.get("/status", response_model=QueueStatus)
def queue_status(
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> QueueStatus:
    """Poll matchmaking status. While waiting, also attempts a match with the expanded ELO band."""
    return matchmaking_service.queue_status(client, user)


@router.delete("/leave", status_code=204)
def leave_queue(
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> None:
    """Remove the authenticated user from the matchmaking queue."""
    matchmaking_service.leave_queue(client, user)
