"""ELO rating calculation for Quoridor matches."""

K_FACTOR = 32


def expected_score(rating_a: int, rating_b: int) -> float:
    """Expected score for player A against player B (0.0 to 1.0)."""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))


def calculate_elo_change(winner_rating: int, loser_rating: int) -> tuple[int, int]:
    """
    Returns (winner_delta, loser_delta).

    winner_delta is a positive int representing how much the winner gains.
    loser_delta is a negative int representing how much the loser loses.
    """
    expected_win = expected_score(winner_rating, loser_rating)
    winner_delta = round(K_FACTOR * (1.0 - expected_win))
    loser_delta = round(K_FACTOR * (0.0 - (1.0 - expected_win)))
    return winner_delta, loser_delta


def update_elos(winner_elo: int, loser_elo: int) -> tuple[int, int]:
    """
    Returns (new_winner_elo, new_loser_elo).

    The minimum ELO is clamped to 100 to prevent ratings from dropping
    below a sensible floor.
    """
    delta_w, delta_l = calculate_elo_change(winner_elo, loser_elo)
    return winner_elo + delta_w, max(100, loser_elo + delta_l)
