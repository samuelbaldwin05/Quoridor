import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavSidebar } from '@/components/NavSidebar';
import { GameBoard } from '@/components/GameBoard';
import { FencePanel } from '@/components/FencePanel';
import { GameCard } from '@/components/GameCard';
import { createInitialState, applyMove } from '@/engine/gameEngine';
import type { GameState, StoredMove } from '@/engine/gameTypes';
import { loadGame, listGames } from '@/lib/gameStorage';

function replayToIndex(moves: StoredMove[], index: number): GameState {
  let state: GameState = { ...createInitialState(), status: 'playing' };
  for (let i = 0; i < index; i++) {
    const result = applyMove(state, moves[i]!.move);
    if (result.valid) state = result.nextState;
  }
  return state;
}

export function GameHistoryPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string | null>(id ?? null);
  const [moveIndex, setMoveIndex] = useState(0);

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

  function selectGame(gameId: string) {
    setSelectedId(gameId);
    setMoveIndex(0);
    navigate(`/history/${gameId}`, { replace: true });
  }

  const displayState = boardState ?? { ...createInitialState(), status: 'idle' as const };

  return (
    <div className="game-layout">
      <NavSidebar activePage="history" />

      <div className="main-content">
        <div className="board-section">
          <GameCard
            difficulty="bot2"
            gameStatus={displayState.status}
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

          {/* History right panel */}
          <div className="right-panel history-panel">
            <div className="history-panel-list">
              <p className="play-panel-heading">Game History</p>

              {games.length === 0 && (
                <p className="history-panel-empty">No games yet. Play first!</p>
              )}

              {games.map((g) => (
                <button
                  key={g.id}
                  className={`history-panel-item${selectedId === g.id ? ' history-panel-item-active' : ''}`}
                  onClick={() => selectGame(g.id)}
                >
                  <div className="history-item-row">
                    <span className="history-item-who">You</span>
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
              ))}
            </div>

            {boardState && (
              <div className="history-panel-controls">
                <button
                  className="btn history-nav-btn"
                  onClick={() => setMoveIndex((i) => Math.max(0, i - 1))}
                  disabled={moveIndex === 0}
                >
                  ←
                </button>
                <span className="history-move-counter">
                  {moveIndex} / {totalMoves}
                </span>
                <button
                  className="btn history-nav-btn"
                  onClick={() => setMoveIndex((i) => Math.min(totalMoves, i + 1))}
                  disabled={moveIndex === totalMoves}
                >
                  →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
