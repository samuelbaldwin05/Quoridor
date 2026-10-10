from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.schemas.user import UserRead
from app.services import oauth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserRead)
async def get_me(user: UserRead = Depends(get_current_user)) -> UserRead:
    return user


@router.get("/google/start")
@limiter.limit("20/minute")
async def google_start(
    request: Request,
    origin: str | None = Query(None, description="Origin to hand the browser back to"),
    handoff: str = Query("", max_length=128),
) -> RedirectResponse:
    """Send the browser to Google.

    The whole reason this route exists: the consent screen names the host of the redirect
    URI, and that is this backend rather than the Supabase project. Supabase still issues
    the session at the end of it.
    """
    try:
        return_origin = oauth_service.resolve_return_origin(origin)
    except oauth_service.OAuthError as exc:
        # Nowhere safe to redirect to, so this one is an honest error page.
        logger.warning("rejected sign-in origin: %s", exc)
        raise HTTPException(status_code=400, detail="Unsupported return origin") from exc

    if not oauth_service.is_configured():
        # Send them back rather than answering 503 into an empty tab: the person clicked a
        # button and deserves the app's own error, not a JSON body.
        logger.error("google sign-in attempted with no client id or state secret configured")
        return RedirectResponse(
            oauth_service.return_url(return_origin, {"auth_error": "not_configured"}),
            status_code=302,
        )

    url, cookie = oauth_service.begin(return_origin, handoff)
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        oauth_service.STATE_COOKIE,
        cookie,
        max_age=oauth_service.STATE_TTL_S,
        path=oauth_service.STATE_COOKIE_PATH,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
    )
    return response


@router.get("/google/callback")
@limiter.limit("20/minute")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Trade Google's code for an id_token and hand it to the callback page.

    Everything that can go wrong ends the same way: back at the callback page with an
    `auth_error` in the fragment, because the person is mid-navigation and a JSON body
    would just be a white screen with braces on it.
    """
    origin = settings.frontend_url
    try:
        pending = oauth_service.unseal(request.cookies.get(oauth_service.STATE_COOKIE), state)
        origin = pending.origin

        if error:
            raise oauth_service.OAuthError(
                "cancelled" if error == "access_denied" else "google_error", error
            )
        if not code:
            raise oauth_service.OAuthError("no_code", "callback carried neither code nor error")

        tokens = await oauth_service.exchange_code(code, pending.verifier)
        id_token = tokens.get("id_token")
        access_token = tokens.get("access_token")
        if not id_token:
            raise oauth_service.OAuthError("no_id_token", "token response had no id_token")

        await oauth_service.verify_id_token(id_token, access_token)
        target = oauth_service.return_url(
            origin,
            {
                "id_token": id_token,
                # Forwarded because Google's id_token has an `at_hash`, which Supabase
                # cannot check without it.
                "access_token": access_token or "",
                "handoff": pending.handoff,
            },
        )
    except oauth_service.OAuthError as exc:
        logger.warning("google sign-in failed (%s): %s", exc.code, exc)
        target = oauth_service.return_url(origin, {"auth_error": exc.code})

    response = RedirectResponse(target, status_code=302)
    # The Location header carries the tokens, so nothing downstream should keep a copy.
    response.headers["Cache-Control"] = "no-store"
    response.delete_cookie(oauth_service.STATE_COOKIE, path=oauth_service.STATE_COOKIE_PATH)
    return response
