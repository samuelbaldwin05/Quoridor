import type { Wall } from '@/engine/gameTypes';

interface WallSlotProps {
  wall: Wall;
  isPlaced: boolean;
  previewState: 'valid' | 'invalid' | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

export function WallSlot({
  wall,
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
  const style: React.CSSProperties =
    wall.orientation === 'h'
      ? {
          gridRow: `${wall.row * 2 + 2}`,
          gridColumn: `${wall.col * 2 + 1} / span 3`,
        }
      : {
          gridRow: `${wall.row * 2 + 1} / span 3`,
          gridColumn: `${wall.col * 2 + 2}`,
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
