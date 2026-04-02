import type { Settings } from '@/lib/schemas/settingsSchemas';

const DIFFICULTY_LABELS: Record<Settings['difficulty'], string> = {
  bot0: 'Easy Bot',
  bot1: 'Medium Bot',
  bot2: 'Hard Bot',
};

interface GameCardProps {
  difficulty: Settings['difficulty'];
  gameMode: Settings['gameMode'];
  gameStatus: 'idle' | 'playing' | 'finished';
  onShowSettings: () => void;
  onResign: () => void;
  children: React.ReactNode;
}

export function GameCard({
  difficulty,
  gameMode,
  gameStatus,
  onShowSettings,
  onResign,
  children,
}: GameCardProps) {
  const isPlaying = gameStatus === 'playing';
  const isPassAndPlay = gameMode === 'pass-and-play';

  const topLabel = isPassAndPlay ? 'Player 2' : DIFFICULTY_LABELS[difficulty];
  const bottomLabel = isPassAndPlay ? 'Player 1' : 'You';

  return (
    <div className="game-card">
      <div className="game-card-header">{topLabel}</div>

      <div className="game-card-body">
        {children}

        <div className="game-card-actions">
          <button
            className="game-card-action-btn"
            onClick={onShowSettings}
            title="Settings"
            aria-label="Settings"
          >
            ⚙
          </button>
          {isPlaying && (
            <button
              className="game-card-action-btn game-card-resign-btn"
              onClick={onResign}
              title="Resign"
              aria-label="Resign"
            >
              ⚑
            </button>
          )}
        </div>
      </div>

      <div className="game-card-footer">{bottomLabel}</div>
    </div>
  );
}
