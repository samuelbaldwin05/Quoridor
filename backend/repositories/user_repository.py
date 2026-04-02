from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from supabase import Client

from schemas.user import UserRead, UserSearchResult, UserTimeStats


def search_users(
    client: Client, query: str, limit: int = 20
) -> list[UserSearchResult]:
    """Search users by display_name using a case-insensitive ILIKE match."""
    try:
        response = (
            client.table("users")
            .select("id, display_name, elo")
            .ilike("display_name", f"%{query}%")
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error during user search") from exc

    return [UserSearchResult(**row) for row in response.data]


def get_user(client: Client, user_id: UUID) -> UserRead | None:
    """Fetch a single user by primary key. Returns None if not found."""
    try:
        response = (
            client.table("users")
            .select("*")
            .eq("id", str(user_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching user") from exc

    if response.data is None:
        return None
    return UserRead(**response.data)


def get_user_time_stats(client: Client, user_id: UUID) -> list[UserTimeStats]:
    """
    Fetch per-time-control stats for a user from the user_time_stats view/table.

    Expects a table or view named ``user_time_stats`` with columns:
    user_id, time_control, games_played, wins, losses, elo.
    """
    try:
        response = (
            client.table("user_time_stats")
            .select("*")
            .eq("user_id", str(user_id))
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching time stats") from exc

    return [UserTimeStats(**row) for row in response.data]


def get_leaderboard(client: Client, limit: int = 50) -> list[UserSearchResult]:
    """Return the top users ordered by ELO descending."""
    try:
        response = (
            client.table("users")
            .select("id, display_name, elo")
            .order("elo", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching leaderboard") from exc

    return [UserSearchResult(**row) for row in response.data]
