import type { StoredMove } from '@/engine/gameTypes';
import type { Settings } from '@/lib/schemas/settingsSchemas';
import { MoveListPanel } from './MoveListPanel';
import { PlayPanel } from './PlayPanel';

// ── types ────────────────────────────────────────────────────────────────────
interface GameRightPanelProps {
  gameStatus: 'idle' | 'playing' | 'finished';
  gameMode: Settings['gameMode'];
  currentDifficulty: Settings['difficulty'];
  moveHistory: StoredMove[];
  /** null = live; number = viewing state after N moves */
  viewIndex: number | null;
  onPlay: (difficulty: Settings['difficulty'], gameMode: Settings['gameMode']) => void;
  onViewIndex: React.Dispatch<React.SetStateAction<number | null>>;
  onResign?: () => void;
  onShowSettings?: () => void;
}

export function GameRightPanel({
  gameStatus,
  gameMode,
  currentDifficulty,
  moveHistory,
  viewIndex,
  onPlay,
  onViewIndex,
  onResign,
  onShowSettings,
}: GameRightPanelProps) {
  const isPassAndPlay = gameMode === 'pass-and-play';

  // ── idle: show play panel ────────────────────────────────────────────────
  if (gameStatus === 'idle') {
    return <PlayPanel currentDifficulty={currentDifficulty} onPlay={onPlay} />;
  }

  // ── playing / finished: show move history ─────────────────────────────────
  const playerLabel = (idx: 0 | 1) => {
    if (isPassAndPlay) return idx === 0 ? 'P1' : 'P2';
    return idx === 0 ? 'You' : 'Bot';
  };

  return (
    <MoveListPanel
      moveHistory={moveHistory}
      viewIndex={viewIndex}
      onViewIndex={onViewIndex}
      playerLabel={playerLabel}
      showResign={gameStatus === 'playing'}
      onResign={onResign}
      onShowSettings={onShowSettings}
    />
  );
}
