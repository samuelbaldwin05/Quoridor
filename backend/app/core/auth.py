from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from supabase import Client

from app.core.config import settings
from app.core.dependencies import get_supabase
from app.schemas.user import UserRead

DEV_USER_ID = UUID("00000000-0000-0000-0000-000000000099")

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    supabase: Client = Depends(get_supabase),
) -> UserRead:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = credentials.credentials

    if token == "dev-token":
        if settings.environment != "development":
            raise HTTPException(status_code=403, detail="Dev token not allowed outside development")
        user_id = DEV_USER_ID
        email = "dev@quoridor.local"
        display_name = "Dev Player"
    else:
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except JWTError as exc:
            raise HTTPException(status_code=401, detail="Invalid token") from exc

        raw_id: str = payload.get("sub", "")
        if not raw_id:
            raise HTTPException(status_code=401, detail="Token missing sub claim")

        user_id = UUID(raw_id)
        email = payload.get("email", "")
        user_metadata: dict = payload.get("user_metadata", {})
        display_name = (
            user_metadata.get("full_name")
            or user_metadata.get("display_name")
            or email.split("@")[0]
            or "Player"
        )

    return _get_or_create_user(supabase, user_id, email, display_name)


def _get_or_create_user(
    supabase: Client,
    user_id: UUID,
    email: str,
    display_name: str,
) -> UserRead:
    try:
        # Only upsert google-owned fields — never overwrite username (user-set)
        supabase.table("users").upsert(
            {"id": str(user_id), "email": email, "display_name": display_name},
            on_conflict="id",
            ignore_duplicates=False,
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to sync user") from exc

    result = (
        supabase.table("users")
        .select("*")
        .eq("id", str(user_id))
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="User not found after upsert")

    return UserRead(**result.data)
