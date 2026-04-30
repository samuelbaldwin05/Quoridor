from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.repositories import challenge_repository
from app.schemas.user import UserRead

router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])

ELO_BAND_BASE = 100     # band at t=0
ELO_BAND_SCALE = 0.5   # coefficient for quadratic growth (50 ELO after 10s)
ELO_BAND_MAX = 2500    # hard cap (~70s to reach)


def _compute_elo_band(joined_at_iso: str) -> int:
    """ELO band grows quadratically — barely widens in the first 10s (~50),
    then accelerates, capping at ELO_BAND_MAX around 70s of waiting."""
    try:
        joined_at = datetime.fromisoformat(joined_at_iso.replace("Z", "+00:00"))
        elapsed = max(0, (datetime.now(UTC) - joined_at).total_seconds())
    except ValueError:
        elapsed = 0
    return min(ELO_BAND_MAX, ELO_BAND_BASE + int(ELO_BAND_SCALE * elapsed ** 2))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class JoinQueueRequest(BaseModel):
    time_control: int   # 180 | 300 | 600 seconds


class QueueStatus(BaseModel):
    status: str                    # "waiting" | "matched" | "not_in_queue"
    matched_game_id: str | None = None
    opponent_name: str | None = None
    opponent_elo: int | None = None
    player_role: int | None = None  # 0 = player1, 1 = player2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_game(
    client: Client, time_control: int,
    p1_id: str, p2_id: str, p1_name: str, p2_name: str,
) -> str:
    game_id = str(uuid.uuid4())
    try:
        client.table("games").insert({
            "id": game_id,
            "mode": "ranked",
            "status": "playing",
            "time_control": time_control,
            "player1_id": p1_id,
            "player2_id": p2_id,
            "player1_name": p1_name,
            "player2_name": p2_name,
            "created_at": datetime.now(UTC).isoformat(),
        }).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create game") from exc
    return game_id


def _mark_matched(
    client: Client, player_key: str, game_id: str, opponent_name: str, opponent_elo: int,
) -> None:
    client.table("matchmaking_queue").update({
        "status": "matched",
        "matched_game_id": game_id,
        "opponent_name": opponent_name,
        "opponent_elo": opponent_elo,
    }).eq("player_key", player_key).execute()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/join", response_model=QueueStatus)
def join_queue(
    body: JoinQueueRequest,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> QueueStatus:
    """Join the matchmaking queue. Uses the authenticated user's ID as the stable key."""
    player_key = str(user.id)

    # Already in queue — clear stale matched entry, return status for still-waiting entry
    existing = (
        client.table("matchmaking_queue")
        .select("*")
        .eq("player_key", player_key)
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        if row.get("matched_game_id"):
            # Stale matched entry from a previous game — delete it and proceed to fresh join
            client.table("matchmaking_queue").delete().eq("player_key", player_key).execute()
        else:
            return QueueStatus(status="waiting")

    # Insert new queue entry
    entry = {
        "id": str(uuid.uuid4()),
        "player_key": player_key,
        "user_id": str(user.id),
        "display_name": user.display_name,
        "time_control": body.time_control,
        "elo": user.elo,
        "status": "waiting",
        "joined_at": datetime.now(UTC).isoformat(),
    }
    try:
        client.table("matchmaking_queue").insert(entry).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to join queue") from exc

    # Cancel any outgoing challenges — player is now in queue
    challenge_repository.cancel_challenges_for_user(client, user.id)

    # Look for a compatible waiting opponent
    elo_band = _compute_elo_band(entry["joined_at"])
    try:
        result = (
            client.table("matchmaking_queue")
            .select("*")
            .eq("time_control", body.time_control)
            .eq("status", "waiting")
            .neq("player_key", player_key)
            .gte("elo", user.elo - elo_band)
            .lte("elo", user.elo + elo_band)
            .order("joined_at")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to search queue") from exc

    if not result.data:
        return QueueStatus(status="waiting")

    opponent = result.data[0]
    me = {
        "user_id": str(user.id), "display_name": user.display_name,
        "player_key": player_key, "elo": user.elo,
    }
    p1, p2 = random.sample([opponent, me], 2)
    my_role = 0 if p1["player_key"] == player_key else 1

    game_id = _create_game(
        client, body.time_control,
        p1_id=p1["user_id"], p2_id=p2["user_id"],
        p1_name=p1["display_name"], p2_name=p2["display_name"],
    )

    try:
        _mark_matched(client, opponent["player_key"], game_id, user.display_name, user.elo)
        _mark_matched(client, player_key, game_id, opponent["display_name"], opponent["elo"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to finalize match") from exc

    return QueueStatus(
        status="matched",
        matched_game_id=game_id,
        opponent_name=opponent["display_name"],
        opponent_elo=opponent["elo"],
        player_role=my_role,
    )


@router.get("/status", response_model=QueueStatus)
def queue_status(
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> QueueStatus:
    """Poll matchmaking status. While waiting, also attempts a match with the expanded ELO band."""
    player_key = str(user.id)

    try:
        resp = (
            client.table("matchmaking_queue")
            .select("*")
            .eq("player_key", player_key)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch status") from exc

    if not resp.data:
        return QueueStatus(status="not_in_queue")

    row = resp.data[0]
    if row.get("matched_game_id"):
        role = _get_player_role(client, row["matched_game_id"], player_key)
        return QueueStatus(
            status="matched",
            matched_game_id=row["matched_game_id"],
            opponent_name=row.get("opponent_name"),
            opponent_elo=row.get("opponent_elo"),
            player_role=role,
        )

    # Still waiting — try to find an opponent with the expanded band
    elo_band = _compute_elo_band(row["joined_at"])
    try:
        result = (
            client.table("matchmaking_queue")
            .select("*")
            .eq("time_control", row["time_control"])
            .eq("status", "waiting")
            .neq("player_key", player_key)
            .gte("elo", row["elo"] - elo_band)
            .lte("elo", row["elo"] + elo_band)
            .order("joined_at")
            .limit(1)
            .execute()
        )
    except Exception:
        return QueueStatus(status="waiting")

    if not result.data:
        return QueueStatus(status="waiting")

    opponent = result.data[0]
    me = {
        "user_id": row["user_id"], "display_name": row["display_name"],
        "player_key": player_key, "elo": row["elo"],
    }
    p1, p2 = random.sample([opponent, me], 2)
    my_role = 0 if p1["player_key"] == player_key else 1

    game_id = _create_game(
        client, row["time_control"],
        p1_id=p1["user_id"], p2_id=p2["user_id"],
        p1_name=p1["display_name"], p2_name=p2["display_name"],
    )

    try:
        _mark_matched(client, player_key, game_id, opponent["display_name"], opponent["elo"])
        _mark_matched(client, opponent["player_key"], game_id, row["display_name"], row["elo"])
    except Exception:
        return QueueStatus(status="waiting")

    return QueueStatus(
        status="matched",
        matched_game_id=game_id,
        opponent_name=opponent["display_name"],
        opponent_elo=opponent["elo"],
        player_role=my_role,
    )


@router.delete("/leave")
def leave_queue(
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> dict[str, bool]:
    """Remove the authenticated user from the matchmaking queue."""
    try:
        client.table("matchmaking_queue").delete().eq("player_key", str(user.id)).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to leave queue") from exc
    return {"ok": True}


def _get_player_role(client: Client, game_id: str, player_key: str) -> int:
    """Returns 0 if the user is player1, 1 if player2."""
    try:
        resp = client.table("games").select("player1_id").eq("id", game_id).limit(1).execute()
        if resp.data:
            return 0 if resp.data[0].get("player1_id") == player_key else 1
    except Exception:
        pass
    return 0
