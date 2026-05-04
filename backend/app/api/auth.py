from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserRead)
async def get_me(user: UserRead = Depends(get_current_user)) -> UserRead:
    return user
