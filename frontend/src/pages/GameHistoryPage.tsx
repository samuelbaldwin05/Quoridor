import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavSidebar } from '@/components/NavSidebar';
import { GameBoard } from '@/components/GameBoard';
import { FencePanel } from '@/components/FencePanel';
import { GameCard } from '@/components/GameCard';
import { createInitialState, applyMove } from '@/engine/gameEngine';
import type { GameState, StoredMove, Move } from '@/engine/gameTypes';
import { loadGame, listGames } from '@/lib/gameStorage';

function replayToIndex(moves: StoredMove[], index: number): GameState {
  let state: GameState = { ...createInitialState(), status: 'playing' };
  for (let i = 0; i < index; i++) {
    const result = applyMove(state, moves[i]!.move);
    if (result.valid) state = result.nextState;
  }
  return state;
}

function moveNotation(move: Move): string {
  const col = (c: number) => String.fromCharCode(97 + c);
  const rank = (r: number) => String(9 - r);
  if (move.kind === 'pawn') return `${col(move.to.col)}${rank(move.to.row)}`;
  return `${col(move.wall.col)}${rank(move.wall.row)}${move.wall.orientation}`;
}

function moveIcon(move: Move) {
  return move.kind === 'pawn' ? '♟' : '⊟';
}

export function GameHistoryPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string | null>(id ?? null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [gameSearch, setGameSearch] = useState('');

  const games = useMemo(() => listGames(), []);
  const currentGame = useMemo(
    () => (selectedId ? loadGame(selectedId) : null),
    [selectedId],
  );

  const boardState = useMemo(() => {
    if (!currentGame) return null;
    return replayToIndex(currentGame.moves, moveIndex);
  }, [currentGame, moveIndex]);

  const totalMoves = currentGame?.moves.length ?? 0;

  const moveListRef = useRef<HTMLDivElement>(null);

  const filteredGames = useMemo(() => {
    const q = gameSearch.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) =>
      (g.opponentLabel ?? 'Bot').toLowerCase().includes(q),
    );
  }, [games, gameSearch]);

  function selectGame(gameId: string) {
    setSelectedId(gameId);
    setMoveIndex(0);
    navigate(`/history/${gameId}`, { replace: true });
  }

  function clearSelection() {
    setSelectedId(null);
    navigate('/history', { replace: true });
  }

  // Jump to end when a new game is loaded
  useEffect(() => {
    if (currentGame) setMoveIndex(currentGame.moves.length);
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

  const displayState = boardState ?? { ...createInitialState(), status: 'idle' as const };
  const selectedGame = games.find((g) => g.id === selectedId);

  return (
    <div className="game-layout">
      <NavSidebar activePage="history" />

      <div className="main-content">
        <div className="board-section">

          {/* Board */}
          <GameCard
            gameStatus={displayState.status}
            opponentLabel={selectedGame?.opponentLabel ?? 'Opponent'}
            onShowSettings={() => {}}
            onResign={() => {}}
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
                  <span className="play-panel-heading" style={{ margin: 0 }}>Game History</span>
                </div>

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
                    <button className="ghp-search-clear" onClick={() => setGameSearch('')}>×</button>
                  )}
                </div>

                <div className="ghp-list" ref={moveListRef}>
                  {games.length === 0 ? (
                    <p className="ghp-empty">No games yet. Play first!</p>
                  ) : filteredGames.length === 0 ? (
                    <p className="ghp-empty">No matches for "{gameSearch}"</p>
                  ) : (
                    filteredGames.map((g) => (
                      <button
                        key={g.id}
                        className="history-panel-item"
                        onClick={() => selectGame(g.id)}
                      >
                        <div className="history-item-row">
                          <span className="history-item-who">{g.opponentLabel ?? 'Bot'}</span>
                          <span className={`history-item-result ${g.winner === 0 ? 'result-win' : 'result-lose'}`}>
                            {g.winner === 0 ? 'Win' : 'Loss'}
                          </span>
                        </div>
                        <div className="history-item-row history-item-meta">
                          <span>
                            {new Date(g.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                            {new Date(g.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
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
                  <button className="ghp-back-btn" onClick={clearSelection}>← Games</button>
                  <span className="play-panel-heading" style={{ margin: 0 }}>Moves</span>
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
                    const who = sm.playerIndex === 0 ? 'You' : (selectedGame?.opponentLabel ?? 'Opponent');
                    return (
                      <button
                        key={i}
                        className={`ghp-entry${isActive ? ' ghp-entry-active' : ''}`}
                        onClick={() => setMoveIndex(i + 1)}
                      >
                        <span className="ghp-num">{i + 1}</span>
                        <span className="ghp-icon">{moveIcon(sm.move)}</span>
                        <span className="ghp-notation">{moveNotation(sm.move)}</span>
                        <span className="ghp-who">{who}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="ghp-controls">
                  <button
                    className="btn ghp-nav-btn"
                    onClick={() => setMoveIndex((i) => Math.max(0, i - 1))}
                    disabled={moveIndex === 0}
                  >
                    ←
                  </button>
                  <span className="ghp-position">{moveIndex} / {totalMoves}</span>
                  <button
                    className="btn ghp-nav-btn"
                    onClick={() => setMoveIndex((i) => Math.min(totalMoves, i + 1))}
                    disabled={moveIndex === totalMoves}
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
