from __future__ import annotations

from uuid import UUID

from supabase import Client

from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    DatabaseError,
    GameAlreadyFinishedError,
    InvalidMoveError,
    NotFoundError,
)
from app.engine import NotationError, apply_move, parse_move, replay, validate_history_winner
from app.repositories import game_repository
from app.schemas.game import (
    GameDetail,
    GameResultRequest,
    GameResultResponse,
    GameSummary,
    MoveSubmitRequest,
    MoveSubmitResponse,
)
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

    # Idempotent: a second/retry caller for an already-finished game gets the
    # stored result back without re-validating the payload.
    if game["status"] == "finished":
        winner_id = game.get("winner_id")
        if not winner_id:
            raise InvalidMoveError("finished game has no recorded winner")
        # Return the stored deltas plus each player's current absolute ELO so a
        # retry / second caller gets real values, not 0. (May be marginally stale
        # if a player has since finished another game, but never wrong in sign.)
        p1_cur = supabase.table("users").select("elo").eq("id", p1_id).limit(1).execute()
        p2_cur = supabase.table("users").select("elo").eq("id", p2_id).limit(1).execute()
        return GameResultResponse(
            game_id=UUID(game["id"]),
            winner_id=UUID(winner_id),
            elo_change_p1=game.get("elo_change_p1") or 0,
            elo_change_p2=game.get("elo_change_p2") or 0,
            new_elo_p1=(p1_cur.data[0]["elo"] if p1_cur.data else 0),
            new_elo_p2=(p2_cur.data[0]["elo"] if p2_cur.data else 0),
        )

    # Resolve the AUTHORITATIVE winner from SERVER state, never the client. Moves
    # are recorded per-move via submit_move(), so game["move_history"] is the
    # source of truth:
    #   - "win": replay the server-stored history and confirm the claimed winner
    #     actually reached their goal row (rejects empty / illegal / forged).
    #   - "resign"/"timeout": the CALLER forfeits, so the opponent wins regardless
    #     of any client-supplied winner_index (you cannot resign and claim a win).
    stored_history = game.get("move_history") or []
    if body.reason == "win":
        validate_history_winner(stored_history, body.winner_index)  # type: ignore[arg-type]
        winner_index = body.winner_index
    else:
        winner_index = 1 if caller_str == p1_id else 0

    p1_resp = supabase.table("users").select("elo").eq("id", p1_id).limit(1).execute()
    p2_resp = supabase.table("users").select("elo").eq("id", p2_id).limit(1).execute()
    p1 = p1_resp.data[0] if p1_resp.data else None
    p2 = p2_resp.data[0] if p2_resp.data else None
    if not p1 or not p2:
        raise NotFoundError("player not found")

    if winner_index == 0:
        winner_id, loser_id = p1_id, p2_id
        winner_elo, loser_elo = p1["elo"], p2["elo"]
    else:
        winner_id, loser_id = p2_id, p1_id
        winner_elo, loser_elo = p2["elo"], p1["elo"]

    new_winner_elo, new_loser_elo = update_elos(winner_elo, loser_elo)

    is_p1_winner = winner_index == 0
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
                "p_winner_index": winner_index,
                "p_new_winner_elo": new_winner_elo,
                "p_new_loser_elo": new_loser_elo,
                "p_elo_change_p1": elo_change_p1,
                "p_elo_change_p2": elo_change_p2,
                "p_move_history": stored_history,
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


def submit_move(
    supabase: Client,
    game_id: UUID,
    body: MoveSubmitRequest,
    caller_id: UUID,
) -> MoveSubmitResponse:
    """Server-authoritative move: validate against stored state and record it.

    The backend is the source of truth — it replays the game's stored move
    history, confirms it is the caller's turn, validates the move with the Python
    engine, then appends it atomically (optimistic-concurrency guarded RPC). The
    game is finalized separately via the result endpoint, which replays this same
    stored history.
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
        raise AuthorizationError("only game participants can submit a move")
    if game["status"] != "playing":
        raise GameAlreadyFinishedError("game is not in progress")

    stored_history = game.get("move_history") or []
    state = replay(stored_history)  # authoritative current state

    caller_role = 0 if caller_str == p1_id else 1
    if state.current_player_index != caller_role:
        raise AuthorizationError("not your turn")

    try:
        move = parse_move(body.notation)
    except NotationError as exc:
        raise InvalidMoveError(f"unrecognized move: {body.notation}") from exc
    outcome = apply_move(state, move)
    if not outcome.valid:
        raise InvalidMoveError("illegal move")

    # Append atomically: the RPC locks the game row and verifies the move count
    # hasn't advanced (optimistic concurrency) before appending. A mismatch means
    # the game state changed underneath us and the client must resync.
    try:
        supabase.rpc(
            "append_game_move",
            {
                "p_game_id": str(game_id),
                "p_move": body.notation,
                "p_expected_count": len(stored_history),
            },
        ).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "not found" in msg or "p0002" in msg:
            raise NotFoundError("game not found") from exc
        if "mismatch" in msg or "not in progress" in msg or "40001" in msg:
            raise ConflictError("game state changed; resync required") from exc
        raise DatabaseError("move append failed") from exc

    next_state = outcome.next_state
    return MoveSubmitResponse(
        move_number=len(stored_history) + 1,
        current_player_index=next_state.current_player_index,
        status=next_state.status,
        winner=next_state.winner,
    )


def _to_summary(row: dict, uid: str) -> GameSummary:
    """Map a raw game row to a summary from player `uid`'s perspective."""
    is_p1 = row.get("player1_id") == uid
    opponent_id = row.get("player2_id") if is_p1 else row.get("player1_id")
    opponent_name = row.get("player2_name") if is_p1 else row.get("player1_name")
    elo_change = row.get("elo_change_p1") if is_p1 else row.get("elo_change_p2")
    return GameSummary(
        id=UUID(row["id"]),
        mode=row["mode"],
        time_control=row.get("time_control"),
        opponent_id=UUID(opponent_id) if opponent_id else None,
        opponent_name=opponent_name,
        result="win" if row.get("winner_id") == uid else "loss",
        elo_change=elo_change,
        move_count=len(row.get("move_history") or []),
        completed_at=row.get("completed_at"),
    )


def list_user_games(
    supabase: Client, user_id: UUID, limit: int = 20, offset: int = 0
) -> list[GameSummary]:
    """A player's finished games (newest first), each from their own perspective."""
    rows = game_repository.list_finished_games_for_user(supabase, user_id, limit, offset)
    uid = str(user_id)
    return [_to_summary(row, uid) for row in rows]


def get_game_detail(supabase: Client, game_id: UUID) -> GameDetail:
    """Full record for replaying a finished game (public view)."""
    row = game_repository.get_game(supabase, game_id)
    if row is None:
        raise NotFoundError("game not found")
    return GameDetail(
        id=UUID(row["id"]),
        mode=row["mode"],
        status=row["status"],
        time_control=row.get("time_control"),
        player1_id=UUID(row["player1_id"]) if row.get("player1_id") else None,
        player2_id=UUID(row["player2_id"]) if row.get("player2_id") else None,
        player1_name=row.get("player1_name"),
        player2_name=row.get("player2_name"),
        winner_index=row.get("winner_index"),
        move_history=row.get("move_history") or [],
        completed_at=row.get("completed_at"),
        created_at=row["created_at"],
    )
