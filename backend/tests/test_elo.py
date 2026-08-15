from __future__ import annotations

import pytest

from app.services.elo_service import (
    ELO_MAX,
    ELO_MIN,
    ELO_START,
    K_BASE,
    K_PROVISIONAL,
    LOSS_MULTIPLIER,
    PROVISIONAL_GAMES,
    calculate_elo_change,
    expected_score,
    k_factor,
    update_elos,
)


def test_scale_constants() -> None:
    assert ELO_START == 1000
    assert (ELO_MIN, ELO_MAX) == (200, 5000)


def test_k_factor_starts_provisional_and_settles() -> None:
    assert k_factor(0) == K_PROVISIONAL
    assert k_factor(PROVISIONAL_GAMES) == K_BASE
    assert k_factor(500) == K_BASE


def test_k_factor_tapers_monotonically() -> None:
    ks = [k_factor(g) for g in range(PROVISIONAL_GAMES + 1)]
    assert all(earlier > later for earlier, later in zip(ks, ks[1:]))
    assert k_factor(PROVISIONAL_GAMES // 2) == pytest.approx((K_PROVISIONAL + K_BASE) / 2)


def test_k_factor_handles_negative_game_count() -> None:
    assert k_factor(-5) == K_PROVISIONAL


def test_expected_score_equal_ratings_is_half() -> None:
    assert expected_score(1500, 1500) == pytest.approx(0.5)


def test_expected_score_higher_rating_favored() -> None:
    assert expected_score(1700, 1300) > 0.5
    assert expected_score(1300, 1700) < 0.5


def test_expected_score_uses_the_doubled_scale() -> None:
    # An 800-point gap here is what a 400-point gap is on the classic chess scale,
    # i.e. the favorite is expected to score ~0.909.
    assert expected_score(1800, 1000) == pytest.approx(0.909, abs=0.001)


def test_calculate_elo_change_equal_ratings() -> None:
    winner_delta, loser_delta = calculate_elo_change(1500, 1500)
    assert winner_delta == 32
    assert loser_delta == -34


def test_calculate_elo_change_huge_upset() -> None:
    winner_delta, loser_delta = calculate_elo_change(1000, 3000)
    assert winner_delta > 50
    assert abs(loser_delta) > 50
    assert abs(loser_delta) > winner_delta


def test_calculate_elo_change_minimal_for_expected_outcome() -> None:
    winner_delta, _ = calculate_elo_change(3000, 1000)
    assert winner_delta < 5


def test_provisional_loser_drops_further_than_the_winner_gains() -> None:
    # A settled player beating a brand-new one: the newcomer moves on the bigger K,
    # so the deltas are deliberately not mirror images.
    winner_delta, loser_delta = calculate_elo_change(
        1500, 1500, winner_games=PROVISIONAL_GAMES, loser_games=0
    )
    assert winner_delta == 32
    assert loser_delta == -67


def test_provisional_winner_gains_more_than_a_settled_one() -> None:
    new_gain, _ = calculate_elo_change(1500, 1500, winner_games=0, loser_games=0)
    settled_gain, _ = calculate_elo_change(1500, 1500)
    assert new_gain == 2 * settled_gain


def test_game_counts_default_to_established() -> None:
    assert calculate_elo_change(1500, 1500) == calculate_elo_change(
        1500, 1500, winner_games=PROVISIONAL_GAMES, loser_games=PROVISIONAL_GAMES
    )


def test_loss_multiplier_applied() -> None:
    winner_delta, loser_delta = calculate_elo_change(1500, 1500)
    assert abs(loser_delta) >= winner_delta
    assert abs(loser_delta) == pytest.approx(round(winner_delta * LOSS_MULTIPLIER), abs=1)


def test_update_elos_clamps_to_ceiling() -> None:
    # Equal ratings at the ceiling: the winner would overflow (+32) and is pinned,
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


def test_update_elos_passes_game_counts_through() -> None:
    _, settled_loser = update_elos(1500, 1500, PROVISIONAL_GAMES, PROVISIONAL_GAMES)
    _, new_loser = update_elos(1500, 1500, PROVISIONAL_GAMES, 0)
    assert new_loser < settled_loser
