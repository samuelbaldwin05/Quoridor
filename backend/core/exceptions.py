class QuoridorError(Exception):
    """Base exception for all Quoridor domain errors."""


class NotFoundError(QuoridorError):
    """Requested resource does not exist."""


class InvalidMoveError(QuoridorError):
    """Move is not legal given the current game state."""


class AuthorizationError(QuoridorError):
    """Caller does not have permission to perform this action."""


class GameAlreadyFinishedError(QuoridorError):
    """Action attempted on a game that has already ended."""
