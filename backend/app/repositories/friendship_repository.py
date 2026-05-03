from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import AuthorizationError, DatabaseError, NotFoundError
from app.schemas.friendship import FriendshipRead, FriendshipStatus, FriendWithProfile


def get_friends(client: Client, user_id: UUID) -> list[FriendWithProfile]:
    """Return all friendships (pending or accepted) involving user_id."""
    try:
        uid = str(user_id)
        resp = (
            client.table("friendships")
            .select("id, requester_id, receiver_id, status")
            .or_(f"requester_id.eq.{uid},receiver_id.eq.{uid}")
            .neq("status", FriendshipStatus.BLOCKED)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("friendships fetch failed") from exc

    if not resp.data:
        return []

    friend_ids: list[str] = []
    row_map: dict[str, dict] = {}
    for row in resp.data:
        friend_id = row["receiver_id"] if row["requester_id"] == uid else row["requester_id"]
        friend_ids.append(friend_id)
        row_map[row["id"]] = {**row, "friend_id": friend_id}

    try:
        profiles_resp = (
            client.table("users")
            .select("id, display_name, username, elo")
            .in_("id", friend_ids)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("friend profiles fetch failed") from exc

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
                requester_id=row["requester_id"],
                display_name=profile["display_name"],
                username=profile.get("username"),
                elo=profile["elo"],
                status=FriendshipStatus(row["status"]),
            )
        )
    return results


def create_friendship(client: Client, requester_id: UUID, receiver_id: UUID) -> FriendshipRead:
    """Insert a new pending friendship request."""
    payload = {
        "requester_id": str(requester_id),
        "receiver_id": str(receiver_id),
        "status": FriendshipStatus.PENDING,
    }
    try:
        resp = client.table("friendships").insert(payload).execute()
    except Exception as exc:
        raise DatabaseError("friendship create failed") from exc

    if not resp.data:
        raise DatabaseError("friendship insert returned no data")

    return FriendshipRead(**resp.data[0])


def accept_friendship(client: Client, friendship_id: UUID, user_id: UUID) -> FriendshipRead:
    """Accept a pending friendship. Only the receiver may accept."""
    fid = str(friendship_id)
    uid = str(user_id)

    try:
        fetch_resp = client.table("friendships").select("*").eq("id", fid).maybe_single().execute()
    except Exception as exc:
        raise DatabaseError("friendship fetch failed") from exc

    if fetch_resp.data is None:
        raise NotFoundError("friendship not found")

    if fetch_resp.data["receiver_id"] != uid:
        raise AuthorizationError("only the receiver can accept a friendship request")

    try:
        update_resp = (
            client.table("friendships")
            .update({"status": FriendshipStatus.ACCEPTED})
            .eq("id", fid)
            .execute()
        )
    except Exception as exc:
        raise DatabaseError("friendship accept failed") from exc

    if not update_resp.data:
        raise DatabaseError("friendship update returned no data")

    return FriendshipRead(**update_resp.data[0])


def delete_friendship(client: Client, friendship_id: UUID, user_id: UUID) -> None:
    """Delete (unfriend / cancel request). Either party may delete."""
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
        raise DatabaseError("friendship delete failed") from exc

    if not resp.data:
        raise NotFoundError("friendship not found or permission denied")
