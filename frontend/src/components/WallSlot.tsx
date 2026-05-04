import type { Wall } from '@/engine/gameTypes';

interface WallSlotProps {
  wall: Wall;
  flipped: boolean;
  isPlaced: boolean;
  previewState: 'valid' | 'invalid' | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

export function WallSlot({
  wall,
  flipped,
  isPlaced,
  previewState,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: WallSlotProps) {
  // The board is a 17-track grid: cell tracks at odd positions (1,3,5,...),
  // gap tracks at even positions (2,4,6,...) — all 1-indexed.
  //
  // Board cell (r, c) → grid-row: r*2+1, grid-column: c*2+1
  //
  // Horizontal wall at (row, col):
  //   - sits in the gap ROW below board row `row`  → grid-row: row*2+2
  //   - spans board col `col` through col `col+1`  → grid-column: col*2+1 / span 3
  //
  // Vertical wall at (row, col):
  //   - sits in the gap COLUMN right of board col `col` → grid-column: col*2+2
  //   - spans board row `row` through row `row+1`       → grid-row: row*2+1 / span 3
  //
  // Adjacent same-orientation slots overlap on the cell column they share.
  // z-index decides which one wins on hover. Higher-axis-coord wins by default
  // so P0 perceives walls extending east+south from the hovered cell. For
  // P1 (rotated 180°), invert so lower-axis-coord wins → P1 also perceives
  // walls extending visually east+south from their hovered cell.
  const stackKey = wall.orientation === 'h' ? wall.col : wall.row;
  const zIndex = flipped ? 7 - stackKey : stackKey;

  const style: React.CSSProperties =
    wall.orientation === 'h'
      ? {
          gridRow: `${wall.row * 2 + 2}`,
          gridColumn: `${wall.col * 2 + 1} / span 3`,
          zIndex,
        }
      : {
          gridRow: `${wall.row * 2 + 1} / span 3`,
          gridColumn: `${wall.col * 2 + 2}`,
          zIndex,
        };

  const classes = [
    'wall-slot',
    isPlaced ? 'placed' : '',
    !isPlaced && previewState === 'valid' ? 'preview-valid' : '',
    !isPlaced && previewState === 'invalid' ? 'preview-invalid' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  );
}
