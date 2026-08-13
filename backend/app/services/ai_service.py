from __future__ import annotations

from app.ai import mcts_agent, torch_agent
from app.core.exceptions import AuthorizationError, InvalidMoveError
from app.engine.game_types import GameState, PawnMove, PlayerState, Position, Wall, WallMove
from app.schemas.ai import (
    AIMoveRequest,
    AIMoveResponse,
    EngineStatusResponse,
    GameStatePayload,
    MovePayload,
    PositionPayload,
    SearchStatsPayload,
    WallPayload,
)


def _to_engine_state(payload: GameStatePayload) -> GameState:
    return GameState(
        players=(
            PlayerState(
                position=Position(
                    row=payload.players[0].position.row,
                    col=payload.players[0].position.col,
                ),
                walls_remaining=payload.players[0].walls_remaining,
                goal_row=payload.players[0].goal_row,
            ),
            PlayerState(
                position=Position(
                    row=payload.players[1].position.row,
                    col=payload.players[1].position.col,
                ),
                walls_remaining=payload.players[1].walls_remaining,
                goal_row=payload.players[1].goal_row,
            ),
        ),
        walls=tuple(Wall(row=w.row, col=w.col, orientation=w.orientation) for w in payload.walls),
        current_player_index=payload.current_player_index,
        status="playing",
        winner=None,
    )


def _serialize_move(move: PawnMove | WallMove) -> MovePayload:
    if isinstance(move, PawnMove):
        return MovePayload(kind="pawn", to=PositionPayload(row=move.to.row, col=move.to.col))
    return MovePayload(
        kind="wall",
        wall=WallPayload(row=move.wall.row, col=move.wall.col, orientation=move.wall.orientation),
    )


async def choose_move(body: AIMoveRequest, *, authenticated: bool) -> AIMoveResponse:
    """Validate the submitted state and return a move from the requested engine.

    `authenticated` gates the search engine. Keyword-only and required so a caller cannot omit
    it and silently give away the expensive engine.
    """
    if body.state.players[0].goal_row == body.state.players[1].goal_row:
        raise InvalidMoveError("players cannot share a goal row")

    state = _to_engine_state(body.state)

    if body.engine == "mcts":
        if not authenticated:
            raise AuthorizationError("the search engine requires a signed-in account")
        move, stats = await mcts_agent.get_move(state)
        return AIMoveResponse(
            move=_serialize_move(move),
            stats=SearchStatsPayload(
                iterations=stats.iterations,
                elapsed_ms=stats.elapsed_ms,
                target_iterations=stats.target_iterations,
                threads=stats.threads,
                cached=stats.cached,
                engine_commit=stats.engine_commit,
            ),
        )

    move = await torch_agent.get_move(state, body.time_budget_s)
    return AIMoveResponse(move=_serialize_move(move))


def engine_status() -> EngineStatusResponse:
    """Report which engines this deployment can serve."""
    return EngineStatusResponse(
        mcts_available=mcts_agent.is_available(),
        engine_commit=mcts_agent.engine_commit(),
    )
