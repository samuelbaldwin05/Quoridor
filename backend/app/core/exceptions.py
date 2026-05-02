class QuoridorError(Exception):
    """Base exception for all Quoridor domain errors."""


class NotFoundError(QuoridorError):
    """Requested resource does not exist."""


class ConflictError(QuoridorError):
    """Action conflicts with current state (e.g. duplicate, already finished)."""


class InvalidMoveError(QuoridorError):
    """Move is not legal given the current game state."""


class DatabaseError(QuoridorError):
    """Unexpected database failure — surfaced as 500."""


class AuthorizationError(QuoridorError):
    """Caller does not have permission to perform this action."""


class GameAlreadyFinishedError(QuoridorError):
    """Action attempted on a game that has already ended."""
