import type { Wall, Position } from './gameTypes';

export function wallsEqual(a: Wall, b: Wall): boolean {
  return a.row === b.row && a.col === b.col && a.orientation === b.orientation;
}

// An h-wall blocks vertical movement across the groove below its anchor row, and
// a v-wall blocks horizontal movement across the groove right of its anchor col —
// each over its 2-cell span. The index math below encodes exactly that.
export function wallBlocksMovement(wall: Wall, from: Position, to: Position): boolean {
  if (wall.orientation === 'h') {
    // Horizontal fence blocks vertical movement (same col)
    if (from.col === to.col) {
      const minRow = Math.min(from.row, to.row);
      const maxRow = Math.max(from.row, to.row);
      return (
        wall.row >= minRow && wall.row < maxRow && from.col >= wall.col && from.col <= wall.col + 1
      );
    }
  } else {
    // Vertical fence blocks horizontal movement (same row)
    if (from.row === to.row) {
      const minCol = Math.min(from.col, to.col);
      const maxCol = Math.max(from.col, to.col);
      return (
        wall.col >= minCol && wall.col < maxCol && from.row >= wall.row && from.row <= wall.row + 1
      );
    }
  }
  return false;
}

export function isMovementBlocked(from: Position, to: Position, walls: readonly Wall[]): boolean {
  return walls.some((w) => wallBlocksMovement(w, from, to));
}

// Two walls collide if they share the same center post — the (2r+1, 2c+1) lattice
// point an h- and a v-wall would both occupy.
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

// Two same-orientation walls intersect when they're collinear and their 2-cell
// spans overlap. Different orientations never intersect here (post-overlap covers them).
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
