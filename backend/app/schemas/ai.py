from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PositionPayload(BaseModel):
    row: int = Field(ge=0, le=8)
    col: int = Field(ge=0, le=8)


class WallPayload(BaseModel):
    row: int = Field(ge=0, le=7)
    col: int = Field(ge=0, le=7)
    orientation: Literal["h", "v"]


class PlayerStatePayload(BaseModel):
    position: PositionPayload
    walls_remaining: int = Field(ge=0, le=10)
    goal_row: Literal[0, 8]


class GameStatePayload(BaseModel):
    """Raw state submitted by the client. Validated and converted before
    handing to the engine."""

    players: tuple[PlayerStatePayload, PlayerStatePayload]
    walls: list[WallPayload] = Field(default_factory=list, max_length=20)
    current_player_index: Literal[0, 1]


class MovePayload(BaseModel):
    kind: Literal["pawn", "wall"]
    to: PositionPayload | None = None
    wall: WallPayload | None = None


AIEngine = Literal["extreme", "mcts"]


class AIMoveRequest(BaseModel):
    state: GameStatePayload
    # Which opponent to ask. "extreme" is the trained PPO model, "mcts" the C++ search.
    engine: AIEngine = "extreme"
    # Ignored by both engines today. The PPO model is a single forward pass, and the MCTS
    # agent budgets in iterations rather than time (see app/ai/mcts_agent.py). Kept so an
    # older client that still sends it does not get a 422.
    time_budget_s: float = Field(default=1.0, ge=0.1, le=15.0)


class SearchStatsPayload(BaseModel):
    """What the search actually did. Shown in the client's dev stats panel."""

    iterations: int
    elapsed_ms: int
    target_iterations: int
    threads: int
    cached: bool
    engine_commit: str


class AIMoveResponse(BaseModel):
    move: MovePayload
    stats: SearchStatsPayload | None = None


class EngineStatusResponse(BaseModel):
    """Advertised capability, so the client does not have to discover a missing engine by
    getting a 503 mid-game."""

    mcts_available: bool
    engine_commit: str
