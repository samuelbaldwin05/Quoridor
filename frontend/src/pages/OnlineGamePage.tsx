import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DevStats } from '@/components/DevStats';
import { FencePanel } from '@/components/FencePanel';
import { GameBoard } from '@/components/GameBoard';
import { GameCard } from '@/components/GameCard';
import { MoveListPanel } from '@/components/MoveListPanel';
import { NavSidebar } from '@/components/NavSidebar';
import { SettingsModal } from '@/components/SettingsModal';
import { applyMove } from '@/engine/gameEngine';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import { wallsEqual } from '@/engine/wallUtils';
import { replayToIndex } from '@/engine/moveDisplay';
import { serializeMove } from '@/engine/notation';
import type { GameState, Move, PlayerIndex, Position, Wall } from '@/engine/gameTypes';
import { useAuth } from '@/hooks/useAuth';
import { useGame } from '@/hooks/useGame';
import { useKeyboard, type KeyAction } from '@/hooks/useKeyboard';
import { useOnlineGame, type ResultReason } from '@/hooks/useOnlineGame';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { ApiHttpError, apiFetch } from '@/lib/api';
import { STARTING_ELO } from '@/lib/elo';
import { clocksFrom, toStoredMoves, type GameSnapshot } from '@/lib/onlineGameSnapshot';
import { saveGame } from '@/lib/gameStorage';

// ── helpers ───────────────────────────────────────────────────────────────────

// How long an opponent may stay disconnected mid-game before it resolves as their
// forfeit. A reconnect within the window cancels it. Separate from the 20s start grace.
const DISCONNECT_GRACE_MS = 15000;
// Debounce before surfacing the "waiting/reconnecting" status, so a brief presence gap
// during the start handshake or a blip doesn't flash the notice.
const WAITING_DEBOUNCE_MS = 4000;
// How many times a broadcast this client cannot apply may send it back to the server for
// the authoritative history before the game is written off as genuinely desynced.
const MAX_RESYNCS = 2;
// How long the opponent's clock must sit at zero before this client claims the flag. The
// server only honours a claim once its own reconstruction puts them FLAG_CLAIM_MARGIN_
// SECONDS past zero, and at 0:00 the two clocks agree, so claiming on the tick would be
// rejected. Same shape as the disconnect grace sitting above the server's dwell.
const FLAG_CLAIM_GRACE_MS = 14000;
// A claim the other side made is verified against the server, not believed. It may take a
// moment to land there (the claimant retries a failed POST), so ask more than once.
const FORFEIT_CHECK_DELAYS_MS = [0, 2000, 5000];

// Why a game ended with no result. The overlay used to say "no move within 20 seconds"
// whatever had happened, which was the wrong story for three of these four.
type AbortReason = 'start-grace' | 'desync' | 'abandoned' | 'missing';
const ABORT_MESSAGE: Record<AbortReason, string> = {
  'start-grace': 'No move within 20 seconds. ELO unchanged.',
  desync: 'This game went out of step between the two players and was stopped. ELO unchanged.',
  abandoned: 'This game was left unfinished and has been closed. ELO unchanged.',
  missing: 'This game could not be found. It may have finished a long time ago.',
};

/** A tap waiting on its confirming second tap. Mirrors useBoardInteraction's version;
 *  the online page runs its own interaction handlers because every move goes through the
 *  backend before it is applied. */
type PendingIntent =
  | { kind: 'wall'; wall: Wall; atMove: number }
  | { kind: 'pawn'; to: Position; atMove: number };

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── component ─────────────────────────────────────────────────────────────────

export function OnlineGamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, refreshProfile, isLoading: authLoading } = useAuth();

  // The URL is how a game is opened, not what it is. Everything here except the opponent's
  // rating is confirmed against the server during the bootstrap below, so a reload, a
  // pasted link or a hand-edited role all end up playing the game the server has.
  const opponentElo = parseInt(searchParams.get('opponentElo') ?? String(STARTING_ELO));
  const [myRole, setMyRole] = useState<0 | 1>(
    () => (parseInt(searchParams.get('role') ?? '0') === 1 ? 1 : 0) as 0 | 1,
  );
  const [opponentName, setOpponentName] = useState(
    () => searchParams.get('opponent') ?? 'Opponent',
  );
  const [timeControl, setTimeControl] = useState(() => parseInt(searchParams.get('tc') ?? '300'));
  const myUserId = profile?.id ?? '';

  const { state, dispatch } = useGame();
  // Read inside applySnapshot, which must not re-run every time the role settles.
  const myRoleRef = useRef(myRole);
  useEffect(() => {
    myRoleRef.current = myRole;
  }, [myRole]);
  // The tap awaiting its confirming second tap, tagged with the move it was made on (see
  // activeWall). Fences and pawn moves share the slot: you are proposing one move.
  const [pending, setPending] = useState<PendingIntent | null>(null);

  // Always-current ref to game state — lets onMoveReceived validate without stale closures
  const gameStateRef = useRef<GameState>(state.game);
  useEffect(() => {
    gameStateRef.current = state.game;
  }, [state.game]);

  // Cosmetic history viewing (does NOT affect actual game state)
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  // Per-player countdown timers [player0Time, player1Time]
  const [times, setTimes] = useState<[number, number]>([timeControl, timeControl]);
  const timesRef = useRef<[number, number]>([timeControl, timeControl]);

  const [showSettings, setShowSettings] = useState(false);
  const [confirmMoves, setConfirmMoves] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  );

  useTheme(state.settings.theme);
  const audio = useAudio(state.settings.soundEnabled, state.settings.volume);

  const [aborted, setAborted] = useState(false);
  const [abortReason, setAbortReason] = useState<AbortReason>('start-grace');
  const abortGame = useCallback((reason: AbortReason) => {
    setAbortReason(reason);
    setAborted(true);
  }, []);

  // Debounced "opponent not present" flag. Only true after the opponent has been
  // absent for WAITING_DEBOUNCE_MS, so the brief gap while their client finishes the
  // start handshake (clocks still end up synced) doesn't flash a waiting notice.
  const [waitingDebounced, setWaitingDebounced] = useState(false);

  // Why the game ended + whether THIS client should submit the result. For a board
  // win either client can submit (the history proves it); for resign/timeout only
  // the forfeiting player may, since the backend records the caller as the loser.
  // For "disconnect" the present player submits and the backend awards them the win,
  // but only if it is genuinely the absent player's turn (server turn-guard).
  const terminalRef = useRef<{
    reason: ResultReason;
    mine: boolean;
  } | null>(null);

  // Lets onMoveReceived (defined below, before the hook returns broadcastAbort)
  // reach broadcastAbort once it's available.
  const broadcastAbortRef = useRef<() => void>(() => {});

  // Whether this client has the server's history yet, and the broadcasts that arrived
  // while it did not (or that did not fit it). Replayed once a snapshot lands.
  const readyRef = useRef(false);
  const queuedMovesRef = useRef<{ move: Move; playerIndex: PlayerIndex }[]>([]);

  const {
    result,
    connectionStatus,
    opponentConnected,
    submitMove,
    broadcastMove,
    broadcastResign,
    broadcastTimeout,
    broadcastForfeit,
    broadcastAbort,
    submitResult,
    retrySubmitResult,
    observeResult,
  } = useOnlineGame({
    gameId: gameId ?? '',
    myRole,
    myUserId,
    onMoveReceived: useCallback(
      (move: Move, playerIndex: PlayerIndex) => {
        // Hold anything that arrives before the bootstrap has the server's history:
        // judged against an empty board it would look illegal, and dropping it would
        // leave this client a move behind for the rest of the game.
        if (!readyRef.current) {
          queuedMovesRef.current.push({ move, playerIndex });
          return;
        }
        // A move that doesn't fit is usually a desync rather than a cheat, so ask the
        // server who is right before writing the game off. Only if the server's own
        // history still doesn't accept it do we abort both clients (no ELO), telling the
        // sender via a terminal broadcast so they converge instead of hanging.
        const validation = applyMove(gameStateRef.current, move);
        if (!validation.valid) {
          queuedMovesRef.current.push({ move, playerIndex });
          void resyncRef.current();
          return;
        }

        dispatch({ type: 'APPLY_ONLINE_MOVE', move, playerIndex });
        setViewIndex(null);
      },
      [dispatch],
    ),
    onOpponentResigned: useCallback(() => {
      terminalRef.current = { reason: 'resign', mine: false };
      dispatch({ type: 'RESIGN_ONLINE', winner: myRole });
    }, [dispatch, myRole]),
    onOpponentTimeout: useCallback(() => {
      terminalRef.current = { reason: 'timeout', mine: false };
      dispatch({ type: 'RESIGN_ONLINE', winner: myRole });
    }, [dispatch, myRole]),
    onOpponentAborted: useCallback(() => {
      // The other client could not reconcile with ours. Same event, other side of it.
      abortGame('desync');
    }, [abortGame]),
    onOpponentClaimedWin: useCallback(() => {
      // They say they have won on our clock or our absence. Go and read the game rather
      // than take their word for it: if the server agrees, the snapshot says so.
      void checkForForfeitRef.current();
    }, []),
  });

  // Adopt the server's copy of the game. This is the difference between opening a game
  // and REJOINING one: a reload, a crash or a phone waking up all land here with an empty
  // board, and before this they simply played on from move one, desynced, until the first
  // broadcast they could not apply voided the game for both players.
  const applySnapshot = useCallback(
    (snapshot: GameSnapshot) => {
      const moves = toStoredMoves(snapshot.move_history);
      const tc = snapshot.time_control ?? timeControl;
      // Which side we are is the server's to say, but only if it knows who is asking: a
      // profile that failed to load leaves the URL's role as the best guess available.
      const role: 0 | 1 = myUserId ? (snapshot.player2_id === myUserId ? 1 : 0) : myRoleRef.current;
      const oppName = (role === 0 ? snapshot.player2_name : snapshot.player1_name) ?? null;

      setMyRole(role);
      setTimeControl(tc);
      if (oppName) setOpponentName(oppName);
      const clocks = clocksFrom(snapshot, tc);
      setTimes(clocks);
      timesRef.current = clocks;
      dispatch({ type: 'RESTORE_ONLINE_GAME', moves });

      if (snapshot.status === 'playing') return;

      if (snapshot.winner_index !== null) {
        // Already decided. Show the outcome and read back the Elo it moved, rather than
        // letting the result effect try to submit a result the server already has.
        terminalRef.current = { reason: 'win', mine: false };
        observeResult(snapshot.winner_index as 0 | 1);
        dispatch({ type: 'RESIGN_ONLINE', winner: snapshot.winner_index as 0 | 1 });
      } else {
        // Finished with no winner is an abandoned game the sweep retired (migration 023).
        abortGame('abandoned');
      }
    },
    [dispatch, myUserId, timeControl, observeResult, abortGame],
  );

  // Read the server's copy of the game and adopt it. Returns its status so a caller can
  // tell "still going" from "over", or null if the server could not be reached.
  const refreshFromServer = useCallback(async (): Promise<GameSnapshot['status'] | null> => {
    try {
      const snapshot = await apiFetch<GameSnapshot>(`/games/${gameId}`);
      applySnapshot(snapshot);
      return snapshot.status;
    } catch {
      return null;
    }
  }, [gameId, applySnapshot]);

  // Re-read the server's history when a broadcast doesn't fit ours. Bounded: a client that
  // cannot be reconciled twice is genuinely desynced and falls through to the abort.
  const resyncCountRef = useRef(0);
  const resyncRef = useRef<() => Promise<void>>(async () => {});
  const resync = useCallback(async () => {
    if (resyncCountRef.current >= MAX_RESYNCS) {
      broadcastAbortRef.current();
      abortGame('desync');
      return;
    }
    resyncCountRef.current += 1;
    const status = await refreshFromServer();
    if (status === null) {
      broadcastAbortRef.current();
      abortGame('desync');
      return;
    }
    // Whatever queued is either already in that history or older than it.
    queuedMovesRef.current = [];
  }, [refreshFromServer, abortGame]);
  useEffect(() => {
    resyncRef.current = resync;
  }, [resync]);

  // The opponent says they have claimed the win. Their claim is only true once the server
  // has it, and they may still be retrying a failed POST, so ask a few times before
  // letting it go. If the server never agrees, nothing here changes and play continues.
  const checkForForfeitRef = useRef<() => Promise<void>>(async () => {});
  const checkForForfeit = useCallback(async () => {
    for (const delay of FORFEIT_CHECK_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const status = await refreshFromServer();
      if (status !== null && status !== 'playing') return;
    }
  }, [refreshFromServer]);
  useEffect(() => {
    checkForForfeitRef.current = checkForForfeit;
  }, [checkForForfeit]);

  // Coming back to a tab that was away: it may have missed moves, or the game may have
  // ended without it (a flag claim it never received). Ask instead of assuming. This is
  // the recovery for the case the flag claim exists to handle, seen from the losing side.
  useEffect(() => {
    if (state.game.status !== 'playing' || aborted || result !== null) return;
    const onVisibilityChange = () => {
      if (!document.hidden) void refreshFromServer();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [state.game.status, aborted, result, refreshFromServer]);

  // Guarded so the one-time side effects (DELETE, start sound) fire exactly once even
  // under StrictMode's dev double-invoke. Held until auth settles, because the snapshot
  // is what tells this client which side it is playing, and that needs its user id.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || authLoading) return;
    startedRef.current = true;
    void (async () => {
      try {
        const snapshot = await apiFetch<GameSnapshot>(`/games/${gameId}`);
        applySnapshot(snapshot);
      } catch (err) {
        if (err instanceof ApiHttpError && err.status === 404) {
          // No such game, or not one of ours. Starting a fresh board here would put the
          // player in a game that exists nowhere but their screen.
          abortGame('missing');
        } else {
          // Could not reach the server. Fall back to the fresh start this page always
          // used to assume, so a brand new game is still playable.
          dispatch({ type: 'START_GAME' });
        }
      }
      readyRef.current = true;
      // The reducer validates each one against the restored history and ignores anything
      // that no longer applies, which is the right answer for a move already in it.
      for (const { move, playerIndex } of queuedMovesRef.current) {
        dispatch({ type: 'APPLY_ONLINE_MOVE', move, playerIndex });
      }
      queuedMovesRef.current = [];
      void apiFetch('/matchmaking/leave', { method: 'DELETE' }).catch(() => {});
      // Only for a game that is actually starting. Rejoining one in progress should not
      // sound like a new game.
      if (gameStateRef.current.status !== 'playing' || state.moveHistory.length === 0) {
        audio.playStart();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Play the appropriate sound on every appended move (any player, any kind).
  const prevMoveCountRef = useRef(state.moveHistory.length);
  useEffect(() => {
    const prev = prevMoveCountRef.current;
    const next = state.moveHistory.length;
    prevMoveCountRef.current = next;
    if (next <= prev) return;
    const last = state.moveHistory[next - 1];
    if (!last) return;
    if (last.move.kind === 'wall') audio.playWall();
    else audio.playMove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.moveHistory.length]);

  // Submit result when game finishes (skipped if aborted — no ELO change either way).
  // Board win: send the full move history so the backend can replay + confirm the
  // winner. Resign/timeout: only the forfeiting player submits (caller = loser); the
  // winner observes instead, and observeResult reads the delta back off the game once
  // that write lands. Claims the caller makes about the opponent (disconnect,
  // opponent_timeout) are `mine`, so this client submits them and the server checks them.
  useEffect(() => {
    if (aborted) return;
    if (state.game.status === 'finished' && result === null) {
      const winner = state.game.winner as 0 | 1;
      const terminal = terminalRef.current ?? { reason: 'win' as const, mine: true };
      const savedId = saveGame(state.moveHistory, winner, opponentName, myRole);
      if (terminal.reason === 'win' || terminal.mine) {
        const history = state.moveHistory.map((sm) => serializeMove(sm.move));
        void submitResult(winner, terminal.reason, history, timesRef.current, savedId).then(() =>
          refreshProfile(),
        );
      } else {
        observeResult(winner, savedId);
        void refreshProfile();
      }
      if (winner === myRole) audio.playWin();
      else audio.playLose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.game.status, state.game.winner, aborted]);

  // Per-player countdown timer. Paused until the first move is made — gives
  // the starting player a 20s grace window (handled by the abort effect below).
  useEffect(() => {
    if (state.game.status !== 'playing') return;
    if (state.moveHistory.length === 0) return;
    if (aborted) return;
    // Pause the clock while the opponent is disconnected — input is gated on
    // opponentConnected too, so the clock must not tick toward a timeout the
    // player can't act on. Resumes on reconnect.
    if (!opponentConnected) return;
    const current = state.game.currentPlayerIndex as 0 | 1;
    const t = setInterval(() => {
      setTimes((prev) => {
        const next: [number, number] = [prev[0], prev[1]];
        next[current] = Math.max(0, next[current] - 1);
        timesRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [
    state.game.status,
    state.game.currentPlayerIndex,
    state.moveHistory.length,
    aborted,
    opponentConnected,
  ]);

  // 20s grace window: if the starter doesn't make the first move in time, abort
  // the game on both clients. Neither side submits a result, so no ELO moves.
  useEffect(() => {
    if (state.game.status !== 'playing') return;
    if (state.moveHistory.length > 0) return;
    if (aborted) return;
    const t = setTimeout(() => {
      abortGame('start-grace');
      broadcastAbort();
    }, 20000);
    return () => clearTimeout(t);
  }, [state.game.status, state.moveHistory.length, aborted, broadcastAbort, abortGame]);

  // Detect MY clock hitting 0 → broadcast timeout to the opponent + record loss locally.
  // Only the player whose clock ran out fires this; the opponent receives via the
  // 'timeout' realtime event and dispatches the win for themselves.
  useEffect(() => {
    if (state.game.status !== 'playing') return;
    if (times[myRole] > 0) return;
    if (aborted) return;
    broadcastTimeout();
    const opponent: 0 | 1 = myRole === 0 ? 1 : 0;
    terminalRef.current = { reason: 'timeout', mine: true };
    dispatch({ type: 'RESIGN_ONLINE', winner: opponent });
  }, [times, myRole, state.game.status, aborted, broadcastTimeout, dispatch]);

  // Detect the OPPONENT's clock hitting 0 and claim it. The effect above only fires on
  // the clock of whoever is running the tab, so a player whose tab is backgrounded (where
  // browsers throttle timers to a crawl), asleep or closed never reports their own flag,
  // and the game used to hang at 0:00 with no way to end it. The server does not take the
  // claim on trust: it checks its own per-move clock reconstruction and that the opponent
  // owes the move (see game_service._resolve_flag_claim).
  const opponentRole: 0 | 1 = myRole === 0 ? 1 : 0;
  // A boolean, not the times array: the array is rebuilt every tick, and depending on it
  // would clear and re-arm the grace timer once a second, so it would never fire.
  const opponentOutOfTime = times[opponentRole] <= 0;
  useEffect(() => {
    if (state.game.status !== 'playing') return;
    if (aborted || result !== null) return;
    if (!opponentOutOfTime) return;
    if (state.moveHistory.length === 0) return; // clocks are held until the game is under way
    if (state.game.currentPlayerIndex !== opponentRole) return;
    const t = setTimeout(() => {
      terminalRef.current = { reason: 'opponent_timeout', mine: true };
      broadcastForfeit();
      dispatch({ type: 'RESIGN_ONLINE', winner: myRole });
    }, FLAG_CLAIM_GRACE_MS);
    return () => clearTimeout(t);
  }, [
    opponentOutOfTime,
    myRole,
    opponentRole,
    result,
    state.game.status,
    state.game.currentPlayerIndex,
    state.moveHistory.length,
    aborted,
    dispatch,
    broadcastForfeit,
  ]);

  // Sustained opponent disconnect -> forfeit. If the opponent stays absent for
  // DISCONNECT_GRACE_MS mid-game while it is THEIR turn to move, record a win via the
  // server (reason "disconnect"; the backend awards it only because its own replay
  // confirms it is the absent player's turn). A reconnect flips opponentConnected back
  // and this effect's cleanup cancels the pending forfeit. Distinct from the 20s
  // start-of-game abort above: that fires before any move and yields no result.
  useEffect(() => {
    if (state.game.status !== 'playing') return;
    if (state.moveHistory.length === 0) return; // start abort covers the pre-first-move case
    if (aborted || result !== null) return;
    // Only when OUR socket is healthy: a local blip makes presence unreliable, and this
    // is the effect that submits a ranked result, so never arm the forfeit on a bad link.
    if (connectionStatus !== 'ready') return;
    if (opponentConnected) return;
    // Only meaningful when the absent player owes the next move (matches the server
    // guard). If it is our turn we can still move to progress (see isMyTurn), which flips
    // the turn and lets this fire; we do not forfeit on our own turn.
    if (state.game.currentPlayerIndex === myRole) return;
    const t = setTimeout(() => {
      terminalRef.current = { reason: 'disconnect', mine: true };
      broadcastForfeit();
      dispatch({ type: 'RESIGN_ONLINE', winner: myRole });
    }, DISCONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, [
    state.game.status,
    state.game.currentPlayerIndex,
    state.moveHistory.length,
    aborted,
    result,
    connectionStatus,
    opponentConnected,
    myRole,
    dispatch,
    broadcastForfeit,
  ]);

  // Drive the debounced waiting flag: arm a timer while the opponent is absent, clear
  // it the moment they appear (or the game ends). A presence sync within the window
  // cancels the pending timer so no notice ever shows.
  useEffect(() => {
    if (opponentConnected || connectionStatus !== 'ready' || aborted || result !== null) {
      setWaitingDebounced(false);
      return;
    }
    const t = setTimeout(() => setWaitingDebounced(true), WAITING_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [opponentConnected, connectionStatus, aborted, result]);

  // Small inline note shown to the left of the opponent's timer. "reconnecting…" when
  // our own socket is re-establishing; "waiting…" when connected but the opponent is
  // absent past the debounce. Replaces the old full-screen blocking overlay (input is
  // already gated on opponentConnected, so nothing needs blocking).
  const opponentStatusNote: 'waiting…' | 'reconnecting…' | null =
    result !== null || aborted
      ? null
      : connectionStatus === 'reconnecting'
        ? 'reconnecting…' // an established socket dropped; 'connecting' (first connect) shows nothing
        : waitingDebounced
          ? 'waiting…'
          : null;

  // Move-list auto-scroll (live + active entry) is handled inside MoveListPanel.

  // Arrow-key history navigation. Functional updater avoids stale closures so
  // holding a key steps through moves rapidly at the OS key-repeat rate.
  useEffect(() => {
    const totalMoves = state.moveHistory.length;
    function onKeyDown(e: KeyboardEvent) {
      if (state.game.status !== 'playing' && state.game.status !== 'finished') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewIndex((cur) => {
          const c = cur ?? totalMoves;
          return c > 0 ? c - 1 : cur;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setViewIndex((cur) => {
          const c = cur ?? totalMoves;
          if (c >= totalMoves) return cur;
          const next = c + 1;
          return next >= totalMoves ? null : next;
        });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.moveHistory.length, state.game.status]);

  const isLive = viewIndex === null;
  const effectiveIndex = viewIndex ?? state.moveHistory.length;

  const displayGameState = useMemo(() => {
    if (isLive) return state.game;
    return replayToIndex(state.moveHistory, effectiveIndex);
  }, [isLive, effectiveIndex, state.moveHistory, state.game]);

  // My turn when the game is live and it's my move. Before the first move we also
  // require the opponent present (don't play into the void on a fresh/pasted URL). Once
  // the game is underway we allow moving even if the opponent has dropped: making the
  // move flips the turn to the absent player and lets the disconnect-forfeit resolve,
  // rather than freezing the board when they leave on our turn.
  const isMyTurn =
    state.game.status === 'playing' &&
    state.game.currentPlayerIndex === myRole &&
    (opponentConnected || state.moveHistory.length > 0);

  const validPawnMoves: Position[] =
    isMyTurn && isLive ? getValidPawnMoves(state.game, myRole) : [];

  // In confirm (tap) mode the preview is committed state, not a pointer echo: previewing
  // a wall and then moving the pawn instead leaves the ghost up through the opponent's
  // turn and into the next one. So a tap preview expires with the turn it was drawn on.
  // Hover mode keeps its preview across the move; there the pointer owns it.
  const moveCount = state.moveHistory.length;
  const expired = confirmMoves && pending?.atMove !== moveCount;
  const active = pending && !expired ? pending : null;
  const activeWall = active?.kind === 'wall' ? active.wall : null;
  const activePawnMove = active?.kind === 'pawn' ? active.to : null;
  const previewWall = useCallback(
    (wall: Wall | null) => setPending(wall ? { kind: 'wall', wall, atMove: moveCount } : null),
    [moveCount],
  );

  // Keep broadcastAbortRef current so onMoveReceived (defined above) can reach it.
  useEffect(() => {
    broadcastAbortRef.current = broadcastAbort;
  }, [broadcastAbort]);

  // Server-authoritative move: confirm with the backend BEFORE applying locally,
  // so the move only lands once it's recorded (no optimistic rollback needed).
  // submittingRef blocks a double-submit in the window before the turn flips.
  const submittingRef = useRef(false);
  const commitMove = useCallback(
    async (move: Move) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        await submitMove(serializeMove(move));
        dispatch({ type: 'APPLY_ONLINE_MOVE', move, playerIndex: myRole });
        broadcastMove(move);
      } catch {
        // Backend rejected (out of turn / illegal / desync) — leave state unchanged.
      } finally {
        submittingRef.current = false;
      }
    },
    [submitMove, dispatch, broadcastMove, myRole],
  );

  const handleCellClick = useCallback(
    (pos: Position) => {
      if (!isMyTurn || !isLive || !state.settings.clickMoveEnabled) return;
      const move: Move = { kind: 'pawn', to: pos };
      if (!applyMove(state.game, move).valid) return;

      // Confirm mode covers pawn moves for the same reason it covers fences: on a phone
      // the grooves sit between the squares, so a tap aimed at one that lands slightly
      // off used to play a pawn move on the spot, in a ranked game, with no way back.
      if (confirmMoves) {
        if (!activePawnMove || !samePosition(activePawnMove, pos)) {
          setPending({ kind: 'pawn', to: pos, atMove: moveCount });
          return;
        }
      }

      setPending(null);
      void commitMove(move);
    },
    [
      isMyTurn,
      isLive,
      state.game,
      state.settings.clickMoveEnabled,
      commitMove,
      confirmMoves,
      activePawnMove,
      moveCount,
    ],
  );

  const handleWallHover = useCallback(
    (wall: Wall | null) => {
      if (confirmMoves) return; // hover disabled; first click previews instead
      previewWall(isMyTurn && isLive ? wall : null);
    },
    [isMyTurn, isLive, confirmMoves, previewWall],
  );

  const handleWallClick = useCallback(
    (wall: Wall) => {
      if (!isMyTurn || !isLive) return;
      if (state.game.players[myRole].wallsRemaining <= 0) return;
      if (!isValidWallPlacement(state.game, wall)) return;
      if (confirmMoves) {
        // First click previews; second click on the same slot commits.
        if (!activeWall || !wallsEqual(activeWall, wall)) {
          previewWall(wall);
          return;
        }
      }
      const move: Move = { kind: 'wall', wall };
      setPending(null);
      void commitMove(move);
    },
    [isMyTurn, isLive, state.game, myRole, commitMove, confirmMoves, activeWall, previewWall],
  );

  function handleResign() {
    terminalRef.current = { reason: 'resign', mine: true };
    broadcastResign();
    dispatch({ type: 'RESIGN_ONLINE', winner: myRole === 0 ? 1 : 0 });
  }

  // Bail out of a game whose opponent never connected (pre-first-move). Mirrors the
  // old waiting-overlay Cancel: tell the other side to abort, reset, and leave.
  function handleCancelWaiting() {
    broadcastAbort();
    dispatch({ type: 'RESET_TO_IDLE' });
    navigate('/');
  }

  const handleKeyboardAction = useCallback(
    (action: KeyAction) => {
      if (!isMyTurn || !isLive) return;
      const { position } = state.game.players[myRole];
      const validMoves = getValidPawnMoves(state.game, myRole);
      let target: { row: number; col: number } | undefined;
      switch (action) {
        case 'up':
          target = validMoves.find((m) => m.col === position.col && m.row < position.row);
          break;
        case 'down':
          target = validMoves.find((m) => m.col === position.col && m.row > position.row);
          break;
        case 'left':
          target = validMoves.find((m) => m.row === position.row && m.col < position.col);
          break;
        case 'right':
          target = validMoves.find((m) => m.row === position.row && m.col > position.col);
          break;
        case 'diag-ul':
          target = validMoves.find((m) => m.row < position.row && m.col < position.col);
          break;
        case 'diag-ur':
          target = validMoves.find((m) => m.row < position.row && m.col > position.col);
          break;
        case 'diag-dl':
          target = validMoves.find((m) => m.row > position.row && m.col < position.col);
          break;
        case 'diag-dr':
          target = validMoves.find((m) => m.row > position.row && m.col > position.col);
          break;
      }
      if (!target) return;
      const move: Move = { kind: 'pawn', to: target };
      void commitMove(move);
    },
    [isMyTurn, isLive, state.game, myRole, commitMove],
  );

  useKeyboard(state.settings.keyboardEnabled, isMyTurn && isLive, handleKeyboardAction);

  const myName = profile?.username ?? 'You';
  const myElo = profile?.elo ?? STARTING_ELO;

  const topLabel = `${opponentName} · ${opponentElo}`;
  const bottomLabel = `${myName} · ${myElo}`;
  const boardFlipped = myRole === 1;

  // Which player is "top" vs "bottom" for the timer display
  const topPlayerIndex = boardFlipped ? (0 as const) : (1 as const);
  const bottomPlayerIndex = boardFlipped ? (1 as const) : (0 as const);

  const playerLabel = (idx: 0 | 1) => (idx === myRole ? 'You' : opponentName);

  return (
    <div className="game-layout">
      <NavSidebar activePage="play" />

      <div className="main-content">
        <div className="board-section">
          <GameCard
            difficulty={state.settings.difficulty}
            gameMode={state.settings.gameMode}
            opponentLabel={topLabel}
            playerLabel={bottomLabel}
            topFenceCount={state.game.players[opponentRole].wallsRemaining}
            bottomFenceCount={state.game.players[myRole].wallsRemaining}
            topRight={
              <div className="online-timer-row">
                {opponentStatusNote && (
                  <span className="online-status-note">
                    {opponentStatusNote}
                    {state.moveHistory.length === 0 && (
                      <button
                        type="button"
                        className="online-status-cancel"
                        onClick={handleCancelWaiting}
                      >
                        Cancel
                      </button>
                    )}
                  </span>
                )}
                <div
                  className={`online-timer-card${state.game.currentPlayerIndex === topPlayerIndex && state.game.status === 'playing' ? ' online-timer-card-active' : ''}`}
                >
                  {formatTime(times[topPlayerIndex])}
                </div>
              </div>
            }
            bottomRight={
              <div className="online-timer-row">
                <div
                  className={`online-timer-card${state.game.currentPlayerIndex === bottomPlayerIndex && state.game.status === 'playing' ? ' online-timer-card-active' : ''}`}
                >
                  {formatTime(times[bottomPlayerIndex])}
                </div>
              </div>
            }
          >
            <div className="board-wrapper">
              <GameBoard
                gameState={displayGameState}
                validPawnMoves={validPawnMoves}
                pendingPawnMove={isLive && isMyTurn ? activePawnMove : null}
                wallPreview={isLive && isMyTurn ? activeWall : null}
                isHumanTurn={isMyTurn && isLive}
                clickMoveEnabled={state.settings.clickMoveEnabled}
                flipped={boardFlipped}
                onCellClick={handleCellClick}
                onWallHover={isLive ? handleWallHover : () => {}}
                onWallClick={isLive ? handleWallClick : () => {}}
              />
              <FencePanel
                playerFences={state.game.players[myRole].wallsRemaining}
                computerFences={state.game.players[opponentRole].wallsRemaining}
                flipped={boardFlipped}
              />
            </div>
          </GameCard>

          {/* Right panel — shared with the offline game view (MoveListPanel). */}
          <MoveListPanel
            moveHistory={state.moveHistory}
            viewIndex={viewIndex}
            onViewIndex={setViewIndex}
            playerLabel={playerLabel}
            showResign={state.game.status === 'playing'}
            onResign={handleResign}
            onShowSettings={() => setShowSettings(true)}
          />
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={state.settings}
        onUpdateSettings={(patch) => dispatch({ type: 'UPDATE_SETTINGS', patch })}
        showOfflineSettings={false}
        confirmMoves={confirmMoves}
        onConfirmMovesChange={setConfirmMoves}
      />

      {/* Opponent-presence status is now an inline note beside the opponent's timer
          (see topRight above), not a blocking overlay — input is already gated on
          opponentConnected. The 20s start-abort timer still runs in the background. */}

      {/* Aborted overlay — shown when the starter didn't move in 20s. No ELO change. */}
      {aborted && result === null && (
        <div className="win-lose-overlay flex-center">
          <div className="win-lose-modal">
            <h1 className="win-lose-title">
              {abortReason === 'missing' ? 'Game Not Found' : 'Game Aborted'}
            </h1>
            <p className="online-elo-change">{ABORT_MESSAGE[abortReason]}</p>
            <div className="win-lose-buttons">
              <button
                className="btn action-btn"
                onClick={() => {
                  dispatch({ type: 'RESET_TO_IDLE' });
                  navigate('/');
                }}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result overlay */}
      {result !== null && (
        <div className="win-lose-overlay flex-center">
          <div className="win-lose-modal">
            <h1
              className={`win-lose-title ${result.winner === myRole ? 'win-lose-win' : 'win-lose-lose'}`}
            >
              {result.winner === myRole ? 'You Win!' : 'You Lose!'}
            </h1>
            {result.eloChange !== 0 && (
              <p className="online-elo-change">
                ELO {result.eloChange > 0 ? '+' : ''}
                {result.eloChange}
              </p>
            )}
            {result.recordStatus === 'recording' && (
              <p className="online-result-note">Recording result…</p>
            )}
            {/* A failed recording is not a cosmetic gap: the game is not in the database
                at all, so no rating moved and it will not appear in history. Say so. */}
            {result.recordStatus === 'failed' && (
              <p className="online-result-note online-result-note-warn">
                Couldn&apos;t record this game, so no rating changed.{' '}
                <button
                  type="button"
                  className="online-result-retry"
                  onClick={() => void retrySubmitResult()}
                >
                  Try again
                </button>
              </p>
            )}
            <div className="win-lose-buttons">
              <button
                className="btn action-btn"
                onClick={() => {
                  dispatch({ type: 'RESET_TO_IDLE' });
                  navigate('/');
                }}
              >
                Play Again
              </button>
              {result.savedGameId && (
                <button
                  className="btn action-btn"
                  onClick={() => navigate(`/history/${result.savedGameId}`)}
                >
                  Analyze Game
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <DevStats
        visible={state.settings.devMode}
        gameState={state.game}
        aiContext={state.aiContext}
      />
    </div>
  );
}
