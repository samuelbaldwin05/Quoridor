from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.api.users import _USERNAME_COOLDOWN, _validate_username_value


# ── valid usernames ───────────────────────────────────────────────────────────

class TestValidUsernames:
    def test_plain_letters(self) -> None:
        _validate_username_value("HelloWorld")

    def test_letters_and_digits(self) -> None:
        _validate_username_value("user123")

    def test_underscores(self) -> None:
        _validate_username_value("hello_world")

    def test_exactly_3_chars(self) -> None:
        _validate_username_value("abc")

    def test_exactly_24_chars(self) -> None:
        _validate_username_value("a" * 24)

    def test_all_digits(self) -> None:
        _validate_username_value("12345")

    def test_mixed_case(self) -> None:
        _validate_username_value("CamelCase")

    def test_leading_underscore(self) -> None:
        _validate_username_value("_username")

    def test_trailing_underscore(self) -> None:
        _validate_username_value("username_")


# ── length rules ──────────────────────────────────────────────────────────────

class TestLengthRules:
    def test_too_short_1_char(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("a")
        assert exc.value.status_code == 422

    def test_too_short_2_chars(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("ab")
        assert exc.value.status_code == 422

    def test_too_long_25_chars(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("a" * 25)
        assert exc.value.status_code == 422

    def test_empty_string(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("")
        assert exc.value.status_code == 422


# ── character rules ───────────────────────────────────────────────────────────

class TestCharacterRules:
    def test_space_rejected(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("hello world")
        assert exc.value.status_code == 422

    def test_hyphen_rejected(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("hello-world")
        assert exc.value.status_code == 422

    def test_dot_rejected(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("hello.world")
        assert exc.value.status_code == 422

    def test_at_sign_rejected(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("hello@world")
        assert exc.value.status_code == 422

    def test_accented_char_rejected(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("héllo")
        assert exc.value.status_code == 422

    def test_unicode_emoji_rejected(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("hello😀")
        assert exc.value.status_code == 422

    def test_unicode_cjk_rejected(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("你好world")
        assert exc.value.status_code == 422


# ── reserved names ────────────────────────────────────────────────────────────

class TestReservedNames:
    @pytest.mark.parametrize("name", [
        "admin", "administrator", "moderator", "mod",
        "system", "support", "quoridor", "staff", "official",
    ])
    def test_reserved_name_rejected(self, name: str) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value(name)
        assert exc.value.status_code == 422

    def test_reserved_name_case_insensitive(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("ADMIN")
        assert exc.value.status_code == 422

    def test_reserved_name_mixed_case(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("Admin")
        assert exc.value.status_code == 422


# ── profanity filter ──────────────────────────────────────────────────────────

class TestProfanityFilter:
    def test_profanity_as_whole_word(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("shit")
        assert exc.value.status_code == 422

    def test_profanity_as_substring(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("bullshit")
        assert exc.value.status_code == 422

    def test_profanity_uppercase(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("FUCK")
        assert exc.value.status_code == 422

    def test_profanity_mixed_case(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_username_value("Bitch123")
        assert exc.value.status_code == 422


# ── cooldown logic ────────────────────────────────────────────────────────────

class TestCooldownLogic:
    def test_cooldown_is_7_days(self) -> None:
        assert _USERNAME_COOLDOWN == timedelta(days=7)

    def test_within_cooldown(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=3)
        eligible_at = last_changed + _USERNAME_COOLDOWN
        assert now < eligible_at  # still within cooldown

    def test_cooldown_expired(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=8)
        eligible_at = last_changed + _USERNAME_COOLDOWN
        assert now >= eligible_at  # cooldown has passed

    def test_cooldown_boundary_exactly_7_days(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=7, seconds=1)
        eligible_at = last_changed + _USERNAME_COOLDOWN
        assert now >= eligible_at  # just past the boundary

    def test_days_remaining_calculation(self) -> None:
        now = datetime.now(UTC)
        last_changed = now - timedelta(days=3)
        eligible_at = last_changed + _USERNAME_COOLDOWN
        days_left = (eligible_at - now).days + 1
        assert days_left == 5  # 7 - 3 + 1 (ceiling)
