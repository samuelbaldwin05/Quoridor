import { useEffect } from 'react';

/** Marks the board grid. Taps inside it are the board's own business. */
export const BOARD_GRID_ATTR = 'data-board-grid';

/**
 * Takes a proposed move back down when the next tap lands anywhere but the board.
 *
 * In confirm mode the first tap is committed state, not a pointer echo, so nothing removed it
 * once drawn: a proposed fence sat on the board while you opened settings, scrolled the move
 * list or did anything else, right up until the turn ended. Taps on the board itself are left
 * alone, because the cell and slot handlers already decide what a second tap means there.
 *
 * Both the offline hook and OnlineGamePage keep their own copy of the pending intent, so this
 * takes a callback rather than owning it.
 */
export function useDismissOnOutsideTap(active: boolean, dismiss: () => void): void {
  useEffect(() => {
    if (!active) return;

    // pointerdown, not click: it fires first, so the proposal is gone before whatever the tap
    // actually opens has a chance to render over it.
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (target?.closest?.(`[${BOARD_GRID_ATTR}]`)) return;
      dismiss();
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [active, dismiss]);
}
