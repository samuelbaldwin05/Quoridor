from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.core.rate_limit import limiter
from app.repositories import user_repository
from app.schemas.user import UserProfile, UserRead, UserSearchResult, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/sync", response_model=UserRead)
async def sync_user(user: UserRead = Depends(get_current_user)) -> UserRead:
    """Create or update the public.users record from the current auth token."""
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(
    body: UserUpdate,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> UserRead:
    """Set or update the authenticated user's username."""
    username = body.username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters")
    if len(username) > 24:
        raise HTTPException(status_code=422, detail="Username must be 24 characters or fewer")
    return user_repository.update_username(client, user.id, username)


@router.get("/search", response_model=list[UserSearchResult])
@limiter.limit("60/minute")
def search_users(
    request: Request,
    q: str = Query(..., min_length=1, description="Username search query"),
    limit: int = Query(20, ge=1, le=100),
    client: Client = Depends(get_supabase),
) -> list[UserSearchResult]:
    """Search users by username (case-insensitive substring match)."""
    return user_repository.search_users(client, q, limit)


@router.get("/leaderboard", response_model=list[UserSearchResult])
def get_leaderboard(
    limit: int = Query(5, ge=1, le=200),
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
        username=user.username,
        elo=user.elo,
        games_played=user.games_played,
        created_at=user.created_at,
        time_stats=time_stats,
    )
