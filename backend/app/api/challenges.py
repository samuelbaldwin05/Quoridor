from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.schemas.challenge import ChallengeCreate, ChallengeRead
from app.schemas.user import UserRead
from app.services import challenge_service

router = APIRouter(prefix="/api/challenges", tags=["challenges"])


@router.get("/", response_model=list[ChallengeRead])
def list_challenges(
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> list[ChallengeRead]:
    """List all pending challenges involving the current user."""
    return challenge_service.list_mine(client, user.id)


@router.post("/", response_model=ChallengeRead, status_code=201)
def send_challenge(
    body: ChallengeCreate,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> ChallengeRead:
    """Send a challenge to a friend."""
    return challenge_service.send(client, user.id, body.challenged_id, body.time_control)


@router.post("/{challenge_id}/accept", response_model=ChallengeRead)
def accept_challenge(
    challenge_id: UUID,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> ChallengeRead:
    """Accept a challenge — creates the game and returns the game_id."""
    return challenge_service.accept(client, challenge_id, user.id)


@router.delete("/{challenge_id}", status_code=204)
def delete_challenge(
    challenge_id: UUID,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> None:
    """Cancel (sender) or decline (receiver) a challenge."""
    challenge_service.cancel_or_decline(client, challenge_id, user.id)
