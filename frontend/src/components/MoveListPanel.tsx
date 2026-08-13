import { useEffect, useRef } from 'react';
import type { StoredMove } from '@/engine/gameTypes';
import { serializeMove } from '@/engine/notation';
import { moveIcon } from '@/engine/moveDisplay';
import { useHoldRepeat } from '@/hooks/useHoldRepeat';

// Shared "Moves" panel: the scrollable move list plus the back/forward/settings/resign
// controls, used by both GameRightPanel (offline) and OnlineGamePage. The two used to
// duplicate this markup; behaviour (auto-scroll to live, keep the active entry visible,
// hold-to-repeat nav) lives here so both stay in lockstep. Callers own viewIndex and
// supply how to label each side (You/Bot/P1/P2 offline, You/opponentName online).
interface MoveListPanelProps {
  moveHistory: StoredMove[];
  /** null = live (following the latest move); number = viewing state after N moves. */
  viewIndex: number | null;
  onViewIndex: React.Dispatch<React.SetStateAction<number | null>>;
  playerLabel: (idx: 0 | 1) => string;
  /** Show the resign control (only while a game is in progress). */
  showResign: boolean;
  onResign?: () => void;
  onShowSettings?: () => void;
}

export function MoveListPanel({
  moveHistory,
  viewIndex,
  onViewIndex,
  playerLabel,
  showResign,
  onResign,
  onShowSettings,
}: MoveListPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeEntryRef = useRef<HTMLButtonElement>(null);

  const isLive = viewIndex === null;
  const effectiveIndex = viewIndex ?? moveHistory.length;

  // Auto-scroll to the bottom as moves arrive while live.
  useEffect(() => {
    if (isLive && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [moveHistory.length, isLive]);

  // While navigating history, keep the active entry in view.
  useEffect(() => {
    if (isLive) return;
    activeEntryRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [effectiveIndex, isLive]);

  function handleBack() {
    onViewIndex((cur) => {
      const c = cur ?? moveHistory.length;
      return c > 0 ? c - 1 : cur;
    });
  }

  function handleForward() {
    onViewIndex((cur) => {
      const c = cur ?? moveHistory.length;
      if (c >= moveHistory.length) return null;
      const next = c + 1;
      return next >= moveHistory.length ? null : next;
    });
  }

  const backHold = useHoldRepeat(handleBack);
  const forwardHold = useHoldRepeat(handleForward);

  return (
    <div className="right-panel game-history-panel">
      <div className="ghp-header">
        <span className="play-panel-heading" style={{ margin: 0 }}>
          Moves
        </span>
        {!isLive && (
          <button className="ghp-live-btn" onClick={() => onViewIndex(null)}>
            Live ↓
          </button>
        )}
      </div>

      <div className="ghp-list" ref={listRef}>
        <button
          ref={effectiveIndex === 0 ? activeEntryRef : null}
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
              ref={isActive ? activeEntryRef : null}
              className={`ghp-entry${isActive ? ' ghp-entry-active' : ''}`}
              onClick={() => onViewIndex(i + 1)}
            >
              <span className="ghp-num">{i + 1}</span>
              <span className="ghp-icon">{moveIcon(sm.move)}</span>
              <span className="ghp-notation">{serializeMove(sm.move)}</span>
              <span className="ghp-who">{playerLabel(sm.playerIndex)}</span>
            </button>
          );
        })}
      </div>

      <div className="ghp-controls">
        <button
          className="btn ghp-nav-btn"
          {...backHold}
          disabled={effectiveIndex === 0}
          title="Previous move"
        >
          ←
        </button>
        <span className="ghp-position">
          {isLive ? 'Live' : `${effectiveIndex} / ${moveHistory.length}`}
        </span>
        <button className="btn ghp-nav-btn" {...forwardHold} disabled={isLive} title="Next move">
          →
        </button>

        {onShowSettings && (
          <button
            className="btn ghp-nav-btn ghp-action-btn"
            onClick={onShowSettings}
            title="Settings"
          >
            ⚙
          </button>
        )}
        {onResign && showResign && (
          <button className="btn ghp-nav-btn ghp-resign-btn" onClick={onResign} title="Resign">
            ⚑
          </button>
        )}
      </div>
    </div>
  );
}
