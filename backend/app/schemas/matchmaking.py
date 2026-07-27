from __future__ import annotations

from pydantic import BaseModel

from app.schemas.game import TimeControl


class JoinQueueRequest(BaseModel):
    time_control: TimeControl


class QueueStatus(BaseModel):
    status: str  # "waiting" | "matched" | "not_in_queue"
    matched_game_id: str | None = None
    opponent_name: str | None = None
    opponent_elo: int | None = None
    player_role: int | None = None  # 0 = player1, 1 = player2
