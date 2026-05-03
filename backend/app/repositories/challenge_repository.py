from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    DatabaseError,
    NotFoundError,
)
from app.repositories._pg_errors import is_unique_violation
from app.schemas.challenge import ChallengeRead


def _enrich(rows: list[dict], user_profiles: dict[str, dict]) -> list[ChallengeRead]:
    results = []
    for row in rows:
        challenger = user_profiles.get(row["challenger_id"], {})
        challenged = user_profiles.get(row["challenged_id"], {})
        results.append(
            ChallengeRead(
                id=row["id"],
                challenger_id=row["challenger_id"],
                challenged_id=row["challenged_id"],
                challenger_name=challenger.get("username") or challenger.get("display_name"),
                challenged_name=challenged.get("username") or challenged.get("display_name"),
                time_control=row["time_control"],
                status=row["status"],
                game_id=row.get("game_id"),
                created_at=row["created_at"],
            )
        )
    return results


def _fetch_profiles(client: Client, user_ids: list[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    resp = client.table("users").select("id, display_name, username").in_("id", user_ids).execute()
    return {p["id"]: p for p in resp.data}


def get_my_challenges(client: Client, user_id: UUID) -> list[ChallengeRead]:
    """Return challenges the caller still needs to act on.

    Includes pending challenges (either side) and accepted challenges I sent —
    the latter so the challenger's client can detect the acceptance, navigate
    to the game, then delete the row. Accepted challenges I received are
    excluded; that side already navigated when they hit Accept.
    """
    uid = str(user_id)
    try:
        client.rpc("expire_old_challenges", {}).execute()
    except Exception:
        pass

    try:
        resp = (
            client.table("challenges")
            .select("*")
            .or_(f"challenger_id.eq.{uid},challenged_id.eq.{uid}")
            .in_("status", ["pending", "accepted"])
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("challenges fetch failed") from exc

    rows = [
        row
        for row in (resp.data or [])
        if row["status"] == "pending" or row["challenger_id"] == uid
    ]
    if not rows:
        return []

    ids = list({row["challenger_id"] for row in rows} | {row["challenged_id"] for row in rows})
    profiles = _fetch_profiles(client, ids)
    return _enrich(rows, profiles)


def create_challenge(
    client: Client, challenger_id: UUID, challenged_id: UUID, time_control: int
) -> ChallengeRead:
    try:
        resp = (
            client.table("challenges")
            .insert(
                {
                    "challenger_id": str(challenger_id),
                    "challenged_id": str(challenged_id),
                    "time_control": time_control,
                    "status": "pending",
                }
            )
            .execute()
        )
    except Exception as exc:
        if is_unique_violation(exc):
            raise ConflictError("challenge already sent to this player") from exc
        raise DatabaseError("challenge create failed") from exc

    if not resp.data:
        raise DatabaseError("challenge insert returned no data")

    row = resp.data[0]
    profiles = _fetch_profiles(client, [str(challenger_id), str(challenged_id)])
    return _enrich([row], profiles)[0]


def accept_challenge(client: Client, challenge_id: UUID, user_id: UUID) -> ChallengeRead:
    """Accept challenge, create a game, and return the updated challenge with game_id.

    Backed by the public.accept_challenge() Postgres function so the
    state-check / game-insert / challenge-update happen in one transaction —
    eliminates the orphan-game race window we used to have.
    """
    try:
        client.rpc(
            "accept_challenge",
            {
                "p_challenge_id": str(challenge_id),
                "p_user_id": str(user_id),
            },
        ).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "not found" in msg or "p0002" in msg:
            raise NotFoundError("challenge not found") from exc
        if "only the challenged" in msg or "42501" in msg:
            raise AuthorizationError("only the challenged player can accept") from exc
        if "no longer pending" in msg or "40001" in msg:
            raise ConflictError("challenge is no longer pending") from exc
        raise DatabaseError("challenge accept failed") from exc

    # Re-fetch the updated row + profiles for the response.
    try:
        fetched = (
            client.table("challenges")
            .select("*")
            .eq("id", str(challenge_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("challenge re-fetch failed") from exc

    if not fetched.data:
        raise NotFoundError("challenge vanished after accept")

    row = fetched.data
    profiles = _fetch_profiles(client, [row["challenger_id"], row["challenged_id"]])
    return _enrich([row], profiles)[0]


def cancel_or_decline_challenge(client: Client, challenge_id: UUID, user_id: UUID) -> None:
    cid = str(challenge_id)
    uid = str(user_id)

    try:
        resp = (
            client.table("challenges")
            .delete()
            .eq("id", cid)
            .or_(f"challenger_id.eq.{uid},challenged_id.eq.{uid}")
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("challenge delete failed") from exc

    if not resp.data:
        raise NotFoundError("challenge not found or permission denied")


def cancel_challenges_for_user(client: Client, user_id: UUID) -> None:
    """Cancel all outgoing pending challenges when a user joins a game."""
    uid = str(user_id)
    try:
        client.table("challenges").delete().eq("challenger_id", uid).eq(
            "status", "pending"
        ).execute()
    except Exception:
        pass  # best-effort cleanup
