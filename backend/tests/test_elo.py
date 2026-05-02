"""ELO service tests."""
from __future__ import annotations

import pytest

from app.services.elo_service import (
    ELO_MAX,
    ELO_MIN,
    LOSS_MULTIPLIER,
    calculate_elo_change,
    expected_score,
    get_k_factor,
    update_elos,
)


def test_k_factor_decreases_with_experience() -> None:
    assert get_k_factor(0) == 50
    assert get_k_factor(19) == 50
    assert get_k_factor(20) == 40
    assert get_k_factor(1000) == 40


def test_expected_score_equal_ratings_is_half() -> None:
    assert expected_score(1500, 1500) == pytest.approx(0.5)


def test_expected_score_higher_rating_favored() -> None:
    assert expected_score(1700, 1300) > 0.5
    assert expected_score(1300, 1700) < 0.5


def test_calculate_elo_change_equal_ratings() -> None:
    winner_delta, loser_delta = calculate_elo_change(1500, 1500, 50, 50)
    # K=40 each, expected_win = 0.5, winner gain = 40 * 0.5 = 20
    assert winner_delta == 20
    # loser_delta = round(40 * (-0.5) * 1.1) = -22
    assert loser_delta == -22


def test_calculate_elo_change_huge_upset() -> None:
    """Low-rated player beating a high-rated one earns a big swing."""
    winner_delta, loser_delta = calculate_elo_change(1000, 2000, 50, 50)
    assert winner_delta > 30
    assert abs(loser_delta) > 30
    # Loss is 10% larger than winner gain due to LOSS_MULTIPLIER
    assert abs(loser_delta) > winner_delta


def test_calculate_elo_change_minimal_for_expected_outcome() -> None:
    winner_delta, _ = calculate_elo_change(2000, 1000, 50, 50)
    assert winner_delta < 5  # high-rated player beating low-rated gains very little


def test_loss_multiplier_applied() -> None:
    winner_delta, loser_delta = calculate_elo_change(1500, 1500, 50, 50)
    # |loser_delta| should exceed winner_delta by ~LOSS_MULTIPLIER
    assert abs(loser_delta) >= winner_delta
    assert abs(loser_delta) == pytest.approx(round(winner_delta * LOSS_MULTIPLIER), abs=1)


def test_update_elos_clamps_to_ceiling() -> None:
    new_winner, _ = update_elos(ELO_MAX, 1000, 100, 100)
    assert new_winner == ELO_MAX


def test_update_elos_clamps_to_floor() -> None:
    _, new_loser = update_elos(2000, ELO_MIN, 100, 100)
    assert new_loser == ELO_MIN


def test_update_elos_zero_sum_ish() -> None:
    """Winner gain + loser loss should be close (off by LOSS_MULTIPLIER and rounding)."""
    new_winner, new_loser = update_elos(1500, 1500, 50, 50)
    gain = new_winner - 1500
    loss = 1500 - new_loser
    assert abs(loss - gain * LOSS_MULTIPLIER) < 2
