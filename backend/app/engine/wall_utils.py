"""Wall geometry helpers — mirrors frontend/src/engine/wallUtils.ts."""

from __future__ import annotations

from collections.abc import Iterable

from app.engine.game_types import Position, Wall


def walls_equal(a: Wall, b: Wall) -> bool:
    return a.row == b.row and a.col == b.col and a.orientation == b.orientation


def wall_blocks_movement(wall: Wall, from_pos: Position, to_pos: Position) -> bool:
    """Port of Fence.blocksMovement.

    Horizontal fence ('h') blocks vertical movement (same column).
    Vertical fence   ('v') blocks horizontal movement (same row).
    """
    if wall.orientation == "h":
        if from_pos.col == to_pos.col:
            min_row = min(from_pos.row, to_pos.row)
            max_row = max(from_pos.row, to_pos.row)
            return (
                wall.row >= min_row
                and wall.row < max_row
                and from_pos.col >= wall.col
                and from_pos.col <= wall.col + 1
            )
    else:
        if from_pos.row == to_pos.row:
            min_col = min(from_pos.col, to_pos.col)
            max_col = max(from_pos.col, to_pos.col)
            return (
                wall.col >= min_col
                and wall.col < max_col
                and from_pos.row >= wall.row
                and from_pos.row <= wall.row + 1
            )
    return False


def is_movement_blocked(from_pos: Position, to_pos: Position, walls: Iterable[Wall]) -> bool:
    return any(wall_blocks_movement(w, from_pos, to_pos) for w in walls)


def would_wall_post_overlap(candidate: Wall, existing: Iterable[Wall]) -> bool:
    new_post = (candidate.row * 2 + 1, candidate.col * 2 + 1)
    for w in existing:
        if (w.row * 2 + 1, w.col * 2 + 1) == new_post:
            return True
    return False


def walls_intersect(a: Wall, b: Wall) -> bool:
    if a.orientation != b.orientation:
        return False
    if a.orientation == "h":
        return a.row == b.row and not (a.col + 1 < b.col or b.col + 1 < a.col)
    return a.col == b.col and not (a.row + 1 < b.row or b.row + 1 < a.row)
