from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.core.auth import get_optional_user_id
from app.core.rate_limit import limiter
from app.schemas.ai import AIMoveRequest, AIMoveResponse, EngineStatusResponse
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


# Open to guests, because playing a bot does not require an account. The tree-search engine is
# the exception: it costs a second of CPU per move where the PPO model costs a single forward
# pass, so the service requires a signed-in caller for that one. The rate limit covers both,
# and slowapi cannot vary a limit by request body anyway.
@router.post("/move", response_model=AIMoveResponse)
@limiter.limit("60/minute")
async def ai_move(
    request: Request,
    body: AIMoveRequest,
    user_id: UUID | None = Depends(get_optional_user_id),
) -> AIMoveResponse:
    """Choose a move for the current player.

    `engine` selects the opponent: the trained PPO model (default, open to everyone) or the
    C++ MCTS search (signed-in only). A 403 means the caller needs an account for the engine
    it asked for; a 503 means the engine is saturated or unavailable. Either way the client is
    expected to play this move with its own engine rather than retry.
    """
    return await ai_service.choose_move(body, authenticated=user_id is not None)


@router.get("/engines", response_model=EngineStatusResponse)
async def ai_engines() -> EngineStatusResponse:
    """Which engines this deployment can serve, so the client can pick a source up front."""
    return ai_service.engine_status()
