"""Core engine ops — mirrors frontend/src/engine/gameEngine.ts."""
from __future__ import annotations

from dataclasses import replace

from app.engine.constants import INITIAL_WALL_COUNT, PLAYER_STARTS
from app.engine.game_types import (
    GameState,
    Move,
    MoveResult,
    PawnMove,
    PlayerIndex,
    PlayerState,
    Position,
    WallMove,
)
from app.engine.move_validation import get_valid_pawn_moves, is_valid_wall_placement


def create_initial_state() -> GameState:
    p0_row, p0_col, p0_goal = PLAYER_STARTS[0]
    p1_row, p1_col, p1_goal = PLAYER_STARTS[1]
    players = (
        PlayerState(Position(p0_row, p0_col), INITIAL_WALL_COUNT, p0_goal),
        PlayerState(Position(p1_row, p1_col), INITIAL_WALL_COUNT, p1_goal),
    )
    return GameState(
        players=players,
        walls=(),
        current_player_index=0,
        status="idle",
        winner=None,
    )


def start_game(state: GameState) -> GameState:
    return replace(state, status="playing")


def check_win(state: GameState) -> PlayerIndex | None:
    for i, player in enumerate(state.players):
        if player.position.row == player.goal_row:
            return i  # type: ignore[return-value]
    return None


def apply_move(state: GameState, move: Move) -> MoveResult:
    if state.status != "playing":
        return MoveResult(valid=False, next_state=state)

    pi: PlayerIndex = state.current_player_index
    player = state.players[pi]
    next_pi: PlayerIndex = 0 if pi == 1 else 1

    if isinstance(move, PawnMove):
        if move.to not in get_valid_pawn_moves(state, pi):
            return MoveResult(valid=False, next_state=state)

        new_player = replace(player, position=move.to)
        new_players = (
            new_player if pi == 0 else state.players[0],
            new_player if pi == 1 else state.players[1],
        )
        next_state = replace(state, players=new_players, current_player_index=next_pi)
        winner = check_win(next_state)
        if winner is not None:
            next_state = replace(next_state, status="finished", winner=winner)
        return MoveResult(valid=True, next_state=next_state)

    # Wall move
    assert isinstance(move, WallMove)
    if player.walls_remaining <= 0:
        return MoveResult(valid=False, next_state=state)
    if not is_valid_wall_placement(state, move.wall):
        return MoveResult(valid=False, next_state=state)

    new_player = replace(player, walls_remaining=player.walls_remaining - 1)
    new_players = (
        new_player if pi == 0 else state.players[0],
        new_player if pi == 1 else state.players[1],
    )
    next_state = replace(
        state,
        players=new_players,
        walls=(*state.walls, move.wall),
        current_player_index=next_pi,
    )
    return MoveResult(valid=True, next_state=next_state)
