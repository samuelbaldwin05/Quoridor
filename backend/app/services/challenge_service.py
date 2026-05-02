from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import ConflictError, InvalidMoveError
from app.repositories import challenge_repository
from app.schemas.challenge import ChallengeRead

ALLOWED_TIME_CONTROLS = {180, 300, 600}


def list_mine(client: Client, user_id: UUID) -> list[ChallengeRead]:
    return challenge_repository.get_my_challenges(client, user_id)


def send(
    client: Client, challenger_id: UUID, challenged_id: UUID, time_control: int,
) -> ChallengeRead:
    if challenger_id == challenged_id:
        raise ConflictError("cannot challenge yourself")
    if time_control not in ALLOWED_TIME_CONTROLS:
        raise InvalidMoveError(f"time_control must be one of {sorted(ALLOWED_TIME_CONTROLS)}")
    return challenge_repository.create_challenge(client, challenger_id, challenged_id, time_control)


def accept(client: Client, challenge_id: UUID, user_id: UUID) -> ChallengeRead:
    return challenge_repository.accept_challenge(client, challenge_id, user_id)


def cancel_or_decline(client: Client, challenge_id: UUID, user_id: UUID) -> None:
    challenge_repository.cancel_or_decline_challenge(client, challenge_id, user_id)
