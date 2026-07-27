from __future__ import annotations

import base64
import binascii
import hashlib
import json

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _unverified_sub(token: str) -> str | None:
    """Pull the `sub` claim from a JWT WITHOUT verifying it. Used only to derive a
    stable rate-limit bucket per user — never for authorization."""
    try:
        payload = token.split(".")[1]
        padded = payload + "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded))
    except (IndexError, ValueError, binascii.Error, json.JSONDecodeError, UnicodeDecodeError):
        return None
    sub = claims.get("sub")
    return str(sub) if sub else None


def _key(request: Request) -> str:
    # FastAPI dependencies haven't run yet at limiter-key time, so we read the
    # bearer token directly. Key on the user's `sub` so limits track them across
    # token refresh; never store the raw token (hash as a fallback). IP for
    # unauthenticated / dev callers.
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer ") and len(auth) > 16:
        token = auth[7:]
        sub = _unverified_sub(token)
        if sub:
            return f"user:{sub}"
        return f"tok:{hashlib.sha256(token.encode()).hexdigest()}"
    return get_remote_address(request)


limiter = Limiter(key_func=_key, default_limits=[])
