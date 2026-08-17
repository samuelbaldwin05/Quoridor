import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavSidebar } from '@/components/NavSidebar';
import { GameBoard } from '@/components/GameBoard';
import { FencePanel } from '@/components/FencePanel';
import { GameCard } from '@/components/GameCard';
import { createInitialState } from '@/engine/gameEngine';
import { replayToIndex, moveIcon } from '@/engine/moveDisplay';
import { serializeMove, parseMove } from '@/engine/notation';
import type { StoredMove } from '@/engine/gameTypes';
import {
  loadGame,
  listGames,
  gameOutcome,
  type GameOutcome,
  type SavedGame,
} from '@/lib/gameStorage';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useHoldRepeat } from '@/hooks/useHoldRepeat';

/** One row of GET /api/users/{id}/games: an online game as the backend recorded it. */
interface ServerGameSummary {
  id: string;
  mode: 'pass_and_play' | 'vs_ai' | 'ranked' | 'casual';
  time_control: number | null;
  opponent_name: string | null;
  result: 'win' | 'loss';
  elo_change: number | null;
  move_count: number;
  completed_at: string | null;
}

/**
 * A row in the history list, from either side of the split: online games come from the
 * backend so they are there on any device, bot and pass-and-play games only ever existed
 * on this one. `id` is what the viewer should be opened with, which is the server's id
 * for an online game and the local save's id otherwise.
 */
interface HistoryEntry {
  id: string;
  date: number;
  outcome: GameOutcome;
  opponentLabel: string;
  isBot: boolean;
  eloChange: number | null;
  casual: boolean;
}

// Public replay record from GET /games/{id} (online games).
interface OnlineGameDetail {
  id: string;
  player1_name: string | null;
  player2_name: string | null;
  winner_index: number | null;
  move_history: string[];
  completed_at: string | null;
}

// Adapt an online game into the viewer's SavedGame shape. player1 (index 0) moves
// first, so move i belongs to player i % 2. Both sides are shown by real name.
function adaptOnlineGame(d: OnlineGameDetail): SavedGame {
  const moves: StoredMove[] = d.move_history.map((notation, i) => ({
    move: parseMove(notation),
    playerIndex: (i % 2) as 0 | 1,
    timestamp: 0,
  }));
  return {
    id: d.id,
    date: d.completed_at ? new Date(d.completed_at).getTime() : 0,
    moves,
    winner: d.winner_index === 0 || d.winner_index === 1 ? d.winner_index : null,
    opponentLabel: d.player2_name ?? 'Player 2',
    userRole: 0,
    playerNames: [d.player1_name ?? 'Player 1', d.player2_name ?? 'Player 2'],
  };
}

const RESULT_LABEL: Record<GameOutcome, string> = {
  win: 'Win',
  loss: 'Loss',
  unfinished: 'Unfinished',
};
const RESULT_CLASS: Record<GameOutcome, string> = {
  win: 'result-win',
  loss: 'result-lose',
  unfinished: 'result-unfinished',
};

export function GameHistoryPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string | null>(id ?? null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [gameSearch, setGameSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'lose'>('all');
  const [filterOpponent, setFilterOpponent] = useState<'all' | 'bot' | 'human'>('all');
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const { profile } = useAuth();
  const myId = profile?.id ?? '';

  // Online games as the backend has them, so history is the same on any device rather
  // than whatever this browser happens to remember. A failure leaves the list local,
  // which is what it always was.
  const [serverGames, setServerGames] = useState<ServerGameSummary[] | null>(null);
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    apiFetch<ServerGameSummary[]>(`/api/users/${myId}/games?limit=50`)
      .then((rows) => {
        if (!cancelled) setServerGames(rows);
      })
      .catch(() => {
        if (!cancelled) setServerGames(null);
      });
    return () => {
      cancelled = true;
    };
  }, [myId]);

  const games = useMemo<HistoryEntry[]>(() => {
    // A local copy of a game the server also has would otherwise appear twice. Saves
    // written before online games carried a server id have nothing to match on, so they
    // can still double up until they age out of the fifty the browser keeps.
    const hideLocalOnline = serverGames !== null;
    const localEntries: HistoryEntry[] = listGames()
      .filter((g) => !(hideLocalOnline && g.serverGameId))
      .map((g) => ({
        id: g.id,
        date: g.date,
        outcome: gameOutcome(g),
        opponentLabel: g.opponentLabel ?? 'Bot',
        isBot: g.difficulty != null,
        eloChange: null,
        casual: false,
      }));

    const serverEntries: HistoryEntry[] = (serverGames ?? []).map((g) => ({
      id: g.id,
      date: g.completed_at ? new Date(g.completed_at).getTime() : 0,
      outcome: g.result,
      opponentLabel: g.opponent_name ?? 'Opponent',
      isBot: false,
      eloChange: g.elo_change,
      casual: g.mode === 'casual',
    }));

    return [...serverEntries, ...localEntries].sort((a, b) => b.date - a.date);
  }, [serverGames]);

  // A selected game is either a local (offline) save (derived synchronously) or,
  // failing that, an online game fetched from the backend for replay (e.g. opened
  // from a profile). The fetched game is tagged with its id so a stale response
  // can't leak into a different selection.
  const localGame = useMemo(() => (selectedId ? loadGame(selectedId) : null), [selectedId]);
  const [onlineGame, setOnlineGame] = useState<{ id: string; game: SavedGame } | null>(null);
  useEffect(() => {
    if (!selectedId || localGame) return;
    let cancelled = false;
    apiFetch<OnlineGameDetail>(`/games/${selectedId}`)
      .then((d) => {
        if (!cancelled) setOnlineGame({ id: selectedId, game: adaptOnlineGame(d) });
      })
      .catch(() => {
        if (!cancelled) setOnlineGame(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, localGame]);

  const currentGame =
    localGame ?? (onlineGame && onlineGame.id === selectedId ? onlineGame.game : null);

  const boardState = useMemo(() => {
    if (!currentGame) return null;
    return replayToIndex(currentGame.moves, moveIndex);
  }, [currentGame, moveIndex]);

  const totalMoves = currentGame?.moves.length ?? 0;

  const moveListRef = useRef<HTMLDivElement>(null);

  // Hold-to-repeat stepping, matching GamePage/OnlineGamePage move-nav arrows.
  const stepBack = useHoldRepeat(() => setMoveIndex((i) => Math.max(0, i - 1)));
  const stepForward = useHoldRepeat(() => setMoveIndex((i) => Math.min(totalMoves, i + 1)));

  const filteredGames = useMemo(() => {
    let list = [...games];
    // Sort
    if (sortOrder === 'oldest') list.sort((a, b) => a.date - b.date);
    // Filter by result (relative to the logged-in user, not player 0)
    if (filterResult === 'win') list = list.filter((g) => g.outcome === 'win');
    else if (filterResult === 'lose') list = list.filter((g) => g.outcome === 'loss');
    // Filter by opponent type, on the flag the save carries rather than on the name: a
    // human called Robotnik was being counted as a bot game.
    if (filterOpponent === 'bot') list = list.filter((g) => g.isBot);
    else if (filterOpponent === 'human') list = list.filter((g) => !g.isBot);
    // Search
    const q = gameSearch.trim().toLowerCase();
    if (q) list = list.filter((g) => g.opponentLabel.toLowerCase().includes(q));
    return list;
  }, [games, gameSearch, sortOrder, filterResult, filterOpponent]);

  function selectGame(gameId: string) {
    setSelectedId(gameId);
    setMoveIndex(0);
    navigate(`/history/${gameId}`, { replace: true });
  }

  function clearSelection() {
    setSelectedId(null);
    navigate('/history', { replace: true });
  }

  // Jump to first move when a new game is loaded
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentGame) setMoveIndex(0);
  }, [currentGame?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrow key navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!currentGame) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setMoveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setMoveIndex((i) => Math.min(currentGame.moves.length, i + 1));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentGame]);

  // Scroll active move into view
  useEffect(() => {
    if (!moveListRef.current) return;
    const active = moveListRef.current.querySelector('.ghp-entry-active');
    active?.scrollIntoView({ block: 'nearest' });
  }, [moveIndex]);

  // Close filter panel on outside mousedown
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
      setShowFilters(false);
    }
  }, []);
  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [handleOutsideClick]);

  const activeFilterCount =
    (sortOrder !== 'newest' ? 1 : 0) +
    (filterResult !== 'all' ? 1 : 0) +
    (filterOpponent !== 'all' ? 1 : 0);

  const displayState = boardState ?? { ...createInitialState(), status: 'idle' as const };

  return (
    <div className="game-layout">
      <NavSidebar activePage="history" />

      <div className="main-content">
        <div className="board-section">
          {/* Board */}
          <GameCard
            opponentLabel={
              currentGame?.playerNames?.[1] ?? currentGame?.opponentLabel ?? 'Opponent'
            }
            playerLabel={currentGame?.playerNames?.[0]}
          >
            <div className="board-wrapper">
              <GameBoard
                gameState={displayState}
                validPawnMoves={[]}
                wallPreview={null}
                isHumanTurn={false}
                clickMoveEnabled={false}
                onCellClick={() => {}}
                onWallHover={() => {}}
                onWallClick={() => {}}
              />
              <FencePanel
                playerFences={displayState.players[0].wallsRemaining}
                computerFences={displayState.players[1].wallsRemaining}
              />
            </div>
          </GameCard>

          {/* Right panel — game list OR move list */}
          <div className="right-panel game-history-panel">
            {!currentGame ? (
              /* ── Game list ── */
              <>
                <div className="ghp-header">
                  <span className="play-panel-heading" style={{ margin: 0 }}>
                    Game History
                  </span>
                </div>

                {/* Search + filter row */}
                <div className="ghp-filter-bar" ref={filterPanelRef}>
                  <div className="ghp-search-wrap">
                    <span className="ghp-search-icon">🔍</span>
                    <input
                      className="ghp-search-input"
                      type="text"
                      placeholder="Search by name…"
                      value={gameSearch}
                      onChange={(e) => setGameSearch(e.target.value)}
                    />
                    {gameSearch && (
                      <button className="ghp-search-clear" onClick={() => setGameSearch('')}>
                        ×
                      </button>
                    )}
                    <button
                      className={`ghp-filter-btn${activeFilterCount > 0 ? ' ghp-filter-btn-active' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setShowFilters((v) => !v);
                      }}
                      title="Filters"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        width="12"
                        height="12"
                        aria-hidden="true"
                      >
                        <path d="M1 3h14v1.5L9.5 9v5l-3-1.5V9L1 4.5V3z" />
                      </svg>
                      {activeFilterCount > 0 && (
                        <span className="ghp-filter-count">{activeFilterCount}</span>
                      )}
                    </button>
                  </div>

                  {showFilters && (
                    <div className="ghp-filter-dropdown" onMouseDown={(e) => e.stopPropagation()}>
                      <div className="ghp-filter-group">
                        <span className="ghp-filter-label">Sort</span>
                        <div className="ghp-filter-options">
                          {(['newest', 'oldest'] as const).map((opt) => (
                            <button
                              key={opt}
                              className={`ghp-filter-option${sortOrder === opt ? ' active' : ''}`}
                              onClick={() => setSortOrder(opt)}
                            >
                              {opt === 'newest' ? 'Most Recent' : 'Oldest First'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="ghp-filter-group">
                        <span className="ghp-filter-label">Result</span>
                        <div className="ghp-filter-options">
                          {(['all', 'win', 'lose'] as const).map((opt) => (
                            <button
                              key={opt}
                              className={`ghp-filter-option${filterResult === opt ? ' active' : ''}`}
                              onClick={() => setFilterResult(opt)}
                            >
                              {opt === 'all' ? 'All' : opt === 'win' ? 'Won' : 'Lost'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="ghp-filter-group">
                        <span className="ghp-filter-label">Opponent</span>
                        <div className="ghp-filter-options">
                          {(['all', 'bot', 'human'] as const).map((opt) => (
                            <button
                              key={opt}
                              className={`ghp-filter-option${filterOpponent === opt ? ' active' : ''}`}
                              onClick={() => setFilterOpponent(opt)}
                            >
                              {opt === 'all' ? 'All' : opt === 'bot' ? 'Bot' : 'Human'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="ghp-list" ref={moveListRef}>
                  {games.length === 0 ? (
                    <p className="ghp-empty">No games yet. Play first!</p>
                  ) : filteredGames.length === 0 ? (
                    <p className="ghp-empty">No matches.</p>
                  ) : (
                    filteredGames.map((g) => (
                      <button
                        key={g.id}
                        className="history-panel-item"
                        onClick={() => selectGame(g.id)}
                      >
                        <div className="history-item-row">
                          <span className="history-item-who">{g.opponentLabel}</span>
                          <span className={`history-item-result ${RESULT_CLASS[g.outcome]}`}>
                            {RESULT_LABEL[g.outcome]}
                          </span>
                        </div>
                        <div className="history-item-row history-item-meta">
                          <span>
                            {new Date(g.date).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            {new Date(g.date).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {g.casual && <span className="history-item-tag">Challenge</span>}
                          {g.eloChange !== null && (
                            <span
                              className="history-item-elo"
                              style={{ color: g.eloChange >= 0 ? '#2ecc71' : '#e74c3c' }}
                            >
                              {g.eloChange >= 0 ? '+' : ''}
                              {g.eloChange}
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              /* ── Move list ── */
              <>
                <div className="ghp-header">
                  <button className="ghp-back-btn" onClick={clearSelection}>
                    ← Games
                  </button>
                  <span className="play-panel-heading" style={{ margin: 0 }}>
                    Moves
                  </span>
                </div>

                <div className="ghp-list" ref={moveListRef}>
                  <button
                    className={`ghp-entry ghp-initial${moveIndex === 0 ? ' ghp-entry-active' : ''}`}
                    onClick={() => setMoveIndex(0)}
                  >
                    Start
                  </button>

                  {currentGame.moves.map((sm, i) => {
                    const isActive = moveIndex === i + 1;
                    const who = currentGame.playerNames
                      ? currentGame.playerNames[sm.playerIndex]
                      : sm.playerIndex === (currentGame.userRole ?? 0)
                        ? 'You'
                        : (currentGame.opponentLabel ?? 'Opponent');
                    return (
                      <button
                        key={i}
                        className={`ghp-entry${isActive ? ' ghp-entry-active' : ''}`}
                        onClick={() => setMoveIndex(i + 1)}
                      >
                        <span className="ghp-num">{i + 1}</span>
                        <span className="ghp-icon">{moveIcon(sm.move)}</span>
                        <span className="ghp-notation">{serializeMove(sm.move)}</span>
                        <span className="ghp-who">{who}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="ghp-controls">
                  <button
                    className="btn ghp-nav-btn"
                    {...stepBack}
                    disabled={moveIndex === 0}
                    title="Previous move"
                  >
                    ←
                  </button>
                  <span className="ghp-position">
                    {moveIndex} / {totalMoves}
                  </span>
                  <button
                    className="btn ghp-nav-btn"
                    {...stepForward}
                    disabled={moveIndex === totalMoves}
                    title="Next move"
                  >
                    →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
