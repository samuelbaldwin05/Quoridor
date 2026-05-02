from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import ConflictError, DatabaseError, NotFoundError
from app.repositories._pg_errors import is_unique_violation
from app.schemas.user import UserRead, UserSearchResult, UserTimeStats


def search_users(client: Client, query: str, limit: int = 20) -> list[UserSearchResult]:
    """Search users by username (case-insensitive substring match)."""
    try:
        response = (
            client.table("users")
            .select("id, display_name, username, elo")
            .ilike("username", f"%{query}%")
            .not_.is_("username", "null")
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("user search failed") from exc

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
        raise DatabaseError("user fetch failed") from exc

    if response.data is None:
        return None
    return UserRead(**response.data)


def update_username(client: Client, user_id: UUID, username: str) -> UserRead:
    """Set or update a user's chosen username."""
    try:
        resp = (
            client.table("users")
            .update({"username": username})
            .eq("id", str(user_id))
            .execute()
        )
    except Exception as exc:
        if is_unique_violation(exc):
            raise ConflictError("username already taken") from exc
        raise DatabaseError("username update failed") from exc

    if not resp.data:
        raise NotFoundError("user not found")
    return UserRead(**resp.data[0])


def get_user_time_stats(client: Client, user_id: UUID) -> list[UserTimeStats]:
    """Fetch per-time-control stats for a user."""
    try:
        response = (
            client.table("user_time_stats")
            .select("*")
            .eq("user_id", str(user_id))
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("time stats fetch failed") from exc

    return [UserTimeStats(**row) for row in response.data]


def get_leaderboard(client: Client, limit: int = 50) -> list[UserSearchResult]:
    """Return the top users ordered by ELO descending."""
    try:
        response = (
            client.table("users")
            .select("id, display_name, username, elo")
            .order("elo", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("leaderboard fetch failed") from exc

    return [UserSearchResult(**row) for row in response.data]
