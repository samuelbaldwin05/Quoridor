"""Replay a move-history list against a fresh game and validate the outcome."""
from __future__ import annotations

from collections.abc import Sequence

from app.core.exceptions import InvalidMoveError
from app.engine.game_engine import apply_move, create_initial_state, start_game
from app.engine.game_types import GameState, PlayerIndex
from app.engine.notation import NotationError, parse_move


def replay(moves: Sequence[str]) -> GameState:
    """Apply each notation string to a fresh game; raise InvalidMoveError on the first illegal move."""
    state = start_game(create_initial_state())
    for i, text in enumerate(moves):
        try:
            move = parse_move(text)
        except NotationError as exc:
            raise InvalidMoveError(f"move {i}: {exc}") from exc
        result = apply_move(state, move)
        if not result.valid:
            raise InvalidMoveError(f"move {i} ({text}) is illegal")
        state = result.next_state
    return state


def validate_history_winner(moves: Sequence[str], claimed_winner_index: PlayerIndex) -> None:
    """Replay and assert the move history actually ends with the claimed winner crossing.

    Raises InvalidMoveError if any move is illegal, or if the final position
    doesn't show the claimed winner on their goal row. Resignation cases skip
    this check entirely (caller passes an empty `moves` list to opt out).
    """
    if not moves:
        # No history to validate — caller (game_service) treats this as
        # "trust the resignation/forfeit path"; full validation kicks in only
        # when the frontend starts sending the actual history.
        return

    final = replay(moves)
    if final.status != "finished":
        raise InvalidMoveError("history does not end in a finished game")
    if final.winner != claimed_winner_index:
        raise InvalidMoveError(
            f"claimed winner {claimed_winner_index} but engine found {final.winner}"
        )
