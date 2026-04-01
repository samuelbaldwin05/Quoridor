import { useCallback, useEffect, useState } from 'react';
import { DevStats } from '@/components/DevStats';
import { GameBoard } from '@/components/GameBoard';
import { RulesModal } from '@/components/RulesModal';
import { SettingsModal } from '@/components/SettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { getValidPawnMoves } from '@/engine/moveValidation';
import type { Position } from '@/engine/gameTypes';
import { MESSAGE_TIMEOUT_MS } from '@/engine/constants';
import { useAi } from '@/hooks/useAi';
import { useAudio } from '@/hooks/useAudio';
import { useBoardInteraction } from '@/hooks/useBoardInteraction';
import { useGame } from '@/hooks/useGame';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useTheme } from '@/hooks/useTheme';

export function GamePage() {
  const { state, dispatch } = useGame();
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const audio = useAudio(state.settings.soundEnabled, state.settings.volume);

  const { wallPreview, validPawnMoves, handleCellClick, handleWallHover, handleWallClick } =
    useBoardInteraction(state, dispatch);

  useAi(state, dispatch);
  useTheme(state.settings.theme);

  const isHumanTurn =
    state.game.status === 'playing' && state.game.currentPlayerIndex === 0;

  // Sound effects triggered by game state changes
  const prevStatusRef = useCallback(() => state.game.status, [state.game.status]);
  useEffect(() => {
    void prevStatusRef;
  }, [prevStatusRef]);

  // Auto-clear messages
  useEffect(() => {
    if (!state.message) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'CLEAR_MESSAGE' });
    }, MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.message, dispatch]);

  // Play sounds on relevant actions
  const prevWallCount = useEffect(() => {
    void prevWallCount;
  }, []);

  // Simple sound triggers based on game transitions
  useEffect(() => {
    if (state.game.status === 'playing' && state.game.currentPlayerIndex === 1) {
      // Human just moved
      audio.playMove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.game.currentPlayerIndex, state.game.status]);

  useEffect(() => {
    if (state.game.status === 'finished') {
      if (state.game.winner === 0) {
        audio.playWin();
      } else {
        audio.playLose();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.game.status, state.game.winner]);

  // Keyboard movement
  const handleKeyboardMove = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (!isHumanTurn) return;
      const player = state.game.players[0];
      const dirMap = {
        up: { row: -1, col: 0 },
        down: { row: 1, col: 0 },
        left: { row: 0, col: -1 },
        right: { row: 0, col: 1 },
      };
      const delta = dirMap[dir];
      const target: Position = {
        row: player.position.row + delta.row,
        col: player.position.col + delta.col,
      };
      const validMoves = getValidPawnMoves(state.game, 0);
      const isValid = validMoves.some((m) => m.row === target.row && m.col === target.col);
      if (isValid) {
        dispatch({ type: 'APPLY_MOVE', move: { kind: 'pawn', to: target } });
      }
    },
    [isHumanTurn, state.game, dispatch],
  );

  useKeyboard(state.settings.keyboardEnabled, isHumanTurn, handleKeyboardMove);

  const handleStartGame = () => {
    dispatch({ type: 'START_GAME' });
    audio.playStart();
  };

  const handleNewGame = () => {
    dispatch({ type: 'NEW_GAME' });
    audio.playStart();
  };

  return (
    <div className="simple-container">
      <div className="game-area flex flex-gap-lg" style={{ padding: '20px' }}>
        <div className="board-container flex-center">
          <GameBoard
            gameState={state.game}
            validPawnMoves={validPawnMoves}
            wallPreview={wallPreview}
            isHumanTurn={isHumanTurn}
            clickMoveEnabled={state.settings.clickMoveEnabled}
            onCellClick={handleCellClick}
            onWallHover={handleWallHover}
            onWallClick={handleWallClick}
          />
        </div>

        <Sidebar
          gameState={state.game}
          playerScore={state.score.player}
          computerScore={state.score.computer}
          message={state.message}
          isHumanTurn={isHumanTurn}
          onMove={handleKeyboardMove}
          onStartGame={handleStartGame}
          onNewGame={handleNewGame}
          onShowRules={() => setShowRules(true)}
          onShowSettings={() => setShowSettings(true)}
        />
      </div>

      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={state.settings}
        onUpdateSettings={(patch) => dispatch({ type: 'UPDATE_SETTINGS', patch })}
        onResetScore={() => dispatch({ type: 'RESET_SCORE' })}
      />

      <DevStats
        visible={state.settings.devMode}
        gameState={state.game}
        aiContext={state.aiContext}
      />
    </div>
  );
}
