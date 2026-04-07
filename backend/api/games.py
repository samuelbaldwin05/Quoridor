from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from core.auth import get_current_user
from core.dependencies import get_supabase
from schemas.game import GameResultRequest, GameResultResponse
from schemas.user import UserRead
from services.game_service import record_game_result

router = APIRouter(prefix="/games", tags=["games"])


@router.post("/{game_id}/result", response_model=GameResultResponse)
def submit_game_result(
    game_id: UUID,
    body: GameResultRequest,
    user: UserRead = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> GameResultResponse:
    """Record the result of a completed online game and update ELO ratings.
    Idempotent — safe to call from both clients simultaneously."""
    return record_game_result(supabase, game_id, body)
