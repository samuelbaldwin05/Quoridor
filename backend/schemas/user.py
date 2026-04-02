from __future__ import annotations

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, computed_field


class UserTimeStats(BaseModel):
    user_id: UUID
    time_control: int
    games_played: int
    wins: int
    losses: int
    elo: int

    @computed_field
    @property
    def win_pct(self) -> float:
        if self.games_played == 0:
            return 0.0
        return round(self.wins / self.games_played, 4)


class UserRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    elo: int
    games_played: int
    created_at: datetime


class UserProfile(BaseModel):
    id: UUID
    email: str
    display_name: str
    elo: int
    games_played: int
    created_at: datetime
    time_stats: list[UserTimeStats]


class UserUpdate(BaseModel):
    display_name: str | None = None


class UserSearchResult(BaseModel):
    id: UUID
    display_name: str
    elo: int
