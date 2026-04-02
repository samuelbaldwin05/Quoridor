from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from core.dependencies import get_supabase
from repositories import user_repository
from schemas.user import UserProfile, UserSearchResult

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search", response_model=list[UserSearchResult])
def search_users(
    q: str = Query(..., min_length=1, description="Display name search query"),
    limit: int = Query(20, ge=1, le=100),
    client: Client = Depends(get_supabase),
) -> list[UserSearchResult]:
    """Search users by display name (case-insensitive substring match)."""
    return user_repository.search_users(client, q, limit)


@router.get("/leaderboard", response_model=list[UserSearchResult])
def get_leaderboard(
    limit: int = Query(50, ge=1, le=200),
    client: Client = Depends(get_supabase),
) -> list[UserSearchResult]:
    """Return the top players ordered by ELO descending."""
    return user_repository.get_leaderboard(client, limit)


@router.get("/{user_id}", response_model=UserProfile)
def get_user(
    user_id: UUID,
    client: Client = Depends(get_supabase),
) -> UserProfile:
    """Fetch a user's public profile including per-time-control stats."""
    user = user_repository.get_user(client, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    time_stats = user_repository.get_user_time_stats(client, user_id)

    return UserProfile(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        elo=user.elo,
        games_played=user.games_played,
        created_at=user.created_at,
        time_stats=time_stats,
    )
