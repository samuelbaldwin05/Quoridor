"""ELO rating calculation for Quoridor matches."""

ELO_MIN = 100
ELO_MAX = 2500
LOSS_MULTIPLIER = 1.1  # losses are 10% larger than the opponent's gain


def get_k_factor(games_played: int) -> int:
    """Dynamic K-factor: higher for newer players so ratings settle quickly.
    Evenly matched players exchange ~20 Elo; max swing ~50 for a huge upset."""
    if games_played < 20:
        return 50
    return 40


def expected_score(rating_a: int, rating_b: int) -> float:
    """Expected score for player A against player B (0.0 to 1.0)."""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))


def calculate_elo_change(
    winner_rating: int,
    loser_rating: int,
    winner_games: int = 50,
    loser_games: int = 50,
) -> tuple[int, int]:
    """
    Returns (winner_delta, loser_delta).

    winner_delta is a positive int representing how much the winner gains.
    loser_delta is a negative int representing how much the loser loses.
    """
    k_winner = get_k_factor(winner_games)
    k_loser = get_k_factor(loser_games)
    expected_win = expected_score(winner_rating, loser_rating)
    winner_delta = round(k_winner * (1.0 - expected_win))
    loser_delta = round(k_loser * (0.0 - (1.0 - expected_win)) * LOSS_MULTIPLIER)
    return winner_delta, loser_delta


def update_elos(
    winner_elo: int,
    loser_elo: int,
    winner_games: int = 50,
    loser_games: int = 50,
) -> tuple[int, int]:
    """
    Returns (new_winner_elo, new_loser_elo), clamped to [ELO_MIN, ELO_MAX].
    """
    delta_w, delta_l = calculate_elo_change(winner_elo, loser_elo, winner_games, loser_games)
    return (
        min(ELO_MAX, winner_elo + delta_w),
        max(ELO_MIN, loser_elo + delta_l),
    )
