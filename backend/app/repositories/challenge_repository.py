from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from supabase import Client

from app.schemas.challenge import ChallengeRead


def _enrich(rows: list[dict], user_profiles: dict[str, dict]) -> list[ChallengeRead]:
    results = []
    for row in rows:
        challenger = user_profiles.get(row["challenger_id"], {})
        challenged = user_profiles.get(row["challenged_id"], {})
        results.append(ChallengeRead(
            id=row["id"],
            challenger_id=row["challenger_id"],
            challenged_id=row["challenged_id"],
            challenger_name=challenger.get("username") or challenger.get("display_name"),
            challenged_name=challenged.get("username") or challenged.get("display_name"),
            time_control=row["time_control"],
            status=row["status"],
            game_id=row.get("game_id"),
            created_at=row["created_at"],
        ))
    return results


def _fetch_profiles(client: Client, user_ids: list[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    resp = client.table("users").select("id, display_name, username").in_("id", user_ids).execute()
    return {p["id"]: p for p in resp.data}


def get_my_challenges(client: Client, user_id: UUID) -> list[ChallengeRead]:
    uid = str(user_id)
    try:
        resp = (
            client.table("challenges")
            .select("*")
            .or_(f"challenger_id.eq.{uid},challenged_id.eq.{uid}")
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching challenges") from exc

    if not resp.data:
        return []

    ids = list({row["challenger_id"] for row in resp.data} | {row["challenged_id"] for row in resp.data})
    profiles = _fetch_profiles(client, ids)
    return _enrich(resp.data, profiles)


def create_challenge(
    client: Client, challenger_id: UUID, challenged_id: UUID, time_control: int
) -> ChallengeRead:
    try:
        resp = (
            client.table("challenges")
            .insert({
                "challenger_id": str(challenger_id),
                "challenged_id": str(challenged_id),
                "time_control": time_control,
                "status": "pending",
            })
            .execute()
        )
    except Exception as exc:
        msg = str(exc)
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail="Challenge already sent to this player")
        raise HTTPException(status_code=500, detail="Database error creating challenge") from exc

    if not resp.data:
        raise HTTPException(status_code=500, detail="Challenge insert returned no data")

    row = resp.data[0]
    ids = [str(challenger_id), str(challenged_id)]
    profiles = _fetch_profiles(client, ids)
    return _enrich([row], profiles)[0]


def accept_challenge(client: Client, challenge_id: UUID, user_id: UUID) -> ChallengeRead:
    """Accept challenge, create a game, and return the updated challenge with game_id."""
    cid = str(challenge_id)
    uid = str(user_id)

    # Fetch the challenge
    try:
        fetch = client.table("challenges").select("*").eq("id", cid).maybe_single().execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching challenge") from exc

    if not fetch.data:
        raise HTTPException(status_code=404, detail="Challenge not found")

    row = fetch.data
    if row["challenged_id"] != uid:
        raise HTTPException(status_code=403, detail="Only the challenged player can accept")
    if row["status"] != "pending":
        raise HTTPException(status_code=409, detail="Challenge is no longer pending")

    # Create a game for the two players
    try:
        game_resp = (
            client.table("games")
            .insert({
                "player1_id": row["challenger_id"],
                "player2_id": row["challenged_id"],
                "mode": "casual",
                "status": "playing",
                "time_control": row["time_control"],
            })
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error creating game") from exc

    game_id = game_resp.data[0]["id"]

    # Update challenge to accepted with game_id
    try:
        update = (
            client.table("challenges")
            .update({"status": "accepted", "game_id": game_id})
            .eq("id", cid)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error accepting challenge") from exc

    updated_row = update.data[0]
    ids = [updated_row["challenger_id"], updated_row["challenged_id"]]
    profiles = _fetch_profiles(client, ids)
    return _enrich([updated_row], profiles)[0]


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
        raise HTTPException(status_code=500, detail="Database error deleting challenge") from exc

    if not resp.data:
        raise HTTPException(status_code=404, detail="Challenge not found or permission denied")


def cancel_challenges_for_user(client: Client, user_id: UUID) -> None:
    """Cancel all outgoing pending challenges when a user joins a game."""
    uid = str(user_id)
    try:
        client.table("challenges").delete().eq("challenger_id", uid).eq("status", "pending").execute()
    except Exception:
        pass  # best-effort cleanup
