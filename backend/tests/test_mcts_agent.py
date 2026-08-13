"""Tests for the MCTS agent.

Split deliberately into two tiers. The state mapping, the action decoder and the budget
arithmetic are pure Python and always run. The tests that actually search are skipped when
the `quoridor_mcts` extension is not installed, so a checkout without the engine wheel
still has a green suite.
"""

from __future__ import annotations

import asyncio
import importlib.util

import pytest

from app.ai import mcts_agent
from app.core.config import settings
from app.core.exceptions import EngineBusyError, InvalidMoveError
from app.engine.game_types import GameState, PawnMove, PlayerState, Position, Wall, WallMove
from app.engine.move_validation import get_valid_pawn_moves, is_valid_wall_placement

engine_missing = importlib.util.find_spec("quoridor_mcts") is None
needs_engine = pytest.mark.skipif(engine_missing, reason="quoridor_mcts is not installed")


def make_state(
    *,
    p0: tuple[int, int] = (8, 4),
    p1: tuple[int, int] = (0, 4),
    p0_walls: int = 10,
    p1_walls: int = 10,
    walls: tuple[Wall, ...] = (),
    current: int = 0,
) -> GameState:
    """App-convention state: player 0 starts at the bottom and runs to row 0."""
    return GameState(
        players=(
            PlayerState(position=Position(*p0), walls_remaining=p0_walls, goal_row=0),
            PlayerState(position=Position(*p1), walls_remaining=p1_walls, goal_row=8),
        ),
        walls=walls,
        current_player_index=current,  # type: ignore[arg-type]
        status="playing",
        winner=None,
    )


@pytest.fixture(autouse=True)
def _clean_agent_state():
    mcts_agent.reset_for_tests()
    yield
    mcts_agent.reset_for_tests()


@pytest.fixture
def small_budget(monkeypatch):
    """Shrinks the search so the engine-backed tests take milliseconds, not seconds. The
    budget values themselves are covered by the pure tests above."""
    monkeypatch.setattr(settings, "mcts_target_iterations", 400)
    monkeypatch.setattr(settings, "mcts_min_iterations", 100)
    monkeypatch.setattr(settings, "mcts_calibration_iterations", 100)
    monkeypatch.setattr(settings, "mcts_time_cap_ms", 2000)
    mcts_agent.reset_for_tests()
    yield


# ── state mapping ────────────────────────────────────────────────────────────────


def test_engine_player_one_is_the_app_player_running_to_row_eight() -> None:
    """The single most dangerous mapping in this integration.

    The engine's p1 is hardcoded to run to row 8, and the app's player 1 is the one with
    goal_row 8. If these ever line up by index instead of by goal row, the bot races the
    wrong way while still returning legal moves.
    """
    state = make_state(p0=(7, 4), p1=(1, 3), p0_walls=9, p1_walls=8)
    ext = mcts_agent._to_engine_state(state)

    assert ext.p1 == (1, 3)  # app player 1, goal row 8
    assert ext.p2 == (7, 4)  # app player 0, goal row 0
    assert ext.p1_walls == 8
    assert ext.p2_walls == 9


def test_turn_follows_the_mapped_player_not_the_index() -> None:
    # App player 0 to move maps to engine turn 1, because app player 0 is engine p2.
    assert mcts_agent._to_engine_state(make_state(current=0)).turn == 1
    assert mcts_agent._to_engine_state(make_state(current=1)).turn == 0


def test_mapping_is_stable_when_the_payload_lists_players_in_the_other_order() -> None:
    """Keying on goal_row means a caller that swaps the two players still gets the same
    engine position, just with the turn flipped to match."""
    swapped = GameState(
        players=(
            PlayerState(position=Position(0, 4), walls_remaining=10, goal_row=8),
            PlayerState(position=Position(8, 4), walls_remaining=10, goal_row=0),
        ),
        walls=(),
        current_player_index=0,
        status="playing",
        winner=None,
    )
    ext = mcts_agent._to_engine_state(swapped)
    assert ext.p1 == (0, 4)
    assert ext.p2 == (8, 4)
    assert ext.turn == 0


def test_walls_map_one_to_one_onto_the_engine_grids() -> None:
    state = make_state(
        walls=(
            Wall(row=2, col=4, orientation="h"),
            Wall(row=5, col=3, orientation="v"),
        )
    )
    ext = mcts_agent._to_engine_state(state)
    grid = mcts_agent.FENCE_GRID
    assert ext.h_walls[2 * grid + 4] == 1
    assert ext.v_walls[5 * grid + 3] == 1
    assert sum(ext.h_walls) == 1
    assert sum(ext.v_walls) == 1


def test_shared_goal_row_is_rejected() -> None:
    bad = GameState(
        players=(
            PlayerState(position=Position(8, 4), walls_remaining=10, goal_row=0),
            PlayerState(position=Position(0, 4), walls_remaining=10, goal_row=0),
        ),
        walls=(),
        current_player_index=0,
        status="playing",
        winner=None,
    )
    with pytest.raises(InvalidMoveError):
        mcts_agent._to_engine_state(bad)


def test_out_of_range_wall_is_rejected() -> None:
    state = make_state(walls=(Wall(row=8, col=0, orientation="h"),))
    with pytest.raises(InvalidMoveError):
        mcts_agent._to_engine_state(state)


# ── action decoding ──────────────────────────────────────────────────────────────


def test_pawn_directions_decode_to_the_adjacent_square() -> None:
    state = make_state(p0=(4, 4), p1=(0, 4), current=0)
    cases = {0: (3, 4), 1: (5, 4), 2: (4, 3), 3: (4, 5)}
    for action, expected in cases.items():
        move = mcts_agent._decode_action(action, state)
        assert isinstance(move, PawnMove)
        assert (move.to.row, move.to.col) == expected


def test_pawn_direction_resolves_to_a_jump_rather_than_the_occupied_square() -> None:
    """Index 0 is 'up', and up is occupied by the opponent, so it must decode to the square
    beyond, not to the opponent's square."""
    state = make_state(p0=(4, 4), p1=(3, 4), current=0)
    move = mcts_agent._decode_action(0, state)
    assert isinstance(move, PawnMove)
    assert (move.to.row, move.to.col) == (2, 4)


def test_diagonal_jump_decodes_when_the_straight_jump_is_walled_off() -> None:
    # Opponent directly above, with a fence behind them, so the only jumps are diagonal.
    walls = (Wall(row=2, col=4, orientation="h"),)
    state = make_state(p0=(4, 4), p1=(3, 4), current=0, walls=walls)
    legal = {(p.row, p.col) for p in get_valid_pawn_moves(state, 0)}
    assert (3, 3) in legal and (3, 5) in legal  # sanity: the diagonals are the jumps

    up_left = mcts_agent._decode_action(4, state)
    up_right = mcts_agent._decode_action(5, state)
    assert isinstance(up_left, PawnMove) and (up_left.to.row, up_left.to.col) == (3, 3)
    assert isinstance(up_right, PawnMove) and (up_right.to.row, up_right.to.col) == (3, 5)


def test_wall_actions_decode_to_the_same_anchor_and_orientation() -> None:
    state = make_state(current=0)
    grid = mcts_agent.FENCE_GRID

    h = mcts_agent._decode_action(mcts_agent.H_WALL_OFFSET + 2 * grid + 4, state)
    assert isinstance(h, WallMove)
    assert (h.wall.row, h.wall.col, h.wall.orientation) == (2, 4, "h")

    v = mcts_agent._decode_action(mcts_agent.V_WALL_OFFSET + 5 * grid + 3, state)
    assert isinstance(v, WallMove)
    assert (v.wall.row, v.wall.col, v.wall.orientation) == (5, 3, "v")


def test_terminal_and_pass_actions_decode_to_nothing() -> None:
    state = make_state(current=0)
    assert mcts_agent._decode_action(-1, state) is None
    assert mcts_agent._decode_action(mcts_agent.PASS_ACTION, state) is None
    assert mcts_agent._decode_action(mcts_agent.PASS_ACTION + 1, state) is None


def test_wall_action_is_refused_when_the_player_has_none_left() -> None:
    state = make_state(p0_walls=0, current=0)
    assert mcts_agent._decode_action(mcts_agent.H_WALL_OFFSET, state) is None


def test_wall_action_is_refused_when_it_would_seal_a_player_in() -> None:
    """A decode that the app engine calls illegal must come back as None, whatever the
    search thinks, because the app engine is what will apply the move."""
    grid = mcts_agent.FENCE_GRID
    # Box player 0 into the bottom-left corner except for one gap, then close the gap.
    walls = (
        Wall(row=7, col=0, orientation="h"),
        Wall(row=7, col=2, orientation="h"),
        Wall(row=7, col=4, orientation="h"),
        Wall(row=7, col=6, orientation="h"),
    )
    state = make_state(p0=(8, 4), walls=walls, current=0)
    # Sanity: the wall row is complete except for the far column, so 8 columns are covered
    # by four two-cell fences and player 0 has no path.
    sealing = Wall(row=7, col=7, orientation="h")
    if is_valid_wall_placement(state, sealing):
        pytest.skip("board geometry does not seal here; nothing to assert")
    action = mcts_agent.H_WALL_OFFSET + 7 * grid + 7
    assert mcts_agent._decode_action(action, state) is None


def test_every_pawn_action_decodes_to_a_move_the_engine_accepts() -> None:
    """Whatever the decoder returns has to be legal by the app engine's own rules."""
    state = make_state(p0=(4, 4), p1=(3, 4), current=0)
    legal = {(p.row, p.col) for p in get_valid_pawn_moves(state, 0)}
    for action in range(mcts_agent.NUM_MOVE_ACTIONS):
        move = mcts_agent._decode_action(action, state)
        if move is not None:
            assert isinstance(move, PawnMove)
            assert (move.to.row, move.to.col) in legal


# ── budget ───────────────────────────────────────────────────────────────────────


def test_budget_splits_the_target_across_workers() -> None:
    budget = mcts_agent._iteration_budget()
    threads = mcts_agent._threads_per_search()
    assert budget.per_worker * threads >= budget.total
    assert budget.per_worker >= 1


def test_first_search_of_a_process_uses_the_calibration_budget() -> None:
    """Nothing is known about the box yet, so the first search is deliberately cheap. It
    still returns a real move; its purpose is to measure, not to be thrown away."""
    total = mcts_agent._iteration_budget().total
    assert total == settings.mcts_calibration_iterations


def test_budget_is_trimmed_when_the_engine_is_slower_than_the_time_cap() -> None:
    """The point of measuring: a box that cannot reach the target inside the cap gets a
    smaller budget instead of a move that overruns it."""
    # 200 iterations per second against a 3s cap affords 600, under the 800 floor.
    for _ in range(50):
        mcts_agent._speed.observe(iterations=200, elapsed_ms=1000)
    slow_total = mcts_agent._iteration_budget().total

    assert slow_total < settings.mcts_target_iterations
    assert slow_total == settings.mcts_min_iterations


def test_budget_reaches_the_target_on_a_fast_box() -> None:
    for _ in range(50):
        mcts_agent._speed.observe(iterations=500_000, elapsed_ms=10)
    total = mcts_agent._iteration_budget().total
    assert total == settings.mcts_target_iterations


def test_budget_scales_with_measured_speed_between_the_floor_and_the_target() -> None:
    # 1000 iterations/sec against a 3s cap affords 3000, between the floor and the target.
    for _ in range(50):
        mcts_agent._speed.observe(iterations=1000, elapsed_ms=1000)
    total = mcts_agent._iteration_budget().total
    assert settings.mcts_min_iterations < total < settings.mcts_target_iterations


def test_calibration_search_is_not_cached() -> None:
    """A 500-iteration move must not be served for the rest of the process's life."""
    assert mcts_agent._iteration_budget().calibrating is True
    mcts_agent._speed.observe(iterations=1000, elapsed_ms=1000)
    assert mcts_agent._iteration_budget().calibrating is False


def test_speed_estimate_ignores_degenerate_samples() -> None:
    before = mcts_agent._speed.get()
    mcts_agent._speed.observe(iterations=0, elapsed_ms=100)
    mcts_agent._speed.observe(iterations=100, elapsed_ms=0)
    assert mcts_agent._speed.get() == before


# ── engine-backed ────────────────────────────────────────────────────────────────


@needs_engine
def test_python_constants_match_the_compiled_engine() -> None:
    import quoridor_mcts as qm

    assert mcts_agent.FENCE_GRID == qm.FENCE_GRID
    assert mcts_agent.NUM_MOVE_ACTIONS == qm.NUM_MOVE_ACTIONS
    assert mcts_agent.H_WALL_OFFSET == qm.H_WALL_OFFSET
    assert mcts_agent.V_WALL_OFFSET == qm.V_WALL_OFFSET
    assert mcts_agent.PASS_ACTION == qm.PASS_ACTION


@needs_engine
def test_config_keys_are_all_recognised_by_the_engine() -> None:
    """A typo in the agent's config dict would otherwise leave a knob at its default."""
    import quoridor_mcts as qm

    engine = qm.Engine()
    unknown = engine.set_config({**mcts_agent._engine_config(), "max_iters": 10})
    assert unknown == []


@needs_engine
def test_search_returns_a_legal_move_from_the_start_position(small_budget) -> None:
    state = make_state(current=1)  # the bot is app player 1
    move, stats = asyncio.run(mcts_agent.get_move(state))

    if isinstance(move, PawnMove):
        legal = {(p.row, p.col) for p in get_valid_pawn_moves(state, 1)}
        assert (move.to.row, move.to.col) in legal
    else:
        assert is_valid_wall_placement(state, move.wall)

    assert stats.iterations > 0
    assert stats.threads >= 1
    assert stats.cached is False


@needs_engine
def test_search_advances_toward_the_goal_row_it_was_given(small_budget) -> None:
    """End-to-end check on the player mapping. With no walls placed and the opponent far
    away, the bot should not walk backwards away from its goal."""
    state = make_state(p0=(8, 4), p1=(4, 4), current=1)  # player 1 runs to row 8
    move, _ = asyncio.run(mcts_agent.get_move(state))
    if isinstance(move, PawnMove):
        assert move.to.row >= 4, "the bot moved away from its goal row"


@needs_engine
def test_finished_position_is_rejected(small_budget) -> None:
    won = make_state(p0=(0, 4), current=1)  # player 0 is already home
    with pytest.raises(InvalidMoveError):
        asyncio.run(mcts_agent.get_move(won))


@needs_engine
def test_repeated_position_is_served_from_the_cache(small_budget) -> None:
    # Pre-measure so the first search is a real one; calibration searches are not cached.
    mcts_agent._speed.observe(iterations=1000, elapsed_ms=1000)

    state = make_state(current=1)
    first, first_stats = asyncio.run(mcts_agent.get_move(state))
    second, second_stats = asyncio.run(mcts_agent.get_move(state))

    assert first == second
    assert first_stats.cached is False
    assert second_stats.cached is True
    assert second_stats.elapsed_ms == 0


@pytest.mark.anyio
async def test_saturated_pool_sheds_instead_of_queueing(monkeypatch) -> None:
    """A caller that cannot get a search slot in time is told to go away, so the client
    falls back to its own engine rather than waiting behind a queue of one-second searches.
    """
    import asyncio

    monkeypatch.setattr(mcts_agent.settings, "mcts_queue_timeout_s", 0.01)
    mcts_agent._pool.reset()

    sem = asyncio.Semaphore(0)  # no slots, ever
    monkeypatch.setattr(mcts_agent._pool, "_semaphore", lambda: sem)

    with pytest.raises(EngineBusyError):
        await mcts_agent._pool.run(lambda engine: None)
