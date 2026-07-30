from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.core.rate_limit import limiter
from app.schemas.game import GameSummary
from app.schemas.user import UserProfile, UserRead, UserSearchResult, UserUpdate
from app.services import game_service, user_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/sync", response_model=UserRead)
async def sync_user(user: UserRead = Depends(get_current_user)) -> UserRead:
    """Create or update the public.users record from the current auth token."""
    return user


@router.patch("/me", response_model=UserRead)
@limiter.limit("10/minute")
async def update_me(
    request: Request,
    body: UserUpdate,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> UserRead:
    """Set or update the authenticated user's username (7-day cooldown after first change)."""
    return user_service.update_username(client, user, body.username)


@router.get("/search", response_model=list[UserSearchResult])
@limiter.limit("60/minute")
def search_users(
    request: Request,
    q: str = Query(..., min_length=1, description="Username search query"),
    limit: int = Query(20, ge=1, le=100),
    client: Client = Depends(get_supabase),
) -> list[UserSearchResult]:
    """Search users by username (case-insensitive substring match)."""
    return user_service.search_users(client, q, limit)


@router.get("/leaderboard", response_model=list[UserSearchResult])
def get_leaderboard(
    limit: int = Query(20, ge=1, le=20),
    client: Client = Depends(get_supabase),
) -> list[UserSearchResult]:
    """Return the top players ordered by ELO descending."""
    return user_service.leaderboard(client, limit)


@router.get("/{user_id}/games", response_model=list[GameSummary])
def get_user_games(
    user_id: UUID,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    client: Client = Depends(get_supabase),
) -> list[GameSummary]:
    """Public: a player's finished games, newest first, from their perspective."""
    return game_service.list_user_games(client, user_id, limit, offset)


@router.get("/{user_id}", response_model=UserProfile)
def get_user(
    user_id: UUID,
    client: Client = Depends(get_supabase),
) -> UserProfile:
    """Fetch a user's public profile including per-time-control stats."""
    return user_service.get_profile(client, user_id)
