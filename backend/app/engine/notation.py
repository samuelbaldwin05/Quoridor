"""Algebraic-notation parser/serializer matching the frontend.

Frontend convention (see GameRightPanel.tsx moveNotation):
    col_letter = chr(97 + col)            # 'a'..'i'  (col 0..8)
    rank       = str(9 - row)             # '1'..'9'  (engine row 8..0)
    pawn move:  f"{col}{rank}"            e.g. "e2"
    wall move:  f"{col}{rank}{orient}"    e.g. "e3v"

Walls store engine row in 0..7; notation rank for walls is therefore 2..9.
"""

from __future__ import annotations

import re

from app.engine.game_types import Move, PawnMove, Position, Wall, WallMove

_PAWN_RE = re.compile(r"^([a-i])([1-9])$")
_WALL_RE = re.compile(r"^([a-i])([2-9])([hv])$")


class NotationError(ValueError):
    """Raised when a move-history string can't be parsed."""


def parse_move(text: str) -> Move:
    s = text.strip().lower()
    m = _WALL_RE.match(s)
    if m:
        col_letter, rank_digit, orient = m.groups()
        col = ord(col_letter) - 97
        row = 9 - int(rank_digit)
        return WallMove(wall=Wall(row=row, col=col, orientation=orient))  # type: ignore[arg-type]
    m = _PAWN_RE.match(s)
    if m:
        col_letter, rank_digit = m.groups()
        col = ord(col_letter) - 97
        row = 9 - int(rank_digit)
        return PawnMove(to=Position(row=row, col=col))
    raise NotationError(f"unrecognized move notation: {text!r}")


def serialize_move(move: Move) -> str:
    if isinstance(move, PawnMove):
        return f"{chr(97 + move.to.col)}{9 - move.to.row}"
    return f"{chr(97 + move.wall.col)}{9 - move.wall.row}{move.wall.orientation}"
