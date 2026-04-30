from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ChallengeCreate(BaseModel):
    challenged_id: UUID
    time_control: int = 300


class ChallengeRead(BaseModel):
    id: UUID
    challenger_id: UUID
    challenged_id: UUID
    challenger_name: str | None = None
    challenged_name: str | None = None
    time_control: int
    status: str
    game_id: UUID | None = None
    created_at: datetime
