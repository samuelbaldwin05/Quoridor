from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from supabase import Client

from app.repositories import challenge_repository, matchmaking_repository
from app.schemas.matchmaking import QueueStatus
from app.schemas.user import UserRead

logger = logging.getLogger(__name__)

# Band widths are in rating units, so they scale with the rating system (see
# elo_service.ELO_DIVISOR) — these are double their pre-rescale values.
ELO_BAND_BASE = 200  # band at t=0
ELO_BAND_SCALE = 1.0  # coefficient for quadratic growth (100 ELO after 10s)
ELO_BAND_MAX = 5000  # hard cap (~70s to reach)


def _compute_elo_band(joined_at_iso: str) -> int:
    """ELO band grows quadratically — barely widens in the first 10s (~100),
    then accelerates, capping at ELO_BAND_MAX around 70s of waiting."""
    try:
        joined_at = datetime.fromisoformat(joined_at_iso.replace("Z", "+00:00"))
        elapsed = max(0, (datetime.now(UTC) - joined_at).total_seconds())
    except ValueError:
        elapsed = 0
    return min(ELO_BAND_MAX, ELO_BAND_BASE + int(ELO_BAND_SCALE * elapsed**2))


def _try_match(
    client: Client, user: UserRead, time_control: int, elo_band: int
) -> QueueStatus | None:
    """Claim a waiting opponent (if any) and return a "matched" status."""
    row = matchmaking_repository.match_in_queue(
        client, str(user.id), time_control, user.elo, elo_band, user.username
    )
    if not row:
        return None
    return QueueStatus(
        status="matched",
        matched_game_id=row["game_id"],
        opponent_name=row["opponent_name"],
        opponent_elo=row["opponent_elo"],
        player_role=row["player_role"],
    )


def _resolve_player_role(client: Client, game_id: str, player_key: str) -> int:
    """0 if the caller is player1, 1 if player2. Best-effort: defaults to 0 on
    failure / game-not-found, but logs it rather than failing silently."""
    try:
        player1_id = matchmaking_repository.get_player1_id(client, game_id)
    except Exception:
        logger.exception("failed to resolve player role for game %s", game_id)
        return 0
    if player1_id is None:
        logger.warning("game %s not found while resolving player role", game_id)
        return 0
    return 0 if player1_id == player_key else 1


def join_queue(client: Client, user: UserRead, time_control: int) -> QueueStatus:
    """Join the matchmaking queue, then attempt an immediate match."""
    player_key = str(user.id)

    existing = matchmaking_repository.get_queue_entry(client, player_key)
    if existing:
        if existing.get("matched_game_id"):
            matchmaking_repository.delete_queue_entry(client, player_key)
        else:
            return QueueStatus(status="waiting")

    entry = {
        "id": str(uuid.uuid4()),
        "player_key": player_key,
        "user_id": str(user.id),
        # The queue column is historically named `display_name` but stores
        # whatever the player wants opponents to see — i.e., their username.
        "display_name": user.username,
        "time_control": time_control,
        "elo": user.elo,
        "status": "waiting",
        "joined_at": datetime.now(UTC).isoformat(),
    }
    # A unique-violation race (StrictMode double-mount / retry) is treated as
    # idempotent — fall through to matching.
    matchmaking_repository.insert_queue_entry(client, entry)
    challenge_repository.cancel_challenges_for_user(client, user.id)

    elo_band = _compute_elo_band(entry["joined_at"])
    matched = _try_match(client, user, time_control, elo_band)
    return matched or QueueStatus(status="waiting")


def queue_status(client: Client, user: UserRead) -> QueueStatus:
    """Poll matchmaking status. While waiting, retry a match with the widened band."""
    player_key = str(user.id)
    row = matchmaking_repository.get_queue_entry(client, player_key)
    if row is None:
        return QueueStatus(status="not_in_queue")

    if row.get("matched_game_id"):
        role = _resolve_player_role(client, row["matched_game_id"], player_key)
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


def leave_queue(client: Client, user: UserRead) -> None:
    matchmaking_repository.delete_queue_entry(client, str(user.id))
