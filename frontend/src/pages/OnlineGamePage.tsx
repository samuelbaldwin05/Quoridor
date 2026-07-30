import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DevStats } from '@/components/DevStats';
import { FencePanel } from '@/components/FencePanel';
import { GameBoard } from '@/components/GameBoard';
import { GameCard } from '@/components/GameCard';
import { NavSidebar } from '@/components/NavSidebar';
import { SettingsModal } from '@/components/SettingsModal';
import { applyMove } from '@/engine/gameEngine';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import { wallsEqual } from '@/engine/wallUtils';
import { replayToIndex, moveIcon } from '@/engine/moveDisplay';
import { serializeMove } from '@/engine/notation';
import type { GameState, Move, PlayerIndex, Position, Wall } from '@/engine/gameTypes';
import { useAuth } from '@/hooks/useAuth';
import { useGame } from '@/hooks/useGame';
import { useHoldRepeat } from '@/hooks/useHoldRepeat';
import { useKeyboard, type KeyAction } from '@/hooks/useKeyboard';
import { useOnlineGame } from '@/hooks/useOnlineGame';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { apiFetch } from '@/lib/api';
import { saveGame } from '@/lib/gameStorage';

// ── helpers ───────────────────────────────────────────────────────────────────

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
  const { profile, refreshProfile } = useAuth();

  const myRole = parseInt(searchParams.get('role') ?? '0') as 0 | 1;
  const opponentName = searchParams.get('opponent') ?? 'Opponent';
  const opponentElo = parseInt(searchParams.get('opponentElo') ?? '500');
  const timeControl = parseInt(searchParams.get('tc') ?? '300');
  const myUserId = profile?.id ?? '';

  const { state, dispatch } = useGame();
  const [wallPreview, setWallPreview] = useState<Wall | null>(null);

  // Always-current ref to game state — lets onMoveReceived validate without stale closures
  const gameStateRef = useRef<GameState>(state.game);
  useEffect(() => {
    gameStateRef.current = state.game;
  }, [state.game]);

  // Cosmetic history viewing (does NOT affect actual game state)
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  // Per-player countdown timers [player0Time, player1Time]
  const [times, setTimes] = useState<[number, number]>([timeControl, timeControl]);
  const timesRef = useRef<[number, number]>([timeControl, timeControl]);

  const [showSettings, setShowSettings] = useState(false);
  const [confirmWallPlacement, setConfirmWallPlacement] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  );

  useTheme(state.settings.theme);
  const audio = useAudio(state.settings.soundEnabled, state.settings.volume);

  const [aborted, setAborted] = useState(false);

  // Why the game ended + whether THIS client should submit the result. For a board
  // win either client can submit (the history proves it); for resign/timeout only
  // the forfeiting player may, since the backend records the caller as the loser.
  const terminalRef = useRef<{ reason: 'win' | 'resign' | 'timeout'; mine: boolean } | null>(null);

  // Lets onMoveReceived (defined below, before the hook returns broadcastAbort)
  // reach broadcastAbort once it's available.
  const broadcastAbortRef = useRef<() => void>(() => {});

  const {
    result,
    connectionStatus,
    opponentConnected,
    submitMove,
    broadcastMove,
    broadcastResign,
    broadcastTimeout,
    broadcastAbort,
    submitResult,
    observeResult,
  } = useOnlineGame({
    gameId: gameId ?? '',
    myRole,
    myUserId,
    onMoveReceived: useCallback(
      (move: Move, playerIndex: PlayerIndex) => {
        // Validate against current state. An illegal broadcast means a cheat or a
        // desync; we can't prove a result, so abort both clients (no ELO) and tell
        // the sender via a terminal broadcast so they converge instead of hanging.
        const validation = applyMove(gameStateRef.current, move);
        if (!validation.valid) {
          broadcastAbortRef.current();
          setAborted(true);
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
      setAborted(true);
    }, []),
  });

  // Start the game, clean up matchmaking queue, play start sound.
  // Guarded so the one-time side effects (DELETE, start sound) fire exactly once
  // even under StrictMode's dev double-invoke.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    dispatch({ type: 'START_GAME' });
    void apiFetch('/matchmaking/leave', { method: 'DELETE' }).catch(() => {});
    audio.playStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // winner. Resign/timeout: only the forfeiting player submits (caller = loser);
  // the winner just observes and lets refreshProfile() pick up the new ELO.
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
      setAborted(true);
      broadcastAbort();
    }, 20000);
    return () => clearTimeout(t);
  }, [state.game.status, state.moveHistory.length, aborted, broadcastAbort]);

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

  // Auto-scroll move list to bottom when live
  useEffect(() => {
    if (viewIndex === null && moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [state.moveHistory.length, viewIndex]);

  // Scroll active entry into view
  useEffect(() => {
    if (!moveListRef.current) return;
    const active = moveListRef.current.querySelector('.ghp-entry-active');
    active?.scrollIntoView({ block: 'nearest' });
  }, [viewIndex]);

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
  const totalMoves = state.moveHistory.length;

  const displayGameState = useMemo(() => {
    if (isLive) return state.game;
    return replayToIndex(state.moveHistory, effectiveIndex);
  }, [isLive, effectiveIndex, state.moveHistory, state.game]);

  const isMyTurn =
    state.game.status === 'playing' &&
    state.game.currentPlayerIndex === myRole &&
    opponentConnected;

  const validPawnMoves: Position[] =
    isMyTurn && isLive ? getValidPawnMoves(state.game, myRole) : [];

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
      void commitMove(move);
    },
    [isMyTurn, isLive, state.game, state.settings.clickMoveEnabled, commitMove],
  );

  const handleWallHover = useCallback(
    (wall: Wall | null) => {
      if (confirmWallPlacement) return; // hover disabled; first click previews instead
      setWallPreview(isMyTurn && isLive ? wall : null);
    },
    [isMyTurn, isLive, confirmWallPlacement],
  );

  const handleWallClick = useCallback(
    (wall: Wall) => {
      if (!isMyTurn || !isLive) return;
      if (state.game.players[myRole].wallsRemaining <= 0) return;
      if (!isValidWallPlacement(state.game, wall)) return;
      if (confirmWallPlacement) {
        // First click previews; second click on the same slot commits.
        if (!wallPreview || !wallsEqual(wallPreview, wall)) {
          setWallPreview(wall);
          return;
        }
      }
      const move: Move = { kind: 'wall', wall };
      setWallPreview(null);
      void commitMove(move);
    },
    [isMyTurn, isLive, state.game, myRole, commitMove, confirmWallPlacement, wallPreview],
  );

  function handleResign() {
    terminalRef.current = { reason: 'resign', mine: true };
    broadcastResign();
    dispatch({ type: 'RESIGN_ONLINE', winner: myRole === 0 ? 1 : 0 });
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

  function handleBack() {
    setViewIndex((cur) => {
      const c = cur ?? totalMoves;
      return c > 0 ? c - 1 : cur;
    });
  }

  function handleForward() {
    setViewIndex((cur) => {
      const c = cur ?? totalMoves;
      if (c >= totalMoves) return null;
      const next = c + 1;
      return next >= totalMoves ? null : next;
    });
  }

  const backHold = useHoldRepeat(handleBack);
  const forwardHold = useHoldRepeat(handleForward);

  const opponentIndex: 0 | 1 = myRole === 0 ? 1 : 0;
  const myName = profile?.username ?? 'You';
  const myElo = profile?.elo ?? 500;

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
            topFenceCount={state.game.players[opponentIndex].wallsRemaining}
            bottomFenceCount={state.game.players[myRole].wallsRemaining}
            topRight={
              <div
                className={`online-timer-card${state.game.currentPlayerIndex === topPlayerIndex && state.game.status === 'playing' ? ' online-timer-card-active' : ''}`}
              >
                {formatTime(times[topPlayerIndex])}
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
                wallPreview={isLive ? wallPreview : null}
                isHumanTurn={isMyTurn && isLive}
                clickMoveEnabled={state.settings.clickMoveEnabled}
                flipped={boardFlipped}
                onCellClick={handleCellClick}
                onWallHover={isLive ? handleWallHover : () => {}}
                onWallClick={isLive ? handleWallClick : () => {}}
              />
              <FencePanel
                playerFences={state.game.players[myRole].wallsRemaining}
                computerFences={state.game.players[opponentIndex].wallsRemaining}
                flipped={boardFlipped}
              />
            </div>
          </GameCard>

          {/* Right panel — always shown */}
          <div className="right-panel game-history-panel">
            <div className="ghp-header">
              <span className="play-panel-heading" style={{ margin: 0 }}>
                Moves
              </span>
              {!isLive && (
                <button className="ghp-live-btn" onClick={() => setViewIndex(null)}>
                  Live ↓
                </button>
              )}
            </div>

            <div className="ghp-list" ref={moveListRef}>
              <button
                className={`ghp-entry ghp-initial${effectiveIndex === 0 ? ' ghp-entry-active' : ''}`}
                onClick={() => setViewIndex(0)}
              >
                Start
              </button>

              {state.moveHistory.map((sm, i) => {
                const isActive = effectiveIndex === i + 1;
                return (
                  <button
                    key={i}
                    className={`ghp-entry${isActive ? ' ghp-entry-active' : ''}`}
                    onClick={() => setViewIndex(i + 1)}
                  >
                    <span className="ghp-num">{i + 1}</span>
                    <span className="ghp-icon">{moveIcon(sm.move)}</span>
                    <span className="ghp-notation">{serializeMove(sm.move)}</span>
                    <span className="ghp-who">{playerLabel(sm.playerIndex)}</span>
                  </button>
                );
              })}
            </div>

            <div className="ghp-controls">
              <button
                className="btn ghp-nav-btn"
                {...backHold}
                disabled={effectiveIndex === 0}
                title="Previous move"
              >
                ←
              </button>
              <span className="ghp-position">
                {isLive ? 'Live' : `${effectiveIndex} / ${totalMoves}`}
              </span>
              <button
                className="btn ghp-nav-btn"
                {...forwardHold}
                disabled={isLive}
                title="Next move"
              >
                →
              </button>
              <button
                className="btn ghp-nav-btn ghp-action-btn"
                onClick={() => setShowSettings(true)}
                title="Settings"
              >
                ⚙
              </button>
              {state.game.status === 'playing' && (
                <button
                  className="btn ghp-nav-btn ghp-resign-btn"
                  onClick={handleResign}
                  title="Resign"
                >
                  ⚑
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={state.settings}
        onUpdateSettings={(patch) => dispatch({ type: 'UPDATE_SETTINGS', patch })}
        showOfflineSettings={false}
        confirmWallPlacement={confirmWallPlacement}
        onConfirmWallPlacementChange={setConfirmWallPlacement}
      />

      {/* Waiting overlay — shown until the opponent's presence appears in the channel.
          Blocks interaction so reloading the URL or pasting it doesn't let you play
          into the void. The 20s abort timer runs in the background and will fire if
          the opponent never connects. */}
      {connectionStatus === 'ready' && !opponentConnected && !aborted && result === null && (
        <div className="win-lose-overlay flex-center">
          <div className="win-lose-modal">
            <h1 className="win-lose-title">Waiting for opponent…</h1>
            <p className="online-elo-change">
              The game will be abandoned if they don't connect in time.
            </p>
            <div className="win-lose-buttons">
              <button
                className="btn action-btn"
                onClick={() => {
                  broadcastAbort();
                  dispatch({ type: 'RESET_TO_IDLE' });
                  navigate('/');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aborted overlay — shown when the starter didn't move in 20s. No ELO change. */}
      {aborted && result === null && (
        <div className="win-lose-overlay flex-center">
          <div className="win-lose-modal">
            <h1 className="win-lose-title">Game Aborted</h1>
            <p className="online-elo-change">No move within 20 seconds. ELO unchanged.</p>
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
