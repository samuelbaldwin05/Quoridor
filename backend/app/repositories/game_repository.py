from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import DatabaseError


def list_finished_games_for_user(
    client: Client, user_id: UUID, limit: int, offset: int
) -> list[dict]:
    """Finished games the user played (either side), newest first. Raw rows."""
    uid = str(user_id)
    try:
        resp = (
            client.table("games")
            .select("*")
            .or_(f"player1_id.eq.{uid},player2_id.eq.{uid}")
            .eq("status", "finished")
            .order("completed_at", desc=True)
            .range(offset, offset + limit - 1)  # PostgREST range is inclusive
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("games list fetch failed") from exc
    return resp.data or []


def get_game(client: Client, game_id: UUID) -> dict | None:
    """Fetch a single game by id (raw row), or None if it doesn't exist."""
    try:
        resp = client.table("games").select("*").eq("id", str(game_id)).maybe_single().execute()
    except Exception as exc:
        raise DatabaseError("game fetch failed") from exc
    return resp.data if resp is not None else None
