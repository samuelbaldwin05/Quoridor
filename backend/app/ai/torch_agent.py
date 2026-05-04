# Wall convention parity: backend Wall(row, col, h|v) maps 1:1 to QuoridorAI
# h_walls[row, col] / v_walls[row, col] — both index 8x8 fence grids the same way.

from __future__ import annotations

import asyncio
import threading
from pathlib import Path

import numpy as np

from app.ai.torch.game import QuoridorState
from app.ai.torch.ppo_bot import PPOBot
from app.engine.game_types import GameState, Move, PawnMove, Position, Wall, WallMove

_CHECKPOINT = Path(__file__).parent / "torch" / "checkpoints" / "best_mixed-v2.pt"

_lock = threading.Lock()
_bot: PPOBot | None = None


def _load_bot() -> PPOBot:
    """Lazily instantiate the PPOBot; subsequent calls reuse the cache."""
    global _bot
    if _bot is None:
        with _lock:
            if _bot is None:  # double-checked under the lock
                _bot = PPOBot(str(_CHECKPOINT), greedy=True)
    return _bot


def _to_quoridor_state(state: GameState) -> QuoridorState:
    """Convert backend engine GameState → training-repo QuoridorState."""
    q = QuoridorState()
    q.pos = np.array(
        [
            [state.players[0].position.row, state.players[0].position.col],
            [state.players[1].position.row, state.players[1].position.col],
        ],
        dtype=np.int8,
    )
    q.walls_left = np.array(
        [state.players[0].walls_remaining, state.players[1].walls_remaining],
        dtype=np.int8,
    )
    q.turn = int(state.current_player_index)
    q.done = state.status == "finished"
    q.winner = state.winner if state.winner is not None else -1

    h = np.zeros((8, 8), dtype=np.bool_)
    v = np.zeros((8, 8), dtype=np.bool_)
    for w in state.walls:
        if w.orientation == "h":
            h[w.row, w.col] = True
        else:
            v[w.row, w.col] = True
    q.h_walls = h
    q.v_walls = v
    return q


def _to_engine_move(action: tuple) -> Move:
    """Convert PPOBot's action tuple → backend Move."""
    kind = action[0]
    if kind == "move":
        _, row, col = action
        return PawnMove(to=Position(row=int(row), col=int(col)))
    if kind == "fence":
        _, row, col, orient = action
        return WallMove(wall=Wall(row=int(row), col=int(col), orientation=orient))
    raise ValueError(f"unrecognized PPOBot action: {action!r}")


def _sync_get_move(state: GameState) -> Move:
    bot = _load_bot()
    qstate = _to_quoridor_state(state)
    return _to_engine_move(bot.choose_action(qstate))


async def get_move(state: GameState, time_budget_s: float = 0.0) -> Move:
    """Run inference off the event loop so a request can't stall others.

    `time_budget_s` is currently ignored (the model is a single forward pass);
    the parameter exists so a search-based agent can drop in later without
    changing the route.
    """
    del time_budget_s  # placeholder for the future C++ agent
    return await asyncio.to_thread(_sync_get_move, state)
