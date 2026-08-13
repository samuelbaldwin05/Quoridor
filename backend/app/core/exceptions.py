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


class ValidationError(QuoridorError):
    """Input failed a business validation rule — surfaced as 422."""


class CooldownError(QuoridorError):
    """Action attempted before a required cooldown elapsed — surfaced as 429."""


class EngineBusyError(QuoridorError):
    """Search engine is at its concurrency limit — surfaced as 503 with Retry-After.

    The client is expected to fall back to its own search rather than retry immediately.
    """


class EngineUnavailableError(QuoridorError):
    """Search engine is not installed, or returned nothing playable — surfaced as 503."""
