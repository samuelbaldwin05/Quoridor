from __future__ import annotations

import base64
import hashlib
import time
from urllib.parse import parse_qs, urlsplit

import pytest
from jose import jwt

from app.core.config import settings
from app.services import oauth_service


@pytest.fixture(autouse=True)
def google_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    monkeypatch.setattr(
        settings, "google_redirect_uri", "https://api.quoridor.example/auth/google/callback"
    )
    monkeypatch.setattr(settings, "oauth_state_secret", "state-secret-for-tests")
    monkeypatch.setattr(settings, "frontend_url", "https://quoridor.example")
    monkeypatch.setattr(
        settings,
        "oauth_allowed_return_origins",
        [
            "https://quoridor.example",
            "https://*.previews.example",
            "https://**.deep.example",
        ],
    )


# -- return origins ------------------------------------------------------------


def test_exact_origin_is_allowed():
    assert oauth_service.resolve_return_origin("https://quoridor.example") == (
        "https://quoridor.example"
    )


def test_only_the_origin_of_a_longer_url_survives():
    resolved = oauth_service.resolve_return_origin("https://quoridor.example/anything?a=b#c")
    assert resolved == "https://quoridor.example"


def test_missing_origin_falls_back_to_the_configured_frontend():
    assert oauth_service.resolve_return_origin(None) == "https://quoridor.example"


def test_wildcard_matches_one_label():
    assert oauth_service.resolve_return_origin("https://pr-12.previews.example") == (
        "https://pr-12.previews.example"
    )


def test_single_label_wildcard_does_not_reach_a_nested_subdomain():
    """The shape that produced "Unsupported return origin" on deployed dev.

    `dev.qwall.sambaldwin.dev` is two labels under `sambaldwin.dev`, so the single-label
    form never covered it however the pattern was written.
    """
    with pytest.raises(oauth_service.OAuthError):
        oauth_service.resolve_return_origin("https://dev.qwall.previews.example")


def test_double_wildcard_matches_any_depth():
    for origin in (
        "https://one.deep.example",
        "https://app-26.centralus.deep.example",
        "https://a.b.c.deep.example",
    ):
        assert oauth_service.resolve_return_origin(origin) == origin


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        # Any depth is the only thing "**." relaxes. Not the scheme,
        "http://one.deep.example",
        # not the apex on its own,
        "https://deep.example",
        # and not a host that merely ends in the same characters.
        "https://notdeep.example",
        # A wildcard is one label, not a suffix match on the whole host.
        "https://a.b.previews.example",
        # Nor does it license a different scheme.
        "http://pr-12.previews.example",
        # Nor a host that merely ends in the same characters.
        "https://notpreviews.example",
        # A lookalike that only shares a prefix.
        "https://quoridor.example.evil.test",
        "javascript:alert(1)",
        "not a url",
        "",
    ],
)
def test_rejected_origins(origin):
    if origin == "":
        # Empty is indistinguishable from absent, and falls back rather than raising.
        assert oauth_service.resolve_return_origin(origin) == settings.frontend_url
        return
    with pytest.raises(oauth_service.OAuthError) as exc:
        oauth_service.resolve_return_origin(origin)
    assert exc.value.code == "bad_origin"


# -- starting the flow ---------------------------------------------------------


def _claims(cookie: str) -> dict:
    return jwt.decode(cookie, "state-secret-for-tests", algorithms=["HS256"])


def test_begin_builds_a_google_url_with_pkce():
    url, cookie = oauth_service.begin("https://quoridor.example", "handoff-1")
    parts = urlsplit(url)
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == oauth_service.AUTHORIZE_ENDPOINT

    query = {k: v[0] for k, v in parse_qs(parts.query).items()}
    assert query["client_id"] == settings.google_client_id
    assert query["redirect_uri"] == settings.google_redirect_uri
    assert query["response_type"] == "code"
    assert query["code_challenge_method"] == "S256"
    assert "openid" in query["scope"]

    verifier = _claims(cookie)["cv"]
    expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
    assert query["code_challenge"] == expected.decode().rstrip("=")


def test_begin_keeps_the_verifier_out_of_the_url():
    url, cookie = oauth_service.begin("https://quoridor.example", "handoff-1")
    assert _claims(cookie)["cv"] not in url


def test_state_round_trips_through_the_cookie():
    url, cookie = oauth_service.begin("https://quoridor.example", "handoff-1")
    state = parse_qs(urlsplit(url).query)["state"][0]

    pending = oauth_service.unseal(cookie, state)
    assert pending.origin == "https://quoridor.example"
    assert pending.handoff == "handoff-1"
    assert pending.verifier


# -- callback checks -----------------------------------------------------------


def test_callback_without_the_cookie_is_refused():
    with pytest.raises(oauth_service.OAuthError) as exc:
        oauth_service.unseal(None, "some-state")
    assert exc.value.code == "expired"


def test_state_from_a_different_sign_in_is_refused():
    _, cookie = oauth_service.begin("https://quoridor.example", "handoff-1")
    other_url, _ = oauth_service.begin("https://quoridor.example", "handoff-2")
    other_state = parse_qs(urlsplit(other_url).query)["state"][0]

    with pytest.raises(oauth_service.OAuthError) as exc:
        oauth_service.unseal(cookie, other_state)
    assert exc.value.code == "bad_state"


def test_missing_state_is_refused():
    _, cookie = oauth_service.begin("https://quoridor.example", "handoff-1")
    with pytest.raises(oauth_service.OAuthError) as exc:
        oauth_service.unseal(cookie, None)
    assert exc.value.code == "bad_state"


def test_a_cookie_signed_with_another_secret_is_refused():
    forged = jwt.encode(
        {"st": "attacker-state", "cv": "v", "or": "https://evil.example", "hf": ""},
        "not-our-secret",
        algorithm="HS256",
    )
    with pytest.raises(oauth_service.OAuthError) as exc:
        oauth_service.unseal(forged, "attacker-state")
    assert exc.value.code == "expired"


def test_an_expired_cookie_is_refused():
    stale = jwt.encode(
        {"st": "s", "cv": "v", "or": "https://quoridor.example", "exp": int(time.time()) - 1},
        "state-secret-for-tests",
        algorithm="HS256",
    )
    with pytest.raises(oauth_service.OAuthError) as exc:
        oauth_service.unseal(stale, "s")
    assert exc.value.code == "expired"


# -- handing back --------------------------------------------------------------


def test_tokens_go_in_the_fragment_not_the_query():
    url = oauth_service.return_url("https://quoridor.example", {"id_token": "a b", "handoff": "h"})
    assert url.startswith("https://quoridor.example/auth/callback#")
    assert "?" not in url
    assert "id_token=a+b" in url


def test_is_configured_needs_every_piece(monkeypatch):
    assert oauth_service.is_configured()
    monkeypatch.setattr(settings, "google_client_secret", None)
    assert not oauth_service.is_configured()
