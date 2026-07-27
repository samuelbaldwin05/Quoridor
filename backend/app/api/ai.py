from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.rate_limit import limiter
from app.schemas.ai import AIMoveRequest, AIMoveResponse
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/move", response_model=AIMoveResponse)
@limiter.limit("60/minute")
async def ai_move(request: Request, body: AIMoveRequest) -> AIMoveResponse:
    """Choose a move for the current player using the trained PPO model."""
    return await ai_service.choose_move(body)
