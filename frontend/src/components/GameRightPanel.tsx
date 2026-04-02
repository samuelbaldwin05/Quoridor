import { useRef, useEffect } from 'react';
import type { StoredMove, Move } from '@/engine/gameTypes';
import type { Settings } from '@/lib/schemas/settingsSchemas';
import { PlayPanel } from './PlayPanel';

// ── move notation ────────────────────────────────────────────────────────────
function moveNotation(move: Move): string {
  const col = (c: number) => String.fromCharCode(97 + c);
  const rank = (r: number) => String(9 - r);
  if (move.kind === 'pawn') {
    return `${col(move.to.col)}${rank(move.to.row)}`;
  }
  return `${col(move.wall.col)}${rank(move.wall.row)}${move.wall.orientation}`;
}

function moveIcon(move: Move) {
  return move.kind === 'pawn' ? '♟' : '⊟';
}

// ── types ────────────────────────────────────────────────────────────────────
interface GameRightPanelProps {
  gameStatus: 'idle' | 'playing' | 'finished';
  gameMode: Settings['gameMode'];
  currentDifficulty: Settings['difficulty'];
  moveHistory: StoredMove[];
  /** null = live; number = viewing state after N moves */
  viewIndex: number | null;
  onPlay: (difficulty: Settings['difficulty'], gameMode: Settings['gameMode']) => void;
  onViewIndex: (index: number | null) => void;
}

export function GameRightPanel({
  gameStatus,
  gameMode,
  currentDifficulty,
  moveHistory,
  viewIndex,
  onPlay,
  onViewIndex,
}: GameRightPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isPassAndPlay = gameMode === 'pass-and-play';

  const effectiveIndex = viewIndex ?? moveHistory.length;
  const isLive = viewIndex === null;

  // Auto-scroll list to bottom when new moves arrive and we're live
  useEffect(() => {
    if (isLive && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [moveHistory.length, isLive]);

  function handleBack() {
    if (effectiveIndex <= 0) return;
    onViewIndex(effectiveIndex - 1);
  }

  function handleForward() {
    if (effectiveIndex >= moveHistory.length) {
      onViewIndex(null); // back to live
      return;
    }
    const next = effectiveIndex + 1;
    onViewIndex(next >= moveHistory.length ? null : next);
  }

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
    <div className="right-panel game-history-panel">
      <div className="ghp-header">
        <span className="play-panel-heading" style={{ margin: 0 }}>Moves</span>
        {!isLive && (
          <button className="ghp-live-btn" onClick={() => onViewIndex(null)}>
            Live ↓
          </button>
        )}
      </div>

      <div className="ghp-list" ref={listRef}>
        {/* Initial position entry */}
        <button
          className={`ghp-entry ghp-initial${effectiveIndex === 0 ? ' ghp-entry-active' : ''}`}
          onClick={() => onViewIndex(0)}
        >
          Start
        </button>

        {moveHistory.map((sm, i) => {
          const isActive = effectiveIndex === i + 1;
          return (
            <button
              key={i}
              className={`ghp-entry${isActive ? ' ghp-entry-active' : ''}`}
              onClick={() => onViewIndex(i + 1)}
            >
              <span className="ghp-num">{i + 1}</span>
              <span className="ghp-icon">{moveIcon(sm.move)}</span>
              <span className="ghp-notation">{moveNotation(sm.move)}</span>
              <span className="ghp-who">{playerLabel(sm.playerIndex)}</span>
            </button>
          );
        })}

        {moveHistory.length === 0 && (
          <p className="ghp-empty">No moves yet</p>
        )}
      </div>

      <div className="ghp-controls">
        <button
          className="btn ghp-nav-btn"
          onClick={handleBack}
          disabled={effectiveIndex === 0}
          title="Previous move"
        >
          ←
        </button>
        <span className="ghp-position">
          {isLive ? 'Live' : `${effectiveIndex} / ${moveHistory.length}`}
        </span>
        <button
          className="btn ghp-nav-btn"
          onClick={handleForward}
          disabled={isLive}
          title="Next move"
        >
          →
        </button>
      </div>
    </div>
  );
}
