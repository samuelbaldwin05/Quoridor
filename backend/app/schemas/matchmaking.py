from __future__ import annotations

from pydantic import BaseModel

from app.schemas.game import TimeControl


class JoinQueueRequest(BaseModel):
    time_control: TimeControl


class QueueStatus(BaseModel):
    # "expired" is the search cap running out (nobody turned up), as distinct from
    # "not_in_queue", which is a caller who never joined or already cancelled.
    status: str  # "waiting" | "matched" | "not_in_queue" | "expired"
    matched_game_id: str | None = None
    opponent_name: str | None = None
    opponent_elo: int | None = None
    player_role: int | None = None  # 0 = player1, 1 = player2
    # Seconds of search left before the cap, on a "waiting" response. The client shows the
    # give-up message when this runs out instead of defining its own deadline, so the cap
    # lives in exactly one place (matchmaking_service.QUEUE_MAX_WAIT_SECONDS). Relative,
    # not absolute, so client clock skew cannot shift it.
    expires_in_seconds: int | None = None
