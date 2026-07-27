from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from supabase import Client

from app.core.exceptions import CooldownError, NotFoundError, ValidationError
from app.repositories import user_repository
from app.schemas.user import UserProfile, UserRead, UserSearchResult

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]+$")
_BLOCKED_WORDS = {
    "fuck",
    "shit",
    "cunt",
    "nigger",
    "nigga",
    "faggot",
    "fag",
    "bitch",
    "cock",
    "pussy",
    "asshole",
    "dick",
    "whore",
    "slut",
    "prick",
    "twat",
    "wanker",
    "bastard",
}
_RESERVED_NAMES = {
    "admin",
    "administrator",
    "moderator",
    "mod",
    "system",
    "support",
    "quoridor",
    "staff",
    "official",
}
USERNAME_COOLDOWN = timedelta(days=7)


def validate_username(username: str) -> None:
    """Raise ValidationError if the username fails any content rule.

    Kept in parity with the frontend lib/usernameValidation.ts rules.
    """
    if len(username) < 3:
        raise ValidationError("Username must be at least 3 characters")
    if len(username) > 24:
        raise ValidationError("Username must be 24 characters or fewer")
    if not _USERNAME_RE.match(username):
        raise ValidationError("Only letters, numbers, and underscores allowed")
    lower = username.lower()
    if lower in _RESERVED_NAMES or any(w in lower for w in _BLOCKED_WORDS):
        raise ValidationError("Username not allowed")


def update_username(client: Client, user: UserRead, raw_username: str) -> UserRead:
    """Validate, enforce the 7-day cooldown, and persist a new username."""
    username = raw_username.strip()
    validate_username(username)

    # Initial setup (username_updated_at is None) is always allowed.
    if user.username_updated_at is not None:
        now = datetime.now(UTC)
        eligible_at = user.username_updated_at + USERNAME_COOLDOWN
        if now < eligible_at:
            days_left = (eligible_at - now).days + 1
            raise CooldownError(f"You can change your username again in {days_left} day(s).")

    return user_repository.update_username(client, user.id, username)


def get_profile(client: Client, user_id: UUID) -> UserProfile:
    """Assemble a public profile (user + per-time-control stats)."""
    user = user_repository.get_user(client, user_id)
    if user is None:
        raise NotFoundError("User not found")
    time_stats = user_repository.get_user_time_stats(client, user_id)
    return UserProfile(
        id=user.id,
        username=user.username,
        elo=user.elo,
        games_played=user.games_played,
        created_at=user.created_at,
        time_stats=time_stats,
    )


def search_users(client: Client, query: str, limit: int) -> list[UserSearchResult]:
    return user_repository.search_users(client, query, limit)


def leaderboard(client: Client, limit: int) -> list[UserSearchResult]:
    return user_repository.get_leaderboard(client, limit)
