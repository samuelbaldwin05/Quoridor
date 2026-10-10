from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.core.auth import get_current_user, get_optional_user_id
from app.core.dependencies import get_supabase
from app.schemas.game import (
    BotGameCreate,
    BotGameRead,
    BotGameSummary,
    GameDetail,
    GameResultRequest,
    GameResultResponse,
    MoveSubmitRequest,
    MoveSubmitResponse,
)
from app.schemas.user import UserRead
from app.services.game_service import (
    get_game_detail,
    list_bot_games,
    record_bot_game,
    record_game_result,
    submit_move,
)

router = APIRouter(prefix="/games", tags=["games"])


# Declared before GET /{game_id}: route matching is in declaration order, so the other way
# round this path is read as a game id and answered with a 422 for a malformed UUID.
@router.get("/bot", response_model=list[BotGameSummary])
def list_bot_games_route(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: UserRead = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[BotGameSummary]:
    """The caller's own finished bot games, newest first.

    Authenticated and always scoped to the caller, unlike the public ranked history on
    /api/users/{id}/games, which excludes these."""
    return list_bot_games(supabase, user.id, limit, offset)


@router.get("/{game_id}", response_model=GameDetail)
def read_game(
    game_id: UUID,
    viewer_id: UUID | None = Depends(get_optional_user_id),
    supabase: Client = Depends(get_supabase),
) -> GameDetail:
    """A finished game for anyone; a game in progress only for the two players in it.

    Optional auth rather than required: the replay viewer is public and is used by signed
    out visitors, while rejoining a live game after a reload needs the caller identified.
    """
    return get_game_detail(supabase, game_id, viewer_id)


@router.post("/bot", response_model=BotGameRead)
def record_bot_game_route(
    body: BotGameCreate,
    user: UserRead = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> BotGameRead:
    """Record a completed single-player bot game for the current user.

    History only: no Elo, no ranked stats, no server-side move validation.
    Idempotent on the client-supplied game id."""
    return record_bot_game(supabase, body, user.id)


@router.post("/{game_id}/move", response_model=MoveSubmitResponse)
def submit_game_move(
    game_id: UUID,
    body: MoveSubmitRequest,
    user: UserRead = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> MoveSubmitResponse:
    """Validate a move against authoritative server state and record it."""
    return submit_move(supabase, game_id, body, user.id)


@router.post("/{game_id}/result", response_model=GameResultResponse)
def submit_game_result(
    game_id: UUID,
    body: GameResultRequest,
    user: UserRead = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> GameResultResponse:
    """Record the result of a completed online game and update ELO ratings.
    Idempotent — safe to call from both clients simultaneously."""
    return record_game_result(supabase, game_id, body, user.id)
