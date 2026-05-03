from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import (
    AuthorizationError,
    DatabaseError,
    InvalidMoveError,
    NotFoundError,
)
from app.engine import validate_history_winner
from app.schemas.game import GameResultRequest, GameResultResponse
from app.services.elo_service import update_elos


def record_game_result(
    supabase: Client,
    game_id: UUID,
    body: GameResultRequest,
    caller_id: UUID,
) -> GameResultResponse:
    """Finalize a game and update both players' ELO atomically.

    Pre-computes new ELOs in Python, then defers the lock+finish+ELO update to
    the public.submit_game_result() Postgres function so all three writes
    happen in one transaction. Idempotent: a second caller for an already
    finished game gets the stored result back.
    """
    result = supabase.table("games").select("*").eq("id", str(game_id)).limit(1).execute()
    if not result.data:
        raise NotFoundError("game not found")

    game = result.data[0]
    p1_id = game.get("player1_id")
    p2_id = game.get("player2_id")
    if not p1_id or not p2_id:
        raise InvalidMoveError("game missing player ids")

    caller_str = str(caller_id)
    if caller_str != p1_id and caller_str != p2_id:
        raise AuthorizationError("only game participants can submit a result")

    if body.winner_index not in (0, 1):
        raise InvalidMoveError("winner_index must be 0 or 1")

    # Replay the move history server-side and confirm the claimed winner. An
    # empty history is allowed (resignation / forfeit / legacy clients that
    # don't send history yet) — it skips the engine check.
    validate_history_winner(body.move_history, body.winner_index)  # type: ignore[arg-type]

    if game["status"] == "finished":
        return GameResultResponse(
            game_id=UUID(game["id"]),
            winner_id=UUID(game["winner_id"]),
            elo_change_p1=game.get("elo_change_p1") or 0,
            elo_change_p2=game.get("elo_change_p2") or 0,
            new_elo_p1=0,
            new_elo_p2=0,
        )

    p1_resp = supabase.table("users").select("elo,games_played").eq("id", p1_id).limit(1).execute()
    p2_resp = supabase.table("users").select("elo,games_played").eq("id", p2_id).limit(1).execute()
    p1 = p1_resp.data[0] if p1_resp.data else None
    p2 = p2_resp.data[0] if p2_resp.data else None
    if not p1 or not p2:
        raise NotFoundError("player not found")

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

    try:
        supabase.rpc(
            "submit_game_result",
            {
                "p_game_id": str(game_id),
                "p_winner_user_id": winner_id,
                "p_loser_user_id": loser_id,
                "p_winner_index": body.winner_index,
                "p_new_winner_elo": new_winner_elo,
                "p_new_loser_elo": new_loser_elo,
                "p_elo_change_p1": elo_change_p1,
                "p_elo_change_p2": elo_change_p2,
                "p_move_history": body.move_history,
            },
        ).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "not found" in msg or "p0002" in msg:
            raise NotFoundError("game vanished mid-finalize") from exc
        raise DatabaseError("game finalize failed") from exc

    return GameResultResponse(
        game_id=game_id,
        winner_id=UUID(winner_id),
        elo_change_p1=elo_change_p1,
        elo_change_p2=elo_change_p2,
        new_elo_p1=new_elo_p1,
        new_elo_p2=new_elo_p2,
    )
