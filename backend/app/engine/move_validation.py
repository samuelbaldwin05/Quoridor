"""Move legality + path-to-goal — mirrors frontend/src/engine/moveValidation.ts."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable

from app.engine.constants import BOARD_SIZE
from app.engine.game_types import GameState, PlayerIndex, Position, Wall
from app.engine.wall_utils import (
    is_movement_blocked,
    walls_equal,
    walls_intersect,
    would_wall_post_overlap,
)

_DIRS = (
    Position(-1, 0),
    Position(1, 0),
    Position(0, -1),
    Position(0, 1),
)


def _on_board(p: Position) -> bool:
    return 0 <= p.row < BOARD_SIZE and 0 <= p.col < BOARD_SIZE


def get_valid_pawn_moves(state: GameState, player_index: PlayerIndex) -> list[Position]:
    player = state.players[player_index]
    opponent = state.players[1 - player_index]
    moves: list[Position] = []

    for d in _DIRS:
        new_pos = Position(player.position.row + d.row, player.position.col + d.col)
        if not _on_board(new_pos):
            continue
        if is_movement_blocked(player.position, new_pos, state.walls):
            continue

        if new_pos == opponent.position:
            jump = Position(new_pos.row + d.row, new_pos.col + d.col)
            if (
                _on_board(jump)
                and not is_movement_blocked(new_pos, jump, state.walls)
                and jump != player.position
            ):
                moves.append(jump)
            else:
                # Straight jump blocked — try diagonal jumps perpendicular to dir
                if d.row != 0:
                    diag_dirs = (Position(0, -1), Position(0, 1))
                else:
                    diag_dirs = (Position(-1, 0), Position(1, 0))
                for dd in diag_dirs:
                    diag = Position(new_pos.row + dd.row, new_pos.col + dd.col)
                    if (
                        _on_board(diag)
                        and not is_movement_blocked(new_pos, diag, state.walls)
                        and diag != player.position
                    ):
                        moves.append(diag)
        else:
            moves.append(new_pos)

    return moves


def has_path_to_goal(start: Position, goal_row: int, walls: Iterable[Wall]) -> bool:
    """BFS that respects walls only — opponent positions are not considered blockers."""
    walls_t = tuple(walls)
    visited: set[tuple[int, int]] = {(start.row, start.col)}
    queue: deque[Position] = deque([start])
    while queue:
        cur = queue.popleft()
        if cur.row == goal_row:
            return True
        for d in _DIRS:
            nxt = Position(cur.row + d.row, cur.col + d.col)
            key = (nxt.row, nxt.col)
            if key in visited or not _on_board(nxt):
                continue
            if is_movement_blocked(cur, nxt, walls_t):
                continue
            visited.add(key)
            queue.append(nxt)
    return False


def is_valid_wall_placement(state: GameState, wall: Wall) -> bool:
    if not (0 <= wall.row <= 7 and 0 <= wall.col <= 7):
        return False
    if any(walls_equal(w, wall) for w in state.walls):
        return False
    if would_wall_post_overlap(wall, state.walls):
        return False
    if any(walls_intersect(wall, existing) for existing in state.walls):
        return False
    new_walls = (*state.walls, wall)
    for player in state.players:
        if not has_path_to_goal(player.position, player.goal_row, new_walls):
            return False
    return True
