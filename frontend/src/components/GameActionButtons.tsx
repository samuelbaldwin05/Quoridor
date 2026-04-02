interface GameActionButtonsProps {
  gameStatus: 'idle' | 'playing' | 'finished';
  onStartGame: () => void;
  onNewGame: () => void;
}

export function GameActionButtons({
  gameStatus,
  onStartGame,
  onNewGame,
}: GameActionButtonsProps) {
  if (gameStatus === 'idle') {
    return (
      <div className="game-buttons flex-column flex-gap-md">
        <button className="btn action-btn" onClick={onStartGame}>
          Start Game
        </button>
      </div>
    );
  }

  if (gameStatus === 'finished') {
    return (
      <div className="game-buttons flex-column flex-gap-md">
        <button className="btn action-btn" onClick={onNewGame}>
          New Game
        </button>
      </div>
    );
  }

  return null;
}
