from __future__ import annotations

import asyncio
import base64
import hashlib
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode, urlsplit

import httpx
from jose import JWTError, jwt

from app.core.config import settings

AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"

# Google still issues both forms, and which one you get depends on the client's age.
_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

_SCOPE = "openid email profile"

STATE_COOKIE = "quoridor_oauth"
STATE_COOKIE_PATH = "/auth/google"
# Long enough to pick an account and type a password, short enough that an abandoned
# attempt is not still usable later.
STATE_TTL_S = 600

_HTTP_TIMEOUT_S = 10.0


class OAuthError(Exception):
    """A sign-in that cannot be finished. `code` is the only part the browser is told,
    because the detail usually describes our own configuration."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code


@dataclass(frozen=True)
class PendingSignIn:
    """What the start of the flow has to remember until Google sends the browser back."""

    verifier: str
    origin: str
    handoff: str


def is_configured() -> bool:
    return bool(
        settings.google_client_id and settings.google_client_secret and settings.oauth_state_secret
    )


def _state_secret() -> str:
    if not settings.oauth_state_secret:
        raise OAuthError("not_configured", "OAUTH_STATE_SECRET is unset")
    return settings.oauth_state_secret


# -- Where the browser is allowed to be sent back to --------------------------


def _origin_of(url: str) -> str | None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}"


def _matches(pattern: str, origin: str) -> bool:
    if pattern == origin:
        return True
    scheme, _, host = pattern.partition("://")
    if not host.startswith("*."):
        return False
    parsed = urlsplit(origin)
    if parsed.scheme != scheme:
        return False
    suffix = host[1:]  # ".example.net"
    if not parsed.netloc.endswith(suffix) or len(parsed.netloc) <= len(suffix):
        return False
    # One label only, so "*.example.net" cannot be talked into matching "a.b.example.net".
    return "." not in parsed.netloc[: -len(suffix)]


def resolve_return_origin(raw: str | None) -> str:
    """The origin the callback may redirect to, or a raise.

    Only the scheme and host of `raw` survive. The path is fixed, so nothing the caller
    sends can steer the redirect anywhere but the callback page.
    """
    if not raw:
        return settings.frontend_url
    origin = _origin_of(raw)
    if origin is None:
        raise OAuthError("bad_origin", f"not a usable origin: {raw!r}")
    if not any(_matches(pattern, origin) for pattern in settings.oauth_allowed_return_origins):
        raise OAuthError("bad_origin", f"origin not allowed: {origin}")
    return origin


def return_url(origin: str, params: dict[str, str]) -> str:
    """The callback page, with everything it needs in the fragment. A fragment rather than
    a query string because it is never sent to a server, so it stays out of access logs."""
    return f"{origin}/auth/callback#{urlencode(params)}"


# -- Starting the flow --------------------------------------------------------


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return verifier, base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _seal(state: str, pending: PendingSignIn) -> str:
    return jwt.encode(
        {
            "st": state,
            "cv": pending.verifier,
            "or": pending.origin,
            "hf": pending.handoff,
            "exp": int(time.time()) + STATE_TTL_S,
        },
        _state_secret(),
        algorithm="HS256",
    )


def unseal(sealed: str | None, state: str | None) -> PendingSignIn:
    """Recover what `begin` stashed, and prove this callback belongs to it.

    Two things have to agree: the cookie, which only this browser has, and the `state`
    Google echoes back, which is signed into that cookie. An attacker can forge neither,
    so a callback cannot be replayed into someone else's browser.
    """
    if not sealed:
        raise OAuthError("expired", "no state cookie on the callback")
    try:
        claims = jwt.decode(sealed, _state_secret(), algorithms=["HS256"])
    except JWTError as exc:
        raise OAuthError("expired", f"unusable state cookie: {exc}") from exc
    if not state or not secrets.compare_digest(str(claims.get("st", "")), state):
        raise OAuthError("bad_state", "state parameter does not match the cookie")
    return PendingSignIn(
        verifier=str(claims.get("cv", "")),
        origin=str(claims.get("or") or settings.frontend_url),
        handoff=str(claims.get("hf", "")),
    )


def begin(origin: str, handoff: str) -> tuple[str, str]:
    """Returns the Google URL to send the browser to, and the state cookie to set with it.

    No `nonce`: PKCE binds the code to this backend, the state cookie binds the callback to
    this browser, and `handoff` binds the result to the tab that asked for it. Adding one
    would also mean passing it through to signInWithIdToken, where Google's and Apple's
    conventions differ, to buy protection we already have.
    """
    state = secrets.token_urlsafe(32)
    verifier, challenge = _pkce_pair()
    params = {
        "client_id": settings.google_client_id or "",
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": _SCOPE,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    cookie = _seal(state, PendingSignIn(verifier=verifier, origin=origin, handoff=handoff))
    return f"{AUTHORIZE_ENDPOINT}?{urlencode(params)}", cookie


# -- Finishing it -------------------------------------------------------------


async def exchange_code(code: str, verifier: str) -> dict:
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
        try:
            response = await client.post(
                TOKEN_ENDPOINT,
                data={
                    "code": code,
                    "client_id": settings.google_client_id or "",
                    "client_secret": settings.google_client_secret or "",
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                    "code_verifier": verifier,
                },
            )
        except httpx.HTTPError as exc:
            raise OAuthError("google_unreachable", str(exc)) from exc
    if response.status_code != 200:
        raise OAuthError("exchange_failed", f"{response.status_code}: {response.text[:200]}")
    return response.json()


_jwks_lock = asyncio.Lock()
_jwks_cache: dict | None = None


async def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache
    async with _jwks_lock:
        if _jwks_cache is None or force_refresh:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
                response = await client.get(JWKS_URL)
            response.raise_for_status()
            _jwks_cache = response.json()
        return _jwks_cache


def _find_key(jwks: dict, kid: str | None) -> dict | None:
    keys = jwks.get("keys", [])
    if kid is None:
        return keys[0] if len(keys) == 1 else None
    return next((key for key in keys if key.get("kid") == kid), None)


async def verify_id_token(id_token: str, access_token: str | None) -> dict:
    """Check Google's token before handing it to the browser.

    Supabase verifies it again on the way in, so this is not the only gate. It is here so a
    misconfigured client id or a botched exchange fails on the server, with a log line,
    rather than surfacing as an opaque error out of signInWithIdToken.

    `access_token` is needed because Google's id_token carries an `at_hash`, and jose
    refuses to validate that claim without something to hash.
    """
    try:
        header = jwt.get_unverified_header(id_token)
    except JWTError as exc:
        raise OAuthError("bad_id_token", str(exc)) from exc

    kid = header.get("kid")
    key = _find_key(await _get_jwks(), kid)
    if key is None:
        # Google rotates signing keys, so an unknown kid is worth one refetch.
        key = _find_key(await _get_jwks(force_refresh=True), kid)
    if key is None:
        raise OAuthError("bad_id_token", f"no Google signing key for kid {kid!r}")

    try:
        claims = jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            access_token=access_token,
        )
    except JWTError as exc:
        raise OAuthError("bad_id_token", str(exc)) from exc

    if claims.get("iss") not in _ISSUERS:
        raise OAuthError("bad_id_token", f"unexpected issuer {claims.get('iss')!r}")
    if not claims.get("email"):
        raise OAuthError("no_email", "Google returned no email claim")
    if claims.get("email_verified") not in (True, "true"):
        raise OAuthError("email_unverified", str(claims.get("email")))
    return claims
