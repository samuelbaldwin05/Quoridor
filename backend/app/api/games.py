from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import get_current_user
from app.core.dependencies import get_supabase
from app.schemas.game import (
    GameDetail,
    GameResultRequest,
    GameResultResponse,
    MoveSubmitRequest,
    MoveSubmitResponse,
)
from app.schemas.user import UserRead
from app.services.game_service import get_game_detail, record_game_result, submit_move

router = APIRouter(prefix="/games", tags=["games"])


@router.get("/{game_id}", response_model=GameDetail)
def read_game(
    game_id: UUID,
    supabase: Client = Depends(get_supabase),
) -> GameDetail:
    """Public: full record for replaying a finished game."""
    return get_game_detail(supabase, game_id)


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
