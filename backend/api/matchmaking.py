from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from core.dependencies import get_supabase

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

ELO_BAND = 200  # maximum ELO difference for a match


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class JoinQueueRequest(BaseModel):
    user_id: str        # guest-xxx or real UUID string (player_key)
    display_name: str
    time_control: int   # 180 | 300 | 600 seconds
    elo: int


class QueueStatus(BaseModel):
    status: str  # "waiting" | "matched" | "not_in_queue"
    matched_game_id: str | None = None
    opponent_name: str | None = None
    opponent_elo: int | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_status(row: dict) -> QueueStatus:
    if row.get("matched_game_id"):
        return QueueStatus(
            status="matched",
            matched_game_id=row["matched_game_id"],
            opponent_name=row.get("opponent_name"),
            opponent_elo=row.get("opponent_elo"),
        )
    return QueueStatus(status="waiting")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/join", response_model=QueueStatus)
def join_queue(
    body: JoinQueueRequest,
    client: Client = Depends(get_supabase),
) -> QueueStatus:
    """
    Join the matchmaking queue (or check if already matched).

    Uses ``player_key`` (= body.user_id) as the stable identity so that
    unauthenticated guest sessions work before real auth is wired up.
    """
    player_key = body.user_id

    # Check if already in queue (re-join or re-poll after page refresh)
    existing = (
        client.table("matchmaking_queue")
        .select("*")
        .eq("player_key", player_key)
        .maybe_single()
        .execute()
    )
    if existing.data:
        return _row_to_status(existing.data)

    # Insert new queue entry
    entry = {
        "id": str(uuid.uuid4()),
        "player_key": player_key,
        "display_name": body.display_name,
        "time_control": body.time_control,
        "elo": body.elo,
        "status": "waiting",
        "joined_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        client.table("matchmaking_queue").insert(entry).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to join queue") from exc

    # Look for a compatible waiting opponent
    try:
        result = (
            client.table("matchmaking_queue")
            .select("*")
            .eq("time_control", body.time_control)
            .eq("status", "waiting")
            .neq("player_key", player_key)
            .gte("elo", body.elo - ELO_BAND)
            .lte("elo", body.elo + ELO_BAND)
            .order("joined_at")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to search queue") from exc

    if not result.data:
        return QueueStatus(status="waiting")

    opponent = result.data[0]
    game_id = str(uuid.uuid4())

    # Create game record
    try:
        client.table("games").insert(
            {
                "id": game_id,
                "mode": "ranked",
                "status": "playing",
                "time_control": body.time_control,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create game") from exc

    # Mark both entries as matched
    try:
        client.table("matchmaking_queue").update(
            {
                "status": "matched",
                "matched_game_id": game_id,
                "opponent_name": opponent["display_name"],
                "opponent_elo": opponent["elo"],
            }
        ).eq("player_key", player_key).execute()

        client.table("matchmaking_queue").update(
            {
                "status": "matched",
                "matched_game_id": game_id,
                "opponent_name": body.display_name,
                "opponent_elo": body.elo,
            }
        ).eq("player_key", opponent["player_key"]).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to finalize match") from exc

    return QueueStatus(
        status="matched",
        matched_game_id=game_id,
        opponent_name=opponent["display_name"],
        opponent_elo=opponent["elo"],
    )


@router.get("/status/{player_key}", response_model=QueueStatus)
def queue_status(
    player_key: str,
    client: Client = Depends(get_supabase),
) -> QueueStatus:
    """Poll matchmaking status for a player."""
    try:
        resp = (
            client.table("matchmaking_queue")
            .select("*")
            .eq("player_key", player_key)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch status") from exc

    if resp.data is None:
        return QueueStatus(status="not_in_queue")

    return _row_to_status(resp.data)


@router.delete("/leave/{player_key}")
def leave_queue(
    player_key: str,
    client: Client = Depends(get_supabase),
) -> dict[str, bool]:
    """Remove a player from the queue."""
    try:
        client.table("matchmaking_queue").delete().eq("player_key", player_key).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to leave queue") from exc

    return {"ok": True}
