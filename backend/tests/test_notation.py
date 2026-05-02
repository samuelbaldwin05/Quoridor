"""Notation parser/serializer tests."""
from __future__ import annotations

import pytest

from app.engine import (
    NotationError,
    PawnMove,
    Position,
    Wall,
    WallMove,
    parse_move,
    serialize_move,
)


@pytest.mark.parametrize(
    "text, row, col",
    [
        ("e1", 8, 4),  # p0 start
        ("e9", 0, 4),  # p1 start
        ("a1", 8, 0),
        ("i9", 0, 8),
        ("e2", 7, 4),
    ],
)
def test_parse_pawn(text: str, row: int, col: int) -> None:
    move = parse_move(text)
    assert isinstance(move, PawnMove)
    assert move.to == Position(row=row, col=col)


@pytest.mark.parametrize(
    "text, row, col, orient",
    [
        ("e7h", 2, 4, "h"),
        ("e3v", 6, 4, "v"),
        ("a9h", 0, 0, "h"),
    ],
)
def test_parse_wall(text: str, row: int, col: int, orient: str) -> None:
    move = parse_move(text)
    assert isinstance(move, WallMove)
    assert move.wall == Wall(row=row, col=col, orientation=orient)


@pytest.mark.parametrize("bad", ["", "z1", "e0", "e1x", "ee2", "1e", "e10", "j5"])
def test_parse_invalid(bad: str) -> None:
    with pytest.raises(NotationError):
        parse_move(bad)


@pytest.mark.parametrize(
    "move, expected",
    [
        (PawnMove(to=Position(row=7, col=4)), "e2"),
        (PawnMove(to=Position(row=0, col=8)), "i9"),
        (WallMove(wall=Wall(row=2, col=4, orientation="h")), "e7h"),
        (WallMove(wall=Wall(row=7, col=0, orientation="v")), "a2v"),
    ],
)
def test_serialize(move, expected) -> None:
    assert serialize_move(move) == expected


@pytest.mark.parametrize("text", ["e2", "a1", "i9", "e7h", "a2v", "i7v"])
def test_round_trip(text: str) -> None:
    assert serialize_move(parse_move(text)) == text
