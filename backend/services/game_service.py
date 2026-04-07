from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from supabase import Client

from schemas.game import GameResultRequest, GameResultResponse
from services.elo_service import update_elos


def record_game_result(
    supabase: Client,
    game_id: UUID,
    body: GameResultRequest,
) -> GameResultResponse:
    result = (
        supabase.table("games")
        .select("*")
        .eq("id", str(game_id))
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Game not found")

    game = result.data[0]

    # Idempotent — already finished, return stored result
    if game["status"] == "finished":
        return GameResultResponse(
            game_id=UUID(game["id"]),
            winner_id=UUID(game["winner_id"]),
            elo_change_p1=game.get("elo_change_p1") or 0,
            elo_change_p2=game.get("elo_change_p2") or 0,
            new_elo_p1=0,
            new_elo_p2=0,
        )

    p1_id = game.get("player1_id")
    p2_id = game.get("player2_id")
    if not p1_id or not p2_id:
        raise HTTPException(status_code=400, detail="Game missing player IDs")

    p1_resp = supabase.table("users").select("elo,games_played").eq("id", p1_id).limit(1).execute()
    p2_resp = supabase.table("users").select("elo,games_played").eq("id", p2_id).limit(1).execute()
    p1 = p1_resp.data[0] if p1_resp.data else None
    p2 = p2_resp.data[0] if p2_resp.data else None
    if not p1 or not p2:
        raise HTTPException(status_code=404, detail="Player not found")

    # Determine winner/loser based on winner_index (0 = player1, 1 = player2)
    if body.winner_index == 0:
        winner_id, loser_id = p1_id, p2_id
        winner_elo, loser_elo = p1["elo"], p2["elo"]
        winner_games, loser_games = p1["games_played"], p2["games_played"]
    else:
        winner_id, loser_id = p2_id, p1_id
        winner_elo, loser_elo = p2["elo"], p1["elo"]
        winner_games, loser_games = p2["games_played"], p1["games_played"]

    new_winner_elo, new_loser_elo = update_elos(winner_elo, loser_elo, winner_games, loser_games)

    is_p1_winner = body.winner_index == 0
    elo_change_p1 = (new_winner_elo - winner_elo) if is_p1_winner else (new_loser_elo - loser_elo)
    elo_change_p2 = (new_loser_elo - loser_elo) if is_p1_winner else (new_winner_elo - winner_elo)
    new_elo_p1 = new_winner_elo if is_p1_winner else new_loser_elo
    new_elo_p2 = new_loser_elo if is_p1_winner else new_winner_elo
    now = datetime.now(UTC).isoformat()

    # Atomic finish — only updates if not already finished (prevents double-submit race)
    update_result = (
        supabase.table("games")
        .update({
            "status": "finished",
            "winner_id": winner_id,
            "elo_change_p1": elo_change_p1,
            "elo_change_p2": elo_change_p2,
            "move_history": body.move_history,
            "completed_at": now,
        })
        .eq("id", str(game_id))
        .neq("status", "finished")
        .execute()
    )

    # If no rows updated, game was already finished by the other player's client
    if not update_result.data:
        return GameResultResponse(
            game_id=game_id,
            winner_id=UUID(winner_id),
            elo_change_p1=elo_change_p1,
            elo_change_p2=elo_change_p2,
            new_elo_p1=new_elo_p1,
            new_elo_p2=new_elo_p2,
        )

    # Update ELO and games_played for both players
    supabase.table("users").update({
        "elo": new_winner_elo,
        "games_played": winner_games + 1,
    }).eq("id", winner_id).execute()

    supabase.table("users").update({
        "elo": new_loser_elo,
        "games_played": loser_games + 1,
    }).eq("id", loser_id).execute()

    return GameResultResponse(
        game_id=game_id,
        winner_id=UUID(winner_id),
        elo_change_p1=elo_change_p1,
        elo_change_p2=elo_change_p2,
        new_elo_p1=new_elo_p1,
        new_elo_p2=new_elo_p2,
    )
