import { describe, expect, it } from 'vitest';
import {
  isMovementBlocked,
  wallBlocksMovement,
  wallsEqual,
  wallsIntersect,
  wouldWallPostOverlap,
} from '../wallUtils';
import type { Wall } from '../gameTypes';

// ── wallsEqual ────────────────────────────────────────────────────────────────

describe('wallsEqual', () => {
  it('returns true for identical walls', () => {
    expect(wallsEqual({ row: 3, col: 4, orientation: 'h' }, { row: 3, col: 4, orientation: 'h' })).toBe(true);
  });
  it('returns false when row differs', () => {
    expect(wallsEqual({ row: 3, col: 4, orientation: 'h' }, { row: 4, col: 4, orientation: 'h' })).toBe(false);
  });
  it('returns false when col differs', () => {
    expect(wallsEqual({ row: 3, col: 4, orientation: 'h' }, { row: 3, col: 5, orientation: 'h' })).toBe(false);
  });
  it('returns false when orientation differs', () => {
    expect(wallsEqual({ row: 3, col: 4, orientation: 'h' }, { row: 3, col: 4, orientation: 'v' })).toBe(false);
  });
});

// ── wallBlocksMovement ────────────────────────────────────────────────────────

describe('wallBlocksMovement — horizontal walls block vertical movement', () => {
  // H-wall at (row=7, col=4) should block (8,4)→(7,4)
  const hWall: Wall = { row: 7, col: 4, orientation: 'h' };

  it('blocks movement from row+1 to row at left col', () => {
    expect(wallBlocksMovement(hWall, { row: 8, col: 4 }, { row: 7, col: 4 })).toBe(true);
  });
  it('blocks movement from row to row+1 (reverse direction)', () => {
    expect(wallBlocksMovement(hWall, { row: 7, col: 4 }, { row: 8, col: 4 })).toBe(true);
  });
  it('blocks movement at right col (col+1)', () => {
    // H-wall at col=4 spans cols 4 and 5
    expect(wallBlocksMovement(hWall, { row: 8, col: 5 }, { row: 7, col: 5 })).toBe(true);
  });
  it('does NOT block movement at col outside span', () => {
    expect(wallBlocksMovement(hWall, { row: 8, col: 3 }, { row: 7, col: 3 })).toBe(false);
    expect(wallBlocksMovement(hWall, { row: 8, col: 6 }, { row: 7, col: 6 })).toBe(false);
  });
  it('does NOT block horizontal movement (same row)', () => {
    expect(wallBlocksMovement(hWall, { row: 7, col: 4 }, { row: 7, col: 5 })).toBe(false);
  });
  it('does NOT block vertical movement two rows away', () => {
    expect(wallBlocksMovement(hWall, { row: 9, col: 4 }, { row: 8, col: 4 })).toBe(false);
  });
});

describe('wallBlocksMovement — vertical walls block horizontal movement', () => {
  // V-wall at (row=7, col=4) blocks horizontal movement between cols 4 and 5 at rows 7 and 8
  const vWall: Wall = { row: 7, col: 4, orientation: 'v' };

  it('blocks movement from col to col+1 at top row', () => {
    expect(wallBlocksMovement(vWall, { row: 7, col: 4 }, { row: 7, col: 5 })).toBe(true);
  });
  it('blocks movement from col to col+1 at bottom row (row+1)', () => {
    expect(wallBlocksMovement(vWall, { row: 8, col: 4 }, { row: 8, col: 5 })).toBe(true);
  });
  it('blocks movement from col+1 to col (reverse direction)', () => {
    expect(wallBlocksMovement(vWall, { row: 8, col: 5 }, { row: 8, col: 4 })).toBe(true);
  });
  it('does NOT block vertical movement (same col)', () => {
    expect(wallBlocksMovement(vWall, { row: 8, col: 4 }, { row: 7, col: 4 })).toBe(false);
  });
  it('does NOT block horizontal movement at row outside span', () => {
    expect(wallBlocksMovement(vWall, { row: 6, col: 4 }, { row: 6, col: 5 })).toBe(false);
    expect(wallBlocksMovement(vWall, { row: 9, col: 4 }, { row: 9, col: 5 })).toBe(false);
  });
  it('does NOT block movement at col outside span', () => {
    expect(wallBlocksMovement(vWall, { row: 8, col: 3 }, { row: 8, col: 4 })).toBe(false);
  });
});

// ── isMovementBlocked ─────────────────────────────────────────────────────────

describe('isMovementBlocked', () => {
  it('returns false for empty wall list', () => {
    expect(isMovementBlocked({ row: 8, col: 4 }, { row: 7, col: 4 }, [])).toBe(false);
  });
  it('returns true if any wall blocks', () => {
    const walls: Wall[] = [
      { row: 3, col: 3, orientation: 'h' },
      { row: 7, col: 4, orientation: 'h' },
    ];
    expect(isMovementBlocked({ row: 8, col: 4 }, { row: 7, col: 4 }, walls)).toBe(true);
  });
  it('returns false when walls exist but none block the given move', () => {
    const walls: Wall[] = [{ row: 3, col: 3, orientation: 'h' }];
    expect(isMovementBlocked({ row: 8, col: 4 }, { row: 7, col: 4 }, walls)).toBe(false);
  });
});

// ── wouldWallPostOverlap ──────────────────────────────────────────────────────

describe('wouldWallPostOverlap', () => {
  it('detects post overlap between h and v wall at same position', () => {
    const existing: Wall[] = [{ row: 4, col: 4, orientation: 'h' }];
    expect(wouldWallPostOverlap({ row: 4, col: 4, orientation: 'v' }, existing)).toBe(true);
  });
  it('returns false when no overlap', () => {
    const existing: Wall[] = [{ row: 4, col: 4, orientation: 'h' }];
    expect(wouldWallPostOverlap({ row: 4, col: 5, orientation: 'h' }, existing)).toBe(false);
  });
  it('returns false for empty existing walls', () => {
    expect(wouldWallPostOverlap({ row: 4, col: 4, orientation: 'h' }, [])).toBe(false);
  });
  it('detects overlap regardless of orientation', () => {
    const existing: Wall[] = [{ row: 2, col: 3, orientation: 'v' }];
    expect(wouldWallPostOverlap({ row: 2, col: 3, orientation: 'h' }, existing)).toBe(true);
  });
});

// ── wallsIntersect ────────────────────────────────────────────────────────────

describe('wallsIntersect', () => {
  it('two h-walls on same row with overlapping col spans intersect', () => {
    // (4,3,'h') spans cols 3-4; (4,4,'h') spans cols 4-5 — they overlap at col 4
    expect(wallsIntersect(
      { row: 4, col: 3, orientation: 'h' },
      { row: 4, col: 4, orientation: 'h' },
    )).toBe(true);
  });
  it('two h-walls on same row with adjacent but non-overlapping spans do not intersect', () => {
    // (4,3,'h') spans 3-4; (4,5,'h') spans 5-6 — gap at col 4-5, no overlap
    expect(wallsIntersect(
      { row: 4, col: 3, orientation: 'h' },
      { row: 4, col: 5, orientation: 'h' },
    )).toBe(false);
  });
  it('two h-walls on different rows do not intersect', () => {
    expect(wallsIntersect(
      { row: 4, col: 4, orientation: 'h' },
      { row: 5, col: 4, orientation: 'h' },
    )).toBe(false);
  });
  it('two v-walls on same col with overlapping row spans intersect', () => {
    expect(wallsIntersect(
      { row: 3, col: 4, orientation: 'v' },
      { row: 4, col: 4, orientation: 'v' },
    )).toBe(true);
  });
  it('two v-walls on same col with non-overlapping row spans do not intersect', () => {
    expect(wallsIntersect(
      { row: 2, col: 4, orientation: 'v' },
      { row: 4, col: 4, orientation: 'v' },
    )).toBe(false);
  });
  it('h and v walls never intersect (different orientations)', () => {
    expect(wallsIntersect(
      { row: 4, col: 4, orientation: 'h' },
      { row: 4, col: 4, orientation: 'v' },
    )).toBe(false);
  });
  it('identical walls are considered intersecting', () => {
    const w: Wall = { row: 3, col: 3, orientation: 'h' };
    expect(wallsIntersect(w, w)).toBe(true);
  });
});
