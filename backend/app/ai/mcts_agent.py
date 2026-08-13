"""Monte Carlo Tree Search opponent, backed by the C++ engine from the QuoridorMCTS repo.

The engine ships as a compiled extension module (`quoridor_mcts`, built by that repo's
setup.py). It is imported lazily and treated as optional: a deployment without the wheel
answers 503 rather than failing at import, so the rest of the API still boots.

Two things are worth knowing before touching this file.

Player mapping. The engine's player 1 is internal index 0, starts on row 0 and runs to row
8, and always moves first; its player 2 is index 1, starting on row 8 and running to row 0.
The app numbers its players the other way round. The mapping here keys on `goal_row` rather
than on list position, so it stays correct however the caller ordered the payload. Get this
wrong and the engine races toward the wrong edge while still returning legal moves.

Search budget. Strength is budgeted in iterations, not milliseconds, because iterations per
second swing by an order of magnitude between the opening and a decided endgame, and
because the server should not play weaker just because it is busy. Wall-clock is still
capped: the agent tracks how fast the engine is actually running and trims the iteration
budget when the box is too slow to finish the full target inside the cap.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from importlib import import_module
from typing import Any

from app.core.config import settings
from app.core.exceptions import EngineBusyError, EngineUnavailableError, InvalidMoveError
from app.engine.constants import BOARD_SIZE
from app.engine.game_types import (
    GameState,
    Move,
    Orientation,
    PawnMove,
    Position,
    Wall,
    WallMove,
)
from app.engine.move_validation import get_valid_pawn_moves, is_valid_wall_placement

logger = logging.getLogger(__name__)

FENCE_GRID = BOARD_SIZE - 1

# Action index layout, mirroring include/quoridor/config.hpp. Duplicated here rather than
# read off the extension module so the decoder can be tested without the native build;
# test_mcts_agent asserts the two agree whenever the module is installed.
NUM_MOVE_ACTIONS = 8
H_WALL_OFFSET = NUM_MOVE_ACTIONS
V_WALL_OFFSET = H_WALL_OFFSET + FENCE_GRID * FENCE_GRID
PASS_ACTION = V_WALL_OFFSET + FENCE_GRID * FENCE_GRID

# Pawn action index to (row delta, column delta), matching apply_action in the engine's
# src/mcts/mcts.cpp. These are directions, not destinations: a jump over the opponent has
# the same index as the single step in that direction, so the index is resolved against the
# legal moves rather than added to the pawn's position.
_PAWN_DELTAS = (
    (-1, 0),  # 0 up
    (1, 0),  # 1 down
    (0, -1),  # 2 left
    (0, 1),  # 3 right
    (-1, -1),  # 4 up-left
    (-1, 1),  # 5 up-right
    (1, -1),  # 6 down-left
    (1, 1),  # 7 down-right
)


@dataclass(frozen=True, slots=True)
class SearchStats:
    """Telemetry for one search, surfaced to the client so the bot's effort is visible."""

    iterations: int
    elapsed_ms: int
    target_iterations: int
    threads: int
    cached: bool
    engine_commit: str


# ── engine module ────────────────────────────────────────────────────────────────

_module_lock = threading.Lock()
_module: Any | None = None
_module_missing = False


def _engine_module() -> Any:
    """Import quoridor_mcts once. Raises EngineUnavailableError if it is not installed."""
    global _module, _module_missing
    if _module is not None:
        return _module
    if _module_missing:
        raise EngineUnavailableError("MCTS engine module is not installed")
    with _module_lock:
        if _module is None:
            try:
                _module = import_module("quoridor_mcts")
            except ImportError as exc:
                _module_missing = True
                logger.warning("quoridor_mcts is not installed: %s", exc)
                raise EngineUnavailableError("MCTS engine module is not installed") from exc
    return _module


def is_available() -> bool:
    try:
        _engine_module()
    except EngineUnavailableError:
        return False
    return True


def engine_commit() -> str:
    try:
        return str(getattr(_engine_module(), "build_commit", "unknown"))
    except EngineUnavailableError:
        return "unavailable"


# ── worker pool ──────────────────────────────────────────────────────────────────


def _cpu_count() -> int:
    # os.process_cpu_count honours cgroup limits on 3.13+; the fallback is fine on 3.12.
    getter = getattr(os, "process_cpu_count", None)
    return (getter() if getter else os.cpu_count()) or 1


def _threads_per_search() -> int:
    if settings.mcts_threads > 0:
        return settings.mcts_threads
    # Root parallelization scales sub-linearly, so past a handful of trees the CPU is
    # better spent serving another request.
    return max(1, min(4, _cpu_count()))


def _max_concurrent() -> int:
    if settings.mcts_max_concurrent > 0:
        return settings.mcts_max_concurrent
    return max(1, _cpu_count() // _threads_per_search())


class _EnginePool:
    """A fixed set of engine instances, one per concurrent search.

    Each instance owns its search trees and RNG stream, so they cannot be shared across
    concurrent searches. The pool doubles as the concurrency limit: a request that cannot
    take a slot within the queue cap is shed rather than queued behind a second of CPU.
    """

    def __init__(self) -> None:
        # Idle engines. The semaphore bounds how many can be in use at once, so this list
        # never grows past the concurrency limit.
        self._free: list[Any] = []
        self._lock = threading.Lock()
        self._sem: asyncio.Semaphore | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _semaphore(self) -> asyncio.Semaphore:
        # Bound to the running loop; rebuilt if the loop changes (test suites do this).
        loop = asyncio.get_running_loop()
        if self._sem is None or self._loop is not loop:
            self._sem = asyncio.Semaphore(_max_concurrent())
            self._loop = loop
        return self._sem

    def _take(self) -> Any:
        with self._lock:
            if self._free:
                return self._free.pop()
            return _engine_module().Engine()

    def _put(self, engine: Any) -> None:
        with self._lock:
            self._free.append(engine)

    async def run(self, fn: Any) -> Any:
        """Acquire a slot, run `fn(engine)` off the event loop, release."""
        sem = self._semaphore()
        try:
            await asyncio.wait_for(sem.acquire(), timeout=settings.mcts_queue_timeout_s)
        except TimeoutError as exc:
            raise EngineBusyError("MCTS engine is saturated") from exc
        try:
            engine = self._take()
            try:
                return await asyncio.to_thread(fn, engine)
            finally:
                self._put(engine)
        finally:
            sem.release()

    def reset(self) -> None:
        """Drop pooled engines, so the next search rebuilds them with current settings."""
        with self._lock:
            self._free.clear()
        self._sem = None
        self._loop = None


_pool = _EnginePool()


def _engine_config() -> dict[str, float | int | bool]:
    """The tuned configuration from the engine repo's NOTES.md.

    `max_iters` is set per search, not here, because it depends on the measured speed of
    this particular box.
    """
    return {
        "threads": _threads_per_search(),
        "use_pruning": True,
        "use_puct": True,
        "fence_penalty": settings.mcts_fence_penalty,
        "pw_k": settings.mcts_pw_k,
        "pw_alpha": settings.mcts_pw_alpha,
        "seed": 0,  # nondeterministic, so the bot does not repeat itself game after game
    }


# ── speed calibration ────────────────────────────────────────────────────────────


class _Speed:
    """Rolling estimate of engine iterations per second, used to keep searches inside the
    wall-clock cap. Every real search feeds it, so a slow or contended box converges within a
    few moves instead of relying on a hardcoded guess about the hardware."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value = 0.0
        self._measured = False

    def measured(self) -> bool:
        with self._lock:
            return self._measured

    def get(self) -> float:
        with self._lock:
            return self._value

    def observe(self, iterations: int, elapsed_ms: int) -> None:
        if iterations <= 0 or elapsed_ms <= 0:
            return
        sample = iterations * 1000.0 / elapsed_ms
        with self._lock:
            if not self._measured:
                self._value = sample
                self._measured = True
                return
            # Heavily smoothed: per-move speed swings tenfold between the opening and a
            # decided endgame, and the cap only needs to catch sustained slowness.
            self._value = 0.8 * self._value + 0.2 * sample


_speed = _Speed()


@dataclass(frozen=True, slots=True)
class _Budget:
    total: int
    per_worker: int
    calibrating: bool


def _iteration_budget() -> _Budget:
    """Size the next search.

    The engine ignores its deadline once an iteration cap is set, so the cap has to be sized
    to fit the wall-clock budget rather than trusting the engine to stop. Until this process
    has measured itself, that means running one deliberately cheap search.
    """
    threads = _threads_per_search()
    calibrating = not _speed.measured()
    if calibrating:
        total = settings.mcts_calibration_iterations
    else:
        affordable = _speed.get() * (settings.mcts_time_cap_ms / 1000.0)
        total = int(
            max(
                settings.mcts_min_iterations,
                min(settings.mcts_target_iterations, affordable),
            )
        )
    return _Budget(
        total=total,
        per_worker=max(1, math.ceil(total / threads)),
        calibrating=calibrating,
    )


# ── state mapping ────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class _EngineState:
    p1: tuple[int, int]
    p2: tuple[int, int]
    p1_walls: int
    p2_walls: int
    turn: int
    h_walls: bytes
    v_walls: bytes


def _to_engine_state(state: GameState) -> _EngineState:
    """Map an app GameState onto the engine's player numbering.

    Keyed on goal_row, not on index: the engine's player 1 is whichever player is running
    toward row 8, because that is the goal its constructor hardcodes.
    """
    goal_rows = {state.players[0].goal_row, state.players[1].goal_row}
    if goal_rows != {0, BOARD_SIZE - 1}:
        raise InvalidMoveError("players must have goal rows 0 and 8")

    p1_index = 0 if state.players[0].goal_row == BOARD_SIZE - 1 else 1
    p2_index = 1 - p1_index
    p1, p2 = state.players[p1_index], state.players[p2_index]

    h = bytearray(FENCE_GRID * FENCE_GRID)
    v = bytearray(FENCE_GRID * FENCE_GRID)
    for wall in state.walls:
        if not (0 <= wall.row < FENCE_GRID and 0 <= wall.col < FENCE_GRID):
            raise InvalidMoveError(f"wall out of range: {wall}")
        grid = h if wall.orientation == "h" else v
        grid[wall.row * FENCE_GRID + wall.col] = 1

    return _EngineState(
        p1=(p1.position.row, p1.position.col),
        p2=(p2.position.row, p2.position.col),
        p1_walls=p1.walls_remaining,
        p2_walls=p2.walls_remaining,
        turn=0 if state.current_player_index == p1_index else 1,
        h_walls=bytes(h),
        v_walls=bytes(v),
    )


def _sign(n: int) -> int:
    return (n > 0) - (n < 0)


def _decode_action(action: int, state: GameState) -> Move | None:
    """Turn an engine action index into an app Move, or None if it decodes to nothing legal.

    Wall and pawn coordinates are absolute board coordinates in both codebases, so only the
    player mapping needs swapping, never the geometry.
    """
    if action < 0 or action == PASS_ACTION:
        return None

    if action < NUM_MOVE_ACTIONS:
        d_row, d_col = _PAWN_DELTAS[action]
        origin = state.players[state.current_player_index].position
        for candidate in get_valid_pawn_moves(state, state.current_player_index):
            if (
                _sign(candidate.row - origin.row) == d_row
                and _sign(candidate.col - origin.col) == d_col
            ):
                return PawnMove(to=Position(row=candidate.row, col=candidate.col))
        return None

    if action < V_WALL_OFFSET:
        index = action - H_WALL_OFFSET
        orientation: Orientation = "h"
    elif action < PASS_ACTION:
        index = action - V_WALL_OFFSET
        orientation = "v"
    else:
        return None

    wall = Wall(row=index // FENCE_GRID, col=index % FENCE_GRID, orientation=orientation)
    if state.players[state.current_player_index].walls_remaining <= 0:
        return None
    if not is_valid_wall_placement(state, wall):
        return None
    return WallMove(wall=wall)


# ── move cache ───────────────────────────────────────────────────────────────────


class _MoveCache:
    """Small LRU over (position, configured target). Openings repeat constantly across users,
    and a hit saves a full second of CPU.

    Keyed on the configured target rather than the trimmed budget, because the trimmed value
    drifts with the speed estimate and would make almost every lookup a miss. Calibration
    searches are not stored, so a cheap early move cannot be served for the rest of the
    process's life."""

    def __init__(self, capacity: int) -> None:
        self._capacity = capacity
        self._entries: OrderedDict[tuple, Move] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: tuple) -> Move | None:
        if self._capacity <= 0:
            return None
        with self._lock:
            move = self._entries.get(key)
            if move is not None:
                self._entries.move_to_end(key)
            return move

    def put(self, key: tuple, move: Move) -> None:
        if self._capacity <= 0:
            return
        with self._lock:
            self._entries[key] = move
            self._entries.move_to_end(key)
            while len(self._entries) > self._capacity:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


_cache = _MoveCache(settings.mcts_cache_size)


# ── public API ───────────────────────────────────────────────────────────────────


async def get_move(state: GameState) -> tuple[Move, SearchStats]:
    """Choose a move for `state.current_player_index`.

    Raises InvalidMoveError for a finished or malformed position, EngineBusyError when the
    server is already at its concurrency limit, and EngineUnavailableError when the engine
    is missing or produced nothing playable. The client treats the last two as a signal to
    fall back to its own search.
    """
    _engine_module()  # fail fast with EngineUnavailableError before taking a slot

    engine_state = _to_engine_state(state)
    budget = _iteration_budget()
    threads = _threads_per_search()
    cache_key = (engine_state, settings.mcts_target_iterations)

    cached = _cache.get(cache_key)
    if cached is not None:
        return cached, SearchStats(
            iterations=0,
            elapsed_ms=0,
            target_iterations=budget.total,
            threads=threads,
            cached=True,
            engine_commit=engine_commit(),
        )

    def run(engine: Any) -> Any:
        # The engine ships from a separate repo, so a key it does not recognize means the
        # wheel predates a knob this code expects. That would silently search with a default
        # nobody chose, which is worth a log line.
        unknown = engine.set_config({**_engine_config(), "max_iters": budget.per_worker})
        if unknown:
            logger.error("MCTS engine rejected config keys: %s", ", ".join(sorted(unknown)))
        return engine.search(
            p1=engine_state.p1,
            p2=engine_state.p2,
            p1_walls=engine_state.p1_walls,
            p2_walls=engine_state.p2_walls,
            turn=engine_state.turn,
            h_walls=engine_state.h_walls,
            v_walls=engine_state.v_walls,
            time_ms=settings.mcts_time_cap_ms,
        )

    started = time.monotonic()
    result = await _pool.run(run)
    wall_ms = int((time.monotonic() - started) * 1000)

    _speed.observe(result.iterations, result.elapsed_ms)

    if result.action < 0:
        raise InvalidMoveError("position is already finished")

    move = _decode_action(result.action, state)
    if move is None:
        # The engine only returns actions it believes are legal, so this means the two
        # rule implementations disagree. Shed to the client's own search and make noise.
        logger.error(
            "MCTS action %s did not decode to a legal move (turn=%s, walls=%s)",
            result.action,
            state.current_player_index,
            len(state.walls),
        )
        raise EngineUnavailableError("engine returned a move the server could not apply")

    if not budget.calibrating:
        _cache.put(cache_key, move)
    return move, SearchStats(
        iterations=result.iterations,
        elapsed_ms=wall_ms,
        target_iterations=budget.total,
        threads=threads,
        cached=False,
        engine_commit=engine_commit(),
    )


def reset_for_tests() -> None:
    """Drop pooled engines, the cache and the speed estimate. Test-only."""
    _pool.reset()
    _cache.clear()
    global _speed
    _speed = _Speed()
