from __future__ import annotations

# Postgres SQLSTATE codes — https://www.postgresql.org/docs/current/errcodes-appendix.html
UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"
CHECK_VIOLATION = "23514"


def is_unique_violation(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code == UNIQUE_VIOLATION:
        return True
    msg = str(exc).lower()
    return "duplicate" in msg or "unique" in msg
