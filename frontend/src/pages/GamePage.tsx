import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DevStats } from '@/components/DevStats';
import { FencePanel } from '@/components/FencePanel';
import { NavSidebar } from '@/components/NavSidebar';
import { GameBoard } from '@/components/GameBoard';
import { GameCard } from '@/components/GameCard';
import { GameRightPanel } from '@/components/GameRightPanel';
import { SettingsModal } from '@/components/SettingsModal';
import { WinLoseModal } from '@/components/WinLoseModal';
import { createInitialState, applyMove } from '@/engine/gameEngine';
import { getValidPawnMoves } from '@/engine/moveValidation';
import type { GameState, Position, StoredMove } from '@/engine/gameTypes';
import { MESSAGE_TIMEOUT_MS } from '@/engine/constants';
import { useAi } from '@/hooks/useAi';
import { useAudio } from '@/hooks/useAudio';
import { useBoardInteraction } from '@/hooks/useBoardInteraction';
import { useGame } from '@/hooks/useGame';
import { useKeyboard, type KeyAction } from '@/hooks/useKeyboard';
import { useTheme } from '@/hooks/useTheme';
import type { Settings } from '@/lib/schemas/settingsSchemas';

function replayToIndex(moves: StoredMove[], index: number): GameState {
  let state: GameState = { ...createInitialState(), status: 'playing' };
  for (let i = 0; i < index; i++) {
    const result = applyMove(state, moves[i]!.move);
    if (result.valid) state = result.nextState;
  }
  return state;
}

export function GamePage() {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showWinLose, setShowWinLose] = useState(false);
  /** null = live; number = viewing state after N moves */
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const audio = useAudio(state.settings.soundEnabled, state.settings.volume);

  const {
    wallPreview,
    validPawnMoves: liveValidMoves,
    handleCellClick,
    handleWallHover,
    handleWallClick,
  } = useBoardInteraction(state, dispatch);

  useAi(state, dispatch);
  useTheme(state.settings.theme);

  const isPassAndPlay = state.settings.gameMode === 'pass-and-play';
  const isViewingHistory = viewIndex !== null;

  // Displayed board state — replayed when viewing history, live otherwise
  const displayGameState = useMemo(() => {
    if (viewIndex === null) return state.game;
    return replayToIndex(state.moveHistory, viewIndex);
  }, [viewIndex, state.moveHistory, state.game]);

  const isHumanTurn =
    !isViewingHistory &&
    state.game.status === 'playing' &&
    (state.game.currentPlayerIndex === 0 || isPassAndPlay);

  const validPawnMoves = isViewingHistory ? [] : liveValidMoves;

  useEffect(() => {
    if (state.game.status === 'finished') setShowWinLose(true);
  }, [state.game.status]);

  useEffect(() => {
    if (!state.message) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_MESSAGE' }), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.message, dispatch]);

  useEffect(() => {
    if (state.game.status === 'playing' && state.game.currentPlayerIndex === 1 && !isPassAndPlay) {
      audio.playMove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.game.currentPlayerIndex, state.game.status]);

  useEffect(() => {
    if (state.game.status === 'finished') {
      if (state.game.winner === 0) audio.playWin();
      else audio.playLose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.game.status, state.game.winner]);

  const handleKeyboardAction = useCallback(
    (action: KeyAction) => {
      if (!isHumanTurn) return;
      const currentIdx = state.game.currentPlayerIndex;
      const { position } = state.game.players[currentIdx];
      const validMoves = getValidPawnMoves(state.game, currentIdx);

      let target: Position | undefined;
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

      if (target) dispatch({ type: 'APPLY_MOVE', move: { kind: 'pawn', to: target } });
    },
    [isHumanTurn, state.game, dispatch],
  );

  useKeyboard(state.settings.keyboardEnabled, isHumanTurn, handleKeyboardAction);

  // Arrow-key history navigation (always active, not just when human turn)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (state.game.status === 'idle') return;
      const totalMoves = state.moveHistory.length;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const cur = viewIndex ?? totalMoves;
        if (cur > 0) setViewIndex(cur - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const cur = viewIndex ?? totalMoves;
        if (cur < totalMoves) {
          const next = cur + 1;
          setViewIndex(next >= totalMoves ? null : next);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewIndex, state.moveHistory.length, state.game.status]);

  function handlePlay(difficulty: Settings['difficulty'], gameMode: Settings['gameMode']) {
    setViewIndex(null); // reset to live
    dispatch({ type: 'UPDATE_SETTINGS', patch: { difficulty, gameMode } });
    dispatch({ type: 'START_GAME' });
    audio.playStart();
  }

  const handleNewGame = () => {
    setShowWinLose(false);
    setViewIndex(null);
    dispatch({ type: 'NEW_GAME' });
    audio.playStart();
  };

  const handleAnalyze = (gameId: string) => navigate(`/history/${gameId}`);

  return (
    <div className="game-layout">
      <NavSidebar activePage="play" />

      <div className="main-content">
        <div className="board-section">
          <GameCard
            difficulty={state.settings.difficulty}
            gameMode={state.settings.gameMode}
            gameStatus={state.game.status}
          >
            <div className="board-wrapper">
              <GameBoard
                gameState={displayGameState}
                validPawnMoves={validPawnMoves}
                wallPreview={isViewingHistory ? null : wallPreview}
                isHumanTurn={isHumanTurn}
                clickMoveEnabled={state.settings.clickMoveEnabled}
                onCellClick={handleCellClick}
                onWallHover={isViewingHistory ? () => {} : handleWallHover}
                onWallClick={isViewingHistory ? () => {} : handleWallClick}
              />
              <FencePanel
                playerFences={displayGameState.players[0].wallsRemaining}
                computerFences={displayGameState.players[1].wallsRemaining}
              />
            </div>
          </GameCard>

          <GameRightPanel
            gameStatus={state.game.status}
            gameMode={state.settings.gameMode}
            currentDifficulty={state.settings.difficulty}
            moveHistory={state.moveHistory}
            viewIndex={viewIndex}
            onPlay={handlePlay}
            onViewIndex={setViewIndex}
            onShowSettings={() => setShowSettings(true)}
            onResign={() => dispatch({ type: 'RESIGN' })}
          />
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={state.settings}
        onUpdateSettings={(patch) => dispatch({ type: 'UPDATE_SETTINGS', patch })}
        onResetScore={() => dispatch({ type: 'RESET_SCORE' })}
      />

      <WinLoseModal
        isOpen={showWinLose}
        winner={state.game.winner}
        savedGameId={state.lastSavedGameId}
        onPlayAgain={handleNewGame}
        onAnalyze={handleAnalyze}
        onClose={() => setShowWinLose(false)}
      />

      <DevStats
        visible={state.settings.devMode}
        gameState={state.game}
        aiContext={state.aiContext}
      />
    </div>
  );
}
