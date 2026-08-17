from __future__ import annotations

from datetime import UTC, datetime
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
    BotGameCreate,
    BotGameRead,
    GameDetail,
    GameResultRequest,
    GameResultResponse,
    GameSummary,
    MoveSubmitRequest,
    MoveSubmitResponse,
)
from app.services.elo_service import update_elos

# A disconnect forfeit is only honored once the game has been quiet (no move) for at
# least this long. Turn ownership alone is not evidence of absence — it is the opponent's
# turn during normal play right after the caller moves — so a dwell requirement is what
# stops a losing player from moving and instantly claiming a free win. Kept below the
# frontend's 15s grace so a legitimate claim after that grace reliably passes.
DISCONNECT_FORFEIT_MIN_SECONDS = 12

# How far past zero the server's clock reconstruction must put the opponent before an
# "opponent_timeout" claim is honored. The reconstruction (games.time_used_p1/p2, charged
# per move) counts wall-clock, while the clients pause on opponent disconnect, so the
# server's figure is an upper bound on what a client shows. The margin keeps a claim from
# being honored on that discrepancy alone; a genuine flag clears it comfortably, since the
# claimant only makes the claim once their own view of the opponent's clock hit zero.
FLAG_CLAIM_MARGIN_SECONDS = 10


def _seconds_since(iso_timestamp: str | None) -> float | None:
    """Seconds elapsed since an ISO8601 timestamp (server clock), or None if unparseable."""
    if not iso_timestamp:
        return None
    try:
        ts = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=UTC)
    return (datetime.now(UTC) - ts).total_seconds()


def _resolve_flag_claim(game: dict, stored_history: list[str], caller_role: int) -> int:
    """Winner index for an "opponent_timeout" claim, or raise if it does not hold up.

    The claim is that the opponent's clock ran out. Three things have to agree before the
    caller is handed the win, none of them supplied by the caller:

    1. The game is actually on a clock and under way. Before the first move both clocks
       are held (the 20 second start grace covers that window instead), so there is no
       flag to fall.
    2. The opponent owes the move. A player cannot flag on someone else's turn, and this
       is the same guard the disconnect claim uses.
    3. The server's own reconstruction puts them past zero by FLAG_CLAIM_MARGIN_SECONDS:
       their consumed time plus the current turn's elapsed time exceeds the time control.
    """
    opponent_role = 1 - caller_role

    time_control = game.get("time_control")
    if not time_control:
        raise AuthorizationError("game has no clock to flag")
    if not stored_history:
        raise AuthorizationError("clocks do not start until the first move")

    state = replay(stored_history)
    if state.current_player_index != opponent_role:
        raise AuthorizationError("cannot claim a timeout while it is your move to make")

    used = game.get("time_used_p1" if opponent_role == 0 else "time_used_p2") or 0
    elapsed_this_turn = _seconds_since(game.get("last_move_at"))
    if elapsed_this_turn is None:
        raise AuthorizationError("cannot establish how long the current turn has run")

    remaining = time_control - used - elapsed_this_turn
    if remaining > -FLAG_CLAIM_MARGIN_SECONDS:
        raise AuthorizationError("opponent still has time on their clock")

    return caller_role


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

    # A new result can only finalize a live game. "finished" is handled above
    # (idempotent); "waiting"/"resigned" are not finalizable, so reject them
    # rather than let any branch below (including the disconnect win) act on a
    # game that never started.
    if game["status"] != "playing":
        raise InvalidMoveError("game is not in progress")

    # Resolve the AUTHORITATIVE winner from SERVER state, never the client. Moves
    # are recorded per-move via submit_move(), so game["move_history"] is the
    # source of truth:
    #   - "win": replay the server-stored history and confirm the claimed winner
    #     actually reached their goal row (rejects empty / illegal / forged).
    #   - "resign"/"timeout": the CALLER forfeits, so the opponent wins regardless
    #     of any client-supplied winner_index (you cannot resign and claim a win).
    #   - "disconnect": the caller reports the OPPONENT abandoned. The caller wins,
    #     but only if replaying the stored history shows it is the opponent's turn —
    #     i.e. the caller has already played and the absent player owes the next move.
    #     This keeps the outcome tied to server state rather than trusting the claim.
    #   - "opponent_timeout": the caller reports the OPPONENT flagged. Same shape as
    #     disconnect, checked against the server's own clock instead of a dwell.
    caller_role = 0 if caller_str == p1_id else 1
    stored_history = game.get("move_history") or []
    if body.reason == "win":
        validate_history_winner(stored_history, body.winner_index)  # type: ignore[arg-type]
        winner_index = body.winner_index
    elif body.reason == "disconnect":
        opponent_role = 1 - caller_role
        state = replay(stored_history)
        if state.current_player_index != opponent_role:
            raise AuthorizationError(
                "cannot claim a disconnect forfeit while it is your move to make"
            )
        # Liveness guard: the absent player must have been given the full quiet window to
        # move and not taken it. Without this, "it's their turn" is true during normal
        # play immediately after the caller moves, so a losing player could move and
        # instantly claim a win. A present opponent who moves within the window resets
        # last_move_at and cancels the claim.
        quiet_for = _seconds_since(game.get("last_move_at"))
        if quiet_for is None or quiet_for < DISCONNECT_FORFEIT_MIN_SECONDS:
            raise AuthorizationError(
                "opponent has not been idle long enough to forfeit by disconnect"
            )
        winner_index = caller_role
    elif body.reason == "opponent_timeout":
        winner_index = _resolve_flag_claim(game, stored_history, caller_role)
    else:
        winner_index = 1 if caller_str == p1_id else 0

    # games_played drives the provisional K taper. Read before the finalize RPC, which
    # is what increments it, so these are correctly the pre-game counts.
    cols = "elo, games_played"
    p1_resp = supabase.table("users").select(cols).eq("id", p1_id).limit(1).execute()
    p2_resp = supabase.table("users").select(cols).eq("id", p2_id).limit(1).execute()
    p1 = p1_resp.data[0] if p1_resp.data else None
    p2 = p2_resp.data[0] if p2_resp.data else None
    if not p1 or not p2:
        raise NotFoundError("player not found")

    if winner_index == 0:
        winner_id, loser_id = p1_id, p2_id
        winner_elo, loser_elo = p1["elo"], p2["elo"]
        winner_games, loser_games = p1.get("games_played", 0), p2.get("games_played", 0)
    else:
        winner_id, loser_id = p2_id, p1_id
        winner_elo, loser_elo = p2["elo"], p1["elo"]
        winner_games, loser_games = p2.get("games_played", 0), p1.get("games_played", 0)

    new_winner_elo, new_loser_elo = update_elos(winner_elo, loser_elo, winner_games, loser_games)

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


def record_bot_game(
    supabase: Client,
    body: BotGameCreate,
    caller_id: UUID,
) -> BotGameRead:
    """Persist a completed single-player bot game for the caller. HISTORY ONLY.

    Bot games are low-stakes and single-player, so this path deliberately does NOT
    touch Elo, ranked stats, leaderboards, or games_played, and does NOT validate the
    reported result or move history (there is no opponent and nothing at stake). The
    game is recorded as player1 = the authenticated user, player2 = NULL (the bot).

    Idempotent on client_game_id: a re-send (e.g. the login backfill) returns the
    already-stored row instead of inserting a duplicate.
    """
    existing = game_repository.get_bot_game_by_client_id(supabase, caller_id, body.client_game_id)
    if existing:
        return _to_bot_read(existing, created=False)

    caller_str = str(caller_id)
    payload = {
        "mode": "vs_ai",
        "status": "finished",
        "player1_id": caller_str,
        "player2_id": None,
        # winner_index 0 = the user; 1 = the bot, which has no user row so winner_id
        # stays NULL. Never resolves to a real opponent, so no ranked/Elo impact.
        "winner_id": caller_str if body.winner_index == 0 else None,
        "winner_index": body.winner_index,
        "ai_difficulty": body.ai_difficulty,
        "client_game_id": body.client_game_id,
        "move_history": body.move_history,
        "completed_at": datetime.now(UTC).isoformat(),
    }
    try:
        row = game_repository.insert_bot_game(supabase, payload)
    except ConflictError:
        # A concurrent duplicate won the race; return the stored row (idempotent).
        existing = game_repository.get_bot_game_by_client_id(
            supabase, caller_id, body.client_game_id
        )
        if existing:
            return _to_bot_read(existing, created=False)
        raise
    return _to_bot_read(row, created=True)


def _to_bot_read(row: dict, created: bool) -> BotGameRead:
    return BotGameRead(
        id=UUID(row["id"]),
        client_game_id=row["client_game_id"],
        ai_difficulty=row["ai_difficulty"],
        winner_index=row["winner_index"],
        status=row["status"],
        created=created,
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


def get_game_detail(supabase: Client, game_id: UUID, viewer_id: UUID | None = None) -> GameDetail:
    """A finished game for anyone, a live game only for the two people playing it.

    The public half is the replay viewer. The participant half is what a client that
    reloaded mid-game reads to rejoin, which is why it also carries the clocks. A live
    game answers "not found" to everyone else rather than admitting it exists, since the
    position of a game in progress is nobody else's business.
    """
    row = game_repository.get_game(supabase, game_id)
    if row is None:
        raise NotFoundError("game not found")

    viewer = str(viewer_id) if viewer_id else None
    is_participant = viewer is not None and viewer in (row.get("player1_id"), row.get("player2_id"))
    if row.get("status") != "finished" and not is_participant:
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
        elo_change_p1=row.get("elo_change_p1"),
        elo_change_p2=row.get("elo_change_p2"),
        completed_at=row.get("completed_at"),
        created_at=row["created_at"],
        time_used_p1=row.get("time_used_p1") if is_participant else None,
        time_used_p2=row.get("time_used_p2") if is_participant else None,
        last_move_at=row.get("last_move_at") if is_participant else None,
    )
