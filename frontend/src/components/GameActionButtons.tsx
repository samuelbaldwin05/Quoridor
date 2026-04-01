interface GameActionButtonsProps {
  gameStatus: 'idle' | 'playing' | 'finished';
  onStartGame: () => void;
  onNewGame: () => void;
  onShowRules: () => void;
  onShowSettings: () => void;
}

export function GameActionButtons({
  gameStatus,
  onStartGame,
  onNewGame,
  onShowRules,
  onShowSettings,
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

  return (
    <div className="game-buttons flex-column flex-gap-md">
      <div className="button-row flex flex-gap-md">
        <button className="btn action-btn half-width" onClick={onNewGame}>
          New Game
        </button>
        <button className="btn action-btn half-width" onClick={onShowRules}>
          Rules
        </button>
        <button className="btn action-btn half-width" onClick={onShowSettings}>
          Settings
        </button>
      </div>
    </div>
  );
}
