"""Engine types — mirror frontend/src/engine/gameTypes.ts.

All types are immutable dataclasses with frozen=True so engine functions
remain pure (state in → new state out).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Orientation = Literal["h", "v"]
PlayerIndex = Literal[0, 1]
GameStatus = Literal["idle", "playing", "finished"]
MoveKind = Literal["pawn", "wall"]


@dataclass(frozen=True, slots=True)
class Position:
    row: int
    col: int


@dataclass(frozen=True, slots=True)
class Wall:
    row: int
    col: int
    orientation: Orientation


@dataclass(frozen=True, slots=True)
class PlayerState:
    position: Position
    walls_remaining: int
    goal_row: int


@dataclass(frozen=True, slots=True)
class GameState:
    players: tuple[PlayerState, PlayerState]
    walls: tuple[Wall, ...]
    current_player_index: PlayerIndex
    status: GameStatus
    winner: PlayerIndex | None


@dataclass(frozen=True, slots=True)
class PawnMove:
    to: Position
    kind: MoveKind = "pawn"


@dataclass(frozen=True, slots=True)
class WallMove:
    wall: Wall
    kind: MoveKind = "wall"


Move = PawnMove | WallMove


@dataclass(frozen=True, slots=True)
class MoveResult:
    valid: bool
    next_state: GameState
