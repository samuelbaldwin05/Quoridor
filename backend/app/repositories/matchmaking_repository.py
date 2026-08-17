from __future__ import annotations

import logging
from datetime import UTC, datetime

from supabase import Client

from app.core.exceptions import DatabaseError
from app.repositories._pg_errors import is_unique_violation

logger = logging.getLogger(__name__)


def get_queue_entry(client: Client, player_key: str) -> dict | None:
    """Return the caller's queue row, or None if they're not queued."""
    try:
        resp = (
            client.table("matchmaking_queue")
            .select("*")
            .eq("player_key", player_key)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("queue status fetch failed") from exc
    return resp.data[0] if resp.data else None


def insert_queue_entry(client: Client, entry: dict) -> bool:
    """Insert a queue row. Returns False on a unique-violation race (treated as
    idempotent by the service), True otherwise."""
    try:
        client.table("matchmaking_queue").insert(entry).execute()
    except Exception as exc:
        if is_unique_violation(exc):
            return False
        raise DatabaseError("queue insert failed") from exc
    return True


def touch_queue_entry(client: Client, player_key: str, restart_wait: bool = False) -> None:
    """Refresh a waiting row's heartbeat so the sweep leaves it alone. `restart_wait`
    also resets joined_at, which restarts both the search cap and the ELO band widening
    for a player starting a new search. Best-effort: a missed heartbeat only risks an
    early sweep, and failing the poll it rides on would be worse."""
    patch: dict[str, str] = {"last_polled_at": datetime.now(UTC).isoformat()}
    if restart_wait:
        patch["joined_at"] = patch["last_polled_at"]
    try:
        client.table("matchmaking_queue").update(patch).eq("player_key", player_key).execute()
    except Exception:
        logger.debug("queue heartbeat failed for %s", player_key, exc_info=True)


def cleanup_stale_entries(client: Client, idle_seconds: int, max_wait_seconds: int) -> None:
    """Drop waiting rows whose client stopped polling or that outstayed the search cap,
    so nobody is matched into a game the opponent already walked away from. Best-effort
    for the same reason the challenge cleanup is: it is housekeeping on someone else's
    request."""
    try:
        client.rpc(
            "cleanup_stale_queue_entries",
            {"p_idle_seconds": idle_seconds, "p_max_wait_seconds": max_wait_seconds},
        ).execute()
    except Exception:
        logger.debug("queue cleanup failed", exc_info=True)


def delete_queue_entry(client: Client, player_key: str) -> None:
    try:
        client.table("matchmaking_queue").delete().eq("player_key", player_key).execute()
    except Exception as exc:
        raise DatabaseError("queue leave failed") from exc


def match_in_queue(
    client: Client,
    user_id: str,
    time_control: int,
    user_elo: int,
    elo_band: int,
    display_name: str,
) -> dict | None:
    """Atomically claim a waiting opponent + create the game (public.match_in_queue
    RPC). Returns the match row, or None if no opponent was claimed."""
    try:
        resp = client.rpc(
            "match_in_queue",
            {
                "p_user_id": user_id,
                "p_time_control": time_control,
                "p_user_elo": user_elo,
                "p_elo_band": elo_band,
                "p_display_name": display_name,
            },
        ).execute()
    except Exception as exc:
        raise DatabaseError("matchmaking rpc failed") from exc
    return resp.data[0] if resp.data else None


def get_player1_id(client: Client, game_id: str) -> str | None:
    """Return a game's player1_id, or None if the game doesn't exist."""
    resp = client.table("games").select("player1_id").eq("id", game_id).limit(1).execute()
    return resp.data[0].get("player1_id") if resp.data else None
