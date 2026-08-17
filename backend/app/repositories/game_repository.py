from __future__ import annotations

import logging
from uuid import UUID

from supabase import Client

from app.core.exceptions import ConflictError, DatabaseError
from app.repositories._pg_errors import is_unique_violation

logger = logging.getLogger(__name__)


def cleanup_abandoned_games(client: Client, idle_hours: int) -> None:
    """Retire games both players walked away from (migration 022). Best-effort: it is
    housekeeping riding on somebody else's request, and a failure only means the rows
    stay for the next sweep."""
    try:
        client.rpc("cleanup_abandoned_games", {"p_idle_hours": idle_hours}).execute()
    except Exception:
        logger.debug("abandoned game cleanup failed", exc_info=True)


def _attach_current_names(client: Client, rows: list[dict]) -> list[dict]:
    """Overwrite each row's player1_name/player2_name with the players' CURRENT username.

    The names snapshotted onto the game row at creation go stale when a player later
    changes their username. Resolving them from users at read time keeps history in sync.
    Best-effort: if the lookup fails, the stored snapshot is left in place rather than
    breaking the history view.
    """
    ids = {row[key] for row in rows for key in ("player1_id", "player2_id") if row.get(key)}
    if not ids:
        return rows
    try:
        resp = client.table("users").select("id, username").in_("id", list(ids)).execute()
    except Exception:
        return rows
    name_by_id = {u["id"]: u.get("username") for u in (resp.data or [])}
    for row in rows:
        p1, p2 = row.get("player1_id"), row.get("player2_id")
        if p1 and name_by_id.get(p1):
            row["player1_name"] = name_by_id[p1]
        if p2 and name_by_id.get(p2):
            row["player2_name"] = name_by_id[p2]
    return rows


def list_finished_games_for_user(
    client: Client, user_id: UUID, limit: int, offset: int
) -> list[dict]:
    """Finished games the user played against another player, newest first. Raw rows.

    Excludes vs_ai (single-player bot) games: those are persisted for history/analysis
    only and must not surface in the public ranked-history list, which shows Elo deltas
    and an opponent. Opponent/player names are resolved to their CURRENT username at read
    time (see _attach_current_names) so a later username change is reflected in history.
    """
    uid = str(user_id)
    try:
        resp = (
            client.table("games")
            .select("*")
            .or_(f"player1_id.eq.{uid},player2_id.eq.{uid}")
            .eq("status", "finished")
            .neq("mode", "vs_ai")
            .order("completed_at", desc=True)
            .range(offset, offset + limit - 1)  # PostgREST range is inclusive
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("games list fetch failed") from exc
    return _attach_current_names(client, resp.data or [])


def get_bot_game_by_client_id(client: Client, player1_id: UUID, client_game_id: str) -> dict | None:
    """A player's already-recorded bot game for this client id, or None. Raw row."""
    try:
        resp = (
            client.table("games")
            .select("*")
            .eq("player1_id", str(player1_id))
            .eq("client_game_id", client_game_id)
            .eq("mode", "vs_ai")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("bot game lookup failed") from exc
    return resp.data[0] if resp.data else None


def insert_bot_game(client: Client, payload: dict) -> dict:
    """Insert a completed bot game row and return it. Raises ConflictError on a
    duplicate (player1_id, client_game_id) so the service can treat it as idempotent."""
    try:
        resp = client.table("games").insert(payload).execute()
    except Exception as exc:
        if is_unique_violation(exc):
            raise ConflictError("bot game already recorded") from exc
        raise DatabaseError("bot game insert failed") from exc
    if not resp.data:
        raise DatabaseError("bot game insert returned no data")
    return resp.data[0]


def get_game(client: Client, game_id: UUID) -> dict | None:
    """Fetch a single game by id (raw row), or None if it doesn't exist.

    Player names are resolved to their CURRENT username at read time so a replay never
    shows a stale name after a player renames (see _attach_current_names)."""
    try:
        resp = client.table("games").select("*").eq("id", str(game_id)).maybe_single().execute()
    except Exception as exc:
        raise DatabaseError("game fetch failed") from exc
    if resp is None or resp.data is None:
        return None
    return _attach_current_names(client, [resp.data])[0]
