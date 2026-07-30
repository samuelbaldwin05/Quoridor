from __future__ import annotations

import pytest

from app.services.elo_service import (
    ELO_MAX,
    ELO_MIN,
    K_FACTOR,
    LOSS_MULTIPLIER,
    calculate_elo_change,
    expected_score,
    update_elos,
)


def test_k_factor_value() -> None:
    assert K_FACTOR == 32


def test_expected_score_equal_ratings_is_half() -> None:
    assert expected_score(1500, 1500) == pytest.approx(0.5)


def test_expected_score_higher_rating_favored() -> None:
    assert expected_score(1700, 1300) > 0.5
    assert expected_score(1300, 1700) < 0.5


def test_calculate_elo_change_equal_ratings() -> None:
    winner_delta, loser_delta = calculate_elo_change(1500, 1500)
    assert winner_delta == 16
    assert loser_delta == -18


def test_calculate_elo_change_huge_upset() -> None:
    winner_delta, loser_delta = calculate_elo_change(1000, 2000)
    assert winner_delta > 25
    assert abs(loser_delta) > 25
    assert abs(loser_delta) > winner_delta


def test_calculate_elo_change_minimal_for_expected_outcome() -> None:
    winner_delta, _ = calculate_elo_change(2000, 1000)
    assert winner_delta < 5


def test_loss_multiplier_applied() -> None:
    winner_delta, loser_delta = calculate_elo_change(1500, 1500)
    assert abs(loser_delta) >= winner_delta
    assert abs(loser_delta) == pytest.approx(round(winner_delta * LOSS_MULTIPLIER), abs=1)


def test_update_elos_clamps_to_ceiling() -> None:
    # Equal ratings at the ceiling: the winner would overflow (+16) and is pinned,
    # while the loser must still drop — asserting both catches a swapped clamp.
    new_winner, new_loser = update_elos(ELO_MAX, ELO_MAX)
    assert new_winner == ELO_MAX  # winner pinned at ceiling
    assert new_loser < ELO_MAX  # loser moved down, NOT clamped to the winner's ceiling


def test_update_elos_clamps_to_floor() -> None:
    # Equal ratings at the floor: the loser would underflow and is pinned, while
    # the winner must still rise.
    new_winner, new_loser = update_elos(ELO_MIN, ELO_MIN)
    assert new_loser == ELO_MIN  # loser pinned at floor
    assert new_winner > ELO_MIN  # winner moved up, NOT clamped to the loser's floor


def test_update_elos_zero_sum_ish() -> None:
    new_winner, new_loser = update_elos(1500, 1500)
    gain = new_winner - 1500
    loss = 1500 - new_loser
    assert abs(loss - gain * LOSS_MULTIPLIER) < 2
