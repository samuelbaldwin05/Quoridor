import type { Wall, Position } from './gameTypes';

export function wallsEqual(a: Wall, b: Wall): boolean {
  return a.row === b.row && a.col === b.col && a.orientation === b.orientation;
}

/**
 * Port of Fence.blocksMovement
 * Horizontal fence (orientation='h'): blocks vertical movement
 *   condition: fence.row >= min(fromRow,toRow) && fence.row < max(fromRow,toRow)
 *              && fromCol >= fence.col && fromCol <= fence.col+1
 * Vertical fence (orientation='v'): blocks horizontal movement
 *   condition: fence.col >= min(fromCol,toCol) && fence.col < max(fromCol,toCol)
 *              && fromRow >= fence.row && fromRow <= fence.row+1
 */
export function wallBlocksMovement(wall: Wall, from: Position, to: Position): boolean {
  if (wall.orientation === 'h') {
    // Horizontal fence blocks vertical movement (same col)
    if (from.col === to.col) {
      const minRow = Math.min(from.row, to.row);
      const maxRow = Math.max(from.row, to.row);
      return (
        wall.row >= minRow &&
        wall.row < maxRow &&
        from.col >= wall.col &&
        from.col <= wall.col + 1
      );
    }
  } else {
    // Vertical fence blocks horizontal movement (same row)
    if (from.row === to.row) {
      const minCol = Math.min(from.col, to.col);
      const maxCol = Math.max(from.col, to.col);
      return (
        wall.col >= minCol &&
        wall.col < maxCol &&
        from.row >= wall.row &&
        from.row <= wall.row + 1
      );
    }
  }
  return false;
}

export function isMovementBlocked(from: Position, to: Position, walls: readonly Wall[]): boolean {
  return walls.some((w) => wallBlocksMovement(w, from, to));
}

/**
 * Port of GameEngine.wouldFencePostOverlap
 * newFencePostRow = fence.row * 2 + 1
 * newFencePostCol = fence.col * 2 + 1
 */
export function wouldWallPostOverlap(candidate: Wall, existing: readonly Wall[]): boolean {
  const newPostRow = candidate.row * 2 + 1;
  const newPostCol = candidate.col * 2 + 1;
  for (const w of existing) {
    const existingPostRow = w.row * 2 + 1;
    const existingPostCol = w.col * 2 + 1;
    if (newPostRow === existingPostRow && newPostCol === existingPostCol) {
      return true;
    }
  }
  return false;
}

/**
 * Port of GameEngine.fencesIntersect
 * Same orientation:
 *   horizontal => same row, col spans overlap (!(col+1 < other.col || other.col+1 < col))
 *   vertical   => same col, row spans overlap
 * Different orientations: return false
 */
export function wallsIntersect(a: Wall, b: Wall): boolean {
  if (a.orientation === b.orientation) {
    if (a.orientation === 'h') {
      return a.row === b.row && !(a.col + 1 < b.col || b.col + 1 < a.col);
    } else {
      return a.col === b.col && !(a.row + 1 < b.row || b.row + 1 < a.row);
    }
  }
  return false;
}
