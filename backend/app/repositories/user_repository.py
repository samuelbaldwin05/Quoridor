from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from supabase import Client

from app.core.exceptions import ConflictError, DatabaseError, NotFoundError
from app.repositories._pg_errors import is_unique_violation
from app.schemas.user import UserRead, UserSearchResult, UserTimeStats


def _escape_like(s: str) -> str:
    """Escape LIKE/ILIKE metacharacters so a user's query is matched literally
    (otherwise '%' and '_' leak wildcard semantics and enable pathological scans)."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_users(client: Client, query: str, limit: int = 20) -> list[UserSearchResult]:
    """Search users by username (case-insensitive substring match).

    Excludes users who haven't picked a username yet (username_chosen=false)
    so auto-generated placeholders don't pollute search results.
    """
    try:
        response = (
            client.table("users")
            .select("id, username, elo")
            .ilike("username", f"%{_escape_like(query)}%")
            .eq("username_chosen", True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("user search failed") from exc

    return [UserSearchResult(**row) for row in response.data]


def get_user(client: Client, user_id: UUID) -> UserRead | None:
    """Fetch a single user by primary key. Returns None if not found."""
    try:
        response = client.table("users").select("*").eq("id", str(user_id)).maybe_single().execute()
    except Exception as exc:
        raise DatabaseError("user fetch failed") from exc

    if response.data is None:
        return None
    return UserRead(**response.data)


def get_or_create_user(
    client: Client,
    user_id: UUID,
    email: str,
    display_name: str,
) -> UserRead:
    """SELECT-then-INSERT/UPDATE — avoids `upsert`'s email-conflict footgun.

    Upsert with `on_conflict=id` issues an UPDATE on every existing-user hit,
    which tries to overwrite `email`; PostgREST then rejects with 409 if
    *any* unrelated row holds that email. We never need to change a user's
    email after first creation, so the cleaner path is:
      - exists by id  → UPDATE display_name only (skip email entirely)
      - missing       → INSERT new row
    """
    uid = str(user_id)

    # supabase-py's maybe_single() returns None (not a response object) when
    # the row doesn't exist, so handle that explicitly before touching .data.
    try:
        existing = client.table("users").select("*").eq("id", uid).maybe_single().execute()
    except Exception as exc:
        raise DatabaseError("failed to fetch user") from exc

    existing_data = existing.data if existing is not None else None

    if existing_data:
        # Refresh display name in case Google changed it; never touch email or username.
        try:
            client.table("users").update({"display_name": display_name}).eq("id", uid).execute()
        except Exception:
            pass
        # Heartbeat for cleanup_stale_challenges(). Best-effort.
        try:
            client.table("users").update({"last_seen_at": datetime.now(UTC).isoformat()}).eq(
                "id", uid
            ).execute()
        except Exception:
            pass

        refreshed = client.table("users").select("*").eq("id", uid).maybe_single().execute()
        refreshed_data = refreshed.data if refreshed is not None else None
        return UserRead(**(refreshed_data or existing_data))

    # username is NOT NULL on the table, but we don't know what the user wants
    # yet. Insert a deterministic placeholder; the frontend's UsernameGuard sees
    # username_chosen=false and routes them through /setup to pick a real one.
    placeholder_username = f"player_{uid[:8]}"
    try:
        client.table("users").insert(
            {
                "id": uid,
                "email": email,
                "display_name": display_name,
                "username": placeholder_username,
                "username_chosen": False,
            }
        ).execute()
    except Exception as exc:
        raise DatabaseError("failed to create user") from exc

    result = client.table("users").select("*").eq("id", uid).maybe_single().execute()
    result_data = result.data if result is not None else None
    if not result_data:
        raise DatabaseError("user not found after insert")
    return UserRead(**result_data)


def update_username(client: Client, user_id: UUID, username: str) -> UserRead:
    """Set or update a user's chosen username; flips username_chosen to true."""
    try:
        resp = (
            client.table("users")
            .update(
                {
                    "username": username,
                    "username_chosen": True,
                    "username_updated_at": datetime.now(UTC).isoformat(),
                }
            )
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
            .select("user_id, time_control, games_played, wins, losses")
            .eq("user_id", str(user_id))
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("time stats fetch failed") from exc

    return [UserTimeStats(**row) for row in response.data]


def get_leaderboard(client: Client, limit: int = 20) -> list[UserSearchResult]:
    """Return the top users by ELO. Hides users who haven't picked a username."""
    try:
        response = (
            client.table("users")
            .select("id, username, elo")
            .eq("username_chosen", True)
            .gt("games_played", 0)
            .order("elo", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("leaderboard fetch failed") from exc

    return [UserSearchResult(**row) for row in response.data]
