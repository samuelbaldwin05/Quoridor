import type { ReactNode } from 'react';
import type { Settings } from '@/lib/schemas/settingsSchemas';

// 'bot0' is retired from selection but still labels older games. See gameReducer.
const DIFFICULTY_LABELS: Record<Settings['difficulty'], string> = {
  bot0: 'Beginner Bot',
  bot1: 'Easy Bot',
  bot2: 'Medium Bot',
  extreme: 'Hard AI',
  mcts: 'Extreme AI',
};

interface GameCardProps {
  difficulty?: Settings['difficulty'];
  gameMode?: Settings['gameMode'];
  opponentLabel?: string;
  playerLabel?: string;
  /** Optional content rendered inline on the right side of the top label row */
  topRight?: ReactNode;
  /** Optional content rendered inline on the right side of the bottom label row */
  bottomRight?: ReactNode;
  /** Opponent's remaining fence count — shown as a chip on mobile only */
  topFenceCount?: number;
  /** Player's remaining fence count — shown as a chip on mobile only */
  bottomFenceCount?: number;
  /** Optional extra class on the outermost wrapper (e.g. to hide on mobile) */
  wrapperClassName?: string;
  children: ReactNode;
}

export function GameCard({
  difficulty,
  gameMode,
  opponentLabel,
  playerLabel,
  topRight,
  bottomRight,
  topFenceCount,
  bottomFenceCount,
  wrapperClassName,
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
    <div className={`game-card${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <div className="game-card-header">
        <span>{topLabel}</span>
        <span className="game-card-header-right">
          {topFenceCount !== undefined && (
            <span className="mobile-fence-chip">Fences: {topFenceCount}</span>
          )}
          {topRight}
        </span>
      </div>

      <div className="game-card-body">{children}</div>

      <div className="game-card-footer">
        <span>{bottomLabel}</span>
        <span className="game-card-header-right">
          {bottomFenceCount !== undefined && (
            <span className="mobile-fence-chip">Fences: {bottomFenceCount}</span>
          )}
          {bottomRight}
        </span>
      </div>
    </div>
  );
}
