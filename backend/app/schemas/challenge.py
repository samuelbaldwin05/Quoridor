from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.game import TimeControl


class ChallengeCreate(BaseModel):
    challenged_id: UUID
    time_control: TimeControl = 300


class ChallengeRead(BaseModel):
    id: UUID
    challenger_id: UUID
    challenged_id: UUID
    challenger_name: str | None = None
    challenged_name: str | None = None
    challenger_elo: int | None = None
    challenged_elo: int | None = None
    time_control: int
    status: str
    game_id: UUID | None = None
    created_at: datetime
