from __future__ import annotations

import threading
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from supabase import Client

from app.core.config import settings
from app.core.dependencies import get_supabase
from app.repositories import user_repository
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


# Supabase signs access tokens with aud="authenticated". Verifying audience rejects
# tokens that aren't Supabase user tokens. Issuer verification (which scopes tokens to
# THIS project) is opt-in via SUPABASE_JWT_ISSUER — it must NOT be derived from
# supabase_url, because inside Docker that's the internal kong hostname, which never
# matches the token's external issuer and would 401 every login.
_EXPECTED_AUDIENCE = "authenticated"
_EXPECTED_ISSUER = settings.supabase_jwt_issuer  # None -> issuer not verified


def _decode_options() -> dict:
    """jwt.decode kwargs: always verify audience; verify issuer only if configured."""
    opts: dict = {"audience": _EXPECTED_AUDIENCE}
    if _EXPECTED_ISSUER:
        opts["issuer"] = _EXPECTED_ISSUER
    return opts


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
                **_decode_options(),
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
                **_decode_options(),
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

    return user_repository.get_or_create_user(supabase, user_id, email, display_name)
