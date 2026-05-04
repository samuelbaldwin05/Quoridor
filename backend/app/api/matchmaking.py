from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.core.exceptions import DatabaseError
from app.core.rate_limit import limiter
from app.repositories import challenge_repository
from app.repositories._pg_errors import is_unique_violation
from app.schemas.user import UserRead

router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])

ELO_BAND_BASE = 100  # band at t=0
ELO_BAND_SCALE = 0.5  # coefficient for quadratic growth (50 ELO after 10s)
ELO_BAND_MAX = 2500  # hard cap (~70s to reach)


def _compute_elo_band(joined_at_iso: str) -> int:
    """ELO band grows quadratically — barely widens in the first 10s (~50),
    then accelerates, capping at ELO_BAND_MAX around 70s of waiting."""
    try:
        joined_at = datetime.fromisoformat(joined_at_iso.replace("Z", "+00:00"))
        elapsed = max(0, (datetime.now(UTC) - joined_at).total_seconds())
    except ValueError:
        elapsed = 0
    return min(ELO_BAND_MAX, ELO_BAND_BASE + int(ELO_BAND_SCALE * elapsed**2))


class JoinQueueRequest(BaseModel):
    time_control: int  # 180 | 300 | 600 seconds


class QueueStatus(BaseModel):
    status: str  # "waiting" | "matched" | "not_in_queue"
    matched_game_id: str | None = None
    opponent_name: str | None = None
    opponent_elo: int | None = None
    player_role: int | None = None  # 0 = player1, 1 = player2


def _try_match(
    client: Client,
    user: UserRead,
    time_control: int,
    elo_band: int,
) -> QueueStatus | None:
    """Atomically claim a waiting opponent and create a game.

    Returns a "matched" QueueStatus if an opponent was claimed, None otherwise.
    Backed by public.match_in_queue() — concurrent callers cannot pair with the
    same opponent (FOR UPDATE SKIP LOCKED inside the function).
    """
    # Show the username to the opponent rather than the Google display name.
    visible_name = user.username or user.display_name
    try:
        resp = client.rpc(
            "match_in_queue",
            {
                "p_user_id": str(user.id),
                "p_time_control": time_control,
                "p_user_elo": user.elo,
                "p_elo_band": elo_band,
                "p_display_name": visible_name,
            },
        ).execute()
    except Exception as exc:
        raise DatabaseError("matchmaking rpc failed") from exc

    if not resp.data:
        return None

    row = resp.data[0]
    return QueueStatus(
        status="matched",
        matched_game_id=row["game_id"],
        opponent_name=row["opponent_name"],
        opponent_elo=row["opponent_elo"],
        player_role=row["player_role"],
    )


@router.post("/join", response_model=QueueStatus)
@limiter.limit("30/minute")
def join_queue(
    request: Request,
    body: JoinQueueRequest,
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> QueueStatus:
    """Join the matchmaking queue. Uses the authenticated user's ID as the stable key."""
    player_key = str(user.id)

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
            client.table("matchmaking_queue").delete().eq("player_key", player_key).execute()
        else:
            return QueueStatus(status="waiting")

    entry = {
        "id": str(uuid.uuid4()),
        "player_key": player_key,
        "user_id": str(user.id),
        # Stored as the queue row's `display_name`, but the value is the
        # username when set. The queue table column was named before
        # usernames existed; renaming would be churn for no value.
        "display_name": user.username or user.display_name,
        "time_control": body.time_control,
        "elo": user.elo,
        "status": "waiting",
        "joined_at": datetime.now(UTC).isoformat(),
    }
    try:
        client.table("matchmaking_queue").insert(entry).execute()
    except Exception as exc:
        # React strict-mode dev double-mounts and other client retries can race
        # two /join calls past the existence check. The DB unique constraint on
        # player_key catches it; treat that as idempotent and fall through.
        if not is_unique_violation(exc):
            raise DatabaseError("queue insert failed") from exc

    challenge_repository.cancel_challenges_for_user(client, user.id)

    elo_band = _compute_elo_band(entry["joined_at"])
    matched = _try_match(client, user, body.time_control, elo_band)
    return matched or QueueStatus(status="waiting")


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
        raise DatabaseError("queue status fetch failed") from exc

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

    elo_band = _compute_elo_band(row["joined_at"])
    matched = _try_match(client, user, row["time_control"], elo_band)
    return matched or QueueStatus(status="waiting")


@router.delete("/leave")
def leave_queue(
    user: UserRead = Depends(get_current_user),
    client: Client = Depends(get_supabase),
) -> dict[str, bool]:
    """Remove the authenticated user from the matchmaking queue."""
    try:
        client.table("matchmaking_queue").delete().eq("player_key", str(user.id)).execute()
    except Exception as exc:
        raise DatabaseError("queue leave failed") from exc
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
