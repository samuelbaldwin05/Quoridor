"""Rate limiting via slowapi.

Keyed on the authenticated user's UUID when present, falling back to client
IP. The Limiter is wired to the app in api/main.py; routes apply limits via
the @limiter.limit("...") decorator.
"""
from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _key(request: Request) -> str:
    # FastAPI dependencies haven't run yet at limiter-key time, so we pull the
    # bearer token directly. Falls back to IP for unauth'd / dev callers.
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer ") and len(auth) > 16:
        return auth[7:]
    return get_remote_address(request)


limiter = Limiter(key_func=_key, default_limits=[])
