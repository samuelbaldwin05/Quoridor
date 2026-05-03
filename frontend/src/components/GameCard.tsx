import type { ReactNode } from 'react';
import type { Settings } from '@/lib/schemas/settingsSchemas';

const DIFFICULTY_LABELS: Record<Settings['difficulty'], string> = {
  bot0: 'Easy Bot',
  bot1: 'Medium Bot',
  bot2: 'Hard Bot',
  extreme: 'Extreme AI',
};

interface GameCardProps {
  difficulty?: Settings['difficulty'];
  gameMode?: Settings['gameMode'];
  gameStatus: 'idle' | 'playing' | 'finished';
  opponentLabel?: string;
  playerLabel?: string;
  /** Optional content rendered inline on the right side of the top label row */
  topRight?: ReactNode;
  /** Optional content rendered inline on the right side of the bottom label row */
  bottomRight?: ReactNode;
  children: ReactNode;
}

export function GameCard({
  difficulty,
  gameMode,
  gameStatus: _gameStatus,
  opponentLabel,
  playerLabel,
  topRight,
  bottomRight,
  children,
}: GameCardProps) {
  const isPassAndPlay = gameMode === 'pass-and-play';

  let topLabel: string;
  if (opponentLabel !== undefined) {
    topLabel = opponentLabel;
  } else if (isPassAndPlay) {
    topLabel = 'Player 2';
  } else {
    topLabel = difficulty ? DIFFICULTY_LABELS[difficulty] : 'Opponent';
  }
  const bottomLabel = playerLabel ?? (isPassAndPlay ? 'Player 1' : 'You');

  return (
    <div className="game-card">
      <div className="game-card-header">
        <span>{topLabel}</span>
        {topRight && <span className="game-card-header-right">{topRight}</span>}
      </div>

      <div className="game-card-body">
        {children}
      </div>

      <div className="game-card-footer">
        <span>{bottomLabel}</span>
        {bottomRight && <span className="game-card-header-right">{bottomRight}</span>}
      </div>
    </div>
  );
}
