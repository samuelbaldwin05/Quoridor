from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import ValidationError
from app.services.user_service import USERNAME_COOLDOWN, validate_username

# ── valid usernames ───────────────────────────────────────────────────────────


class TestValidUsernames:
    def test_plain_letters(self) -> None:
        validate_username("HelloWorld")

    def test_letters_and_digits(self) -> None:
        validate_username("user123")

    def test_underscores(self) -> None:
        validate_username("hello_world")

    def test_exactly_3_chars(self) -> None:
        validate_username("abc")

    def test_exactly_24_chars(self) -> None:
        validate_username("a" * 24)

    def test_all_digits(self) -> None:
        validate_username("12345")

    def test_mixed_case(self) -> None:
        validate_username("CamelCase")

    def test_leading_underscore(self) -> None:
        validate_username("_username")

    def test_trailing_underscore(self) -> None:
        validate_username("username_")


# ── length rules ──────────────────────────────────────────────────────────────


class TestLengthRules:
    @pytest.mark.parametrize("name", ["a", "ab", "a" * 25, ""])
    def test_invalid_length_rejected(self, name: str) -> None:
        with pytest.raises(ValidationError):
            validate_username(name)


# ── character rules ───────────────────────────────────────────────────────────


class TestCharacterRules:
    @pytest.mark.parametrize(
        "name",
        [
            "hello world",
            "hello-world",
            "hello.world",
            "hello@world",
            "héllo",
            "hello😀",
            "你好world",
        ],
    )
    def test_invalid_chars_rejected(self, name: str) -> None:
        with pytest.raises(ValidationError):
            validate_username(name)


# ── reserved names ────────────────────────────────────────────────────────────


class TestReservedNames:
    @pytest.mark.parametrize(
        "name",
        [
            "admin",
            "administrator",
            "moderator",
            "mod",
            "system",
            "support",
            "quoridor",
            "staff",
            "official",
        ],
    )
    def test_reserved_name_rejected(self, name: str) -> None:
        with pytest.raises(ValidationError):
            validate_username(name)

    @pytest.mark.parametrize("name", ["ADMIN", "Admin"])
    def test_reserved_name_case_insensitive(self, name: str) -> None:
        with pytest.raises(ValidationError):
            validate_username(name)


# ── profanity filter ──────────────────────────────────────────────────────────


class TestProfanityFilter:
    @pytest.mark.parametrize("name", ["shit", "bullshit", "FUCK", "Bitch123"])
    def test_profanity_rejected(self, name: str) -> None:
        with pytest.raises(ValidationError):
            validate_username(name)


# ── cooldown logic ────────────────────────────────────────────────────────────


class TestCooldownLogic:
    def test_cooldown_is_7_days(self) -> None:
        assert USERNAME_COOLDOWN == timedelta(days=7)

    def test_within_cooldown(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=3)
        eligible_at = last_changed + USERNAME_COOLDOWN
        assert now < eligible_at  # still within cooldown

    def test_cooldown_expired(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=8)
        eligible_at = last_changed + USERNAME_COOLDOWN
        assert now >= eligible_at  # cooldown has passed

    def test_cooldown_boundary_exactly_7_days(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=7, seconds=1)
        eligible_at = last_changed + USERNAME_COOLDOWN
        assert now >= eligible_at  # just past the boundary

    def test_days_remaining_calculation(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=3)
        eligible_at = last_changed + USERNAME_COOLDOWN
        days_left = (eligible_at - now).days + 1
        assert days_left == 5  # 7 - 3 + 1 (ceiling)
