import type { GameState } from '@/engine/gameTypes';
import { GameActionButtons } from './GameActionButtons';
import { Scoreboard } from './Scoreboard';
import { StatusMessage } from './StatusMessage';

interface SidebarProps {
  gameState: GameState;
  playerScore: number;
  computerScore: number;
  message: { text: string; kind: 'info' | 'success' | 'error' } | null;
  onStartGame: () => void;
  onNewGame: () => void;
}

export function Sidebar({
  gameState,
  playerScore,
  computerScore,
  message,
  onStartGame,
  onNewGame,
}: SidebarProps) {
  return (
    <div className="sidebar flex-column flex-gap-lg">
      <Scoreboard playerScore={playerScore} computerScore={computerScore} />

      <GameActionButtons
        gameStatus={gameState.status}
        onStartGame={onStartGame}
        onNewGame={onNewGame}
      />

      <StatusMessage message={message} />
    </div>
  );
}
