import type { GameState } from '@/engine/gameTypes';
import { FenceCounter } from './FenceCounter';
import { GameActionButtons } from './GameActionButtons';
import { MovementControls } from './MovementControls';
import { Scoreboard } from './Scoreboard';
import { StatusMessage } from './StatusMessage';

interface SidebarProps {
  gameState: GameState;
  playerScore: number;
  computerScore: number;
  message: { text: string; kind: 'info' | 'success' | 'error' } | null;
  isHumanTurn: boolean;
  onMove: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onStartGame: () => void;
  onNewGame: () => void;
  onShowRules: () => void;
  onShowSettings: () => void;
}

export function Sidebar({
  gameState,
  playerScore,
  computerScore,
  message,
  isHumanTurn,
  onMove,
  onStartGame,
  onNewGame,
  onShowRules,
  onShowSettings,
}: SidebarProps) {
  return (
    <div className="sidebar flex-column flex-gap-lg">
      <Scoreboard playerScore={playerScore} computerScore={computerScore} />

      <FenceCounter
        playerFences={gameState.players[0].wallsRemaining}
        computerFences={gameState.players[1].wallsRemaining}
      />

      <MovementControls
        onMove={onMove}
        disabled={!isHumanTurn}
      />

      <GameActionButtons
        gameStatus={gameState.status}
        onStartGame={onStartGame}
        onNewGame={onNewGame}
        onShowRules={onShowRules}
        onShowSettings={onShowSettings}
      />

      <StatusMessage message={message} />
    </div>
  );
}
