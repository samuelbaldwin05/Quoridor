from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from supabase import Client

from schemas.friendship import FriendshipRead, FriendshipStatus, FriendWithProfile


def get_friends(client: Client, user_id: UUID) -> list[FriendWithProfile]:
    """
    Return all friendships (pending or accepted) that involve user_id.

    Expects a ``friendships`` table with columns:
    id, requester_id, receiver_id, status, created_at.

    Also expects a ``users`` table with display_name and elo.
    The join is performed as two separate queries to stay compatible with
    the Supabase PostgREST client which does not support arbitrary JOINs
    directly.  For production, a database view is recommended.
    """
    try:
        uid = str(user_id)
        # Fetch friendships where the user is either side
        resp = (
            client.table("friendships")
            .select("id, requester_id, receiver_id, status")
            .or_(f"requester_id.eq.{uid},receiver_id.eq.{uid}")
            .neq("status", FriendshipStatus.BLOCKED)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching friends") from exc

    if not resp.data:
        return []

    # Determine the friend_id for each row and batch-fetch profiles
    friend_ids: list[str] = []
    row_map: dict[str, dict] = {}
    for row in resp.data:
        friend_id = row["receiver_id"] if row["requester_id"] == uid else row["requester_id"]
        friend_ids.append(friend_id)
        row_map[row["id"]] = {**row, "friend_id": friend_id}

    try:
        profiles_resp = (
            client.table("users")
            .select("id, display_name, elo")
            .in_("id", friend_ids)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching friend profiles") from exc

    profile_by_id = {p["id"]: p for p in profiles_resp.data}

    results: list[FriendWithProfile] = []
    for row in row_map.values():
        profile = profile_by_id.get(row["friend_id"])
        if profile is None:
            continue
        results.append(
            FriendWithProfile(
                friendship_id=row["id"],
                friend_id=row["friend_id"],
                display_name=profile["display_name"],
                elo=profile["elo"],
                status=FriendshipStatus(row["status"]),
            )
        )
    return results


def create_friendship(
    client: Client, requester_id: UUID, receiver_id: UUID
) -> FriendshipRead:
    """Insert a new pending friendship request."""
    payload = {
        "requester_id": str(requester_id),
        "receiver_id": str(receiver_id),
        "status": FriendshipStatus.PENDING,
    }
    try:
        resp = (
            client.table("friendships")
            .insert(payload)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error creating friendship") from exc

    if not resp.data:
        raise HTTPException(status_code=500, detail="Friendship insert returned no data")

    return FriendshipRead(**resp.data[0])


def accept_friendship(
    client: Client, friendship_id: UUID, user_id: UUID
) -> FriendshipRead:
    """
    Accept a pending friendship.

    Only the receiver (the user who received the request) may accept it.
    Raises 403 if the calling user is not the receiver.
    Raises 404 if the friendship does not exist.
    """
    fid = str(friendship_id)
    uid = str(user_id)

    # Fetch the record first to verify ownership
    try:
        fetch_resp = (
            client.table("friendships")
            .select("*")
            .eq("id", fid)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error fetching friendship") from exc

    if fetch_resp.data is None:
        raise HTTPException(status_code=404, detail="Friendship not found")

    record = fetch_resp.data
    if record["receiver_id"] != uid:
        raise HTTPException(status_code=403, detail="Only the receiver can accept a friendship request")

    try:
        update_resp = (
            client.table("friendships")
            .update({"status": FriendshipStatus.ACCEPTED})
            .eq("id", fid)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error accepting friendship") from exc

    if not update_resp.data:
        raise HTTPException(status_code=500, detail="Friendship update returned no data")

    return FriendshipRead(**update_resp.data[0])


def delete_friendship(
    client: Client, friendship_id: UUID, user_id: UUID
) -> None:
    """
    Delete (unfriend / cancel request) a friendship.

    Either party may delete the friendship.
    Raises 404 if the friendship does not exist or the user is not a party to it.
    """
    fid = str(friendship_id)
    uid = str(user_id)

    try:
        resp = (
            client.table("friendships")
            .delete()
            .eq("id", fid)
            .or_(f"requester_id.eq.{uid},receiver_id.eq.{uid}")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error deleting friendship") from exc

    if not resp.data:
        raise HTTPException(status_code=404, detail="Friendship not found or permission denied")
