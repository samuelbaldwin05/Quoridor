ELO_MIN = 200
ELO_MAX = 5000
ELO_START = 1000  # every new player's rating; mirrors the users.elo column default
# Rating units are double the classic chess scale: a 400-point classic gap is 800 here.
# The divisor and the K values are scaled together, so the dynamics are the textbook
# ones and only the units differ. Deltas read about twice as large as a result.
ELO_DIVISOR = 800
K_PROVISIONAL = 128  # K for a player's very first ranked game
K_BASE = 64  # K once a player is established
PROVISIONAL_GAMES = 20  # games over which K tapers from K_PROVISIONAL down to K_BASE
LOSS_MULTIPLIER = 1.05  # losses are 5% larger than the opponent's gain


def k_factor(games_played: int) -> float:
    """K for a player who has played `games_played` ranked games, tapering linearly
    from K_PROVISIONAL to K_BASE across their first PROVISIONAL_GAMES.

    New ratings need to travel from the shared 1000 start to wherever the player
    actually belongs; established ones should not lurch on a single result."""
    if games_played >= PROVISIONAL_GAMES:
        return K_BASE
    settled = max(0, games_played) / PROVISIONAL_GAMES
    return K_PROVISIONAL - (K_PROVISIONAL - K_BASE) * settled


def expected_score(rating_a: int, rating_b: int) -> float:
    """Expected score for player A against player B (0.0 to 1.0)."""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / ELO_DIVISOR))


def calculate_elo_change(
    winner_rating: int,
    loser_rating: int,
    winner_games: int = PROVISIONAL_GAMES,
    loser_games: int = PROVISIONAL_GAMES,
) -> tuple[int, int]:
    """
    Returns (winner_delta, loser_delta).

    winner_delta is a positive int representing how much the winner gains.
    loser_delta is a negative int representing how much the loser loses.

    Each side is scored with its own K, so the two deltas are not mirror images: a
    settled player beating a provisional one gains K_BASE-scale points while the
    newcomer drops on a larger K. Game counts default to "established", which is the
    conservative choice for any caller that does not track them.
    """
    expected_win = expected_score(winner_rating, loser_rating)
    winner_delta = round(k_factor(winner_games) * (1.0 - expected_win))
    loser_delta = round(k_factor(loser_games) * -(1.0 - expected_win) * LOSS_MULTIPLIER)
    return winner_delta, loser_delta


def update_elos(
    winner_elo: int,
    loser_elo: int,
    winner_games: int = PROVISIONAL_GAMES,
    loser_games: int = PROVISIONAL_GAMES,
) -> tuple[int, int]:
    """
    Returns (new_winner_elo, new_loser_elo), clamped to [ELO_MIN, ELO_MAX].
    """
    delta_w, delta_l = calculate_elo_change(winner_elo, loser_elo, winner_games, loser_games)
    return (
        min(ELO_MAX, winner_elo + delta_w),
        max(ELO_MIN, loser_elo + delta_l),
    )
