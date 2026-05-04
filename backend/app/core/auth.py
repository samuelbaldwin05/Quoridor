from __future__ import annotations

import threading
from datetime import UTC, datetime
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from supabase import Client

from app.core.config import settings
from app.core.dependencies import get_supabase
from app.schemas.user import UserRead

DEV_USER_ID = UUID("00000000-0000-0000-0000-000000000099")

_ASYMMETRIC_ALGS = {"ES256", "ES384", "ES512", "RS256", "RS384", "RS512", "EdDSA"}

_bearer = HTTPBearer(auto_error=False)

_jwks_lock = threading.Lock()
_jwks_cache: dict | None = None


def _fetch_jwks() -> dict:
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    response = httpx.get(url, timeout=5.0)
    response.raise_for_status()
    return response.json()


def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache
    with _jwks_lock:
        if _jwks_cache is None or force_refresh:
            _jwks_cache = _fetch_jwks()
        return _jwks_cache


def _find_key(jwks: dict, kid: str | None) -> dict | None:
    keys = jwks.get("keys", [])
    if kid is None:
        return keys[0] if len(keys) == 1 else None
    return next((k for k in keys if k.get("kid") == kid), None)


def _verify_jwt(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    alg = header.get("alg", "")

    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise HTTPException(status_code=401, detail="Invalid token")
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except JWTError as exc:
            raise HTTPException(status_code=401, detail="Invalid token") from exc

    if alg in _ASYMMETRIC_ALGS:
        kid = header.get("kid")
        key = _find_key(_get_jwks(), kid)
        if key is None:
            # Fresh rotation — refetch once before giving up.
            key = _find_key(_get_jwks(force_refresh=True), kid)
        if key is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        try:
            return jwt.decode(
                token,
                key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
        except JWTError as exc:
            raise HTTPException(status_code=401, detail="Invalid token") from exc

    raise HTTPException(status_code=401, detail="Invalid token")


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
        payload = _verify_jwt(token)

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
    """SELECT-then-INSERT/UPDATE — avoids `upsert`'s email-conflict footgun.

    Upsert with `on_conflict=id` issues an UPDATE on every existing-user hit,
    which tries to overwrite `email`; PostgREST then rejects with 409 if
    *any* unrelated row holds that email. We never need to change a user's
    email after first creation, so the cleaner path is:
      - exists by id  → UPDATE display_name only (skip email entirely)
      - missing       → INSERT new row
    """
    uid = str(user_id)

    # supabase-py's maybe_single() returns None (not a response object) when
    # the row doesn't exist, so handle that explicitly before touching .data.
    try:
        existing = supabase.table("users").select("*").eq("id", uid).maybe_single().execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch user") from exc

    existing_data = existing.data if existing is not None else None

    if existing_data:
        # Refresh display name in case Google changed it; never touch email or username.
        try:
            supabase.table("users").update({"display_name": display_name}).eq("id", uid).execute()
        except Exception:
            pass
        # Heartbeat for cleanup_stale_challenges(). Best-effort.
        try:
            supabase.table("users").update({"last_seen_at": datetime.now(UTC).isoformat()}).eq(
                "id", uid
            ).execute()
        except Exception:
            pass

        refreshed = supabase.table("users").select("*").eq("id", uid).maybe_single().execute()
        refreshed_data = refreshed.data if refreshed is not None else None
        return UserRead(**(refreshed_data or existing_data))

    # username is NOT NULL on the table, but we don't know what the user
    # wants yet. Insert a deterministic placeholder; the frontend's
    # UsernameGuard sees username_chosen=false and routes them through /setup
    # to pick a real one.
    placeholder_username = f"player_{uid[:8]}"
    try:
        supabase.table("users").insert(
            {
                "id": uid,
                "email": email,
                "display_name": display_name,
                "username": placeholder_username,
                "username_chosen": False,
            }
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create user") from exc

    result = supabase.table("users").select("*").eq("id", uid).maybe_single().execute()
    result_data = result.data if result is not None else None
    if not result_data:
        raise HTTPException(status_code=500, detail="User not found after insert")
    return UserRead(**result_data)
