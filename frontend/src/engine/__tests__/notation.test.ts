import { describe, expect, it } from 'vitest';
import { NotationError, parseMove, serializeMove } from '../notation';
import type { Move } from '../gameTypes';

// ── parseMove ─────────────────────────────────────────────────────────────────

describe('parseMove — pawn moves', () => {
  it('parses center pawn move e5', () => {
    const m = parseMove('e5');
    expect(m.kind).toBe('pawn');
    if (m.kind === 'pawn') {
      expect(m.to).toEqual({ row: 4, col: 4 }); // rank 5 → row 9-5=4, col e → 4
    }
  });
  it('parses bottom-left corner a1', () => {
    const m = parseMove('a1');
    if (m.kind === 'pawn') expect(m.to).toEqual({ row: 8, col: 0 });
  });
  it('parses top-right corner i9', () => {
    const m = parseMove('i9');
    if (m.kind === 'pawn') expect(m.to).toEqual({ row: 0, col: 8 });
  });
  it('parses a9 (top-left)', () => {
    const m = parseMove('a9');
    if (m.kind === 'pawn') expect(m.to).toEqual({ row: 0, col: 0 });
  });
  it('parses i1 (bottom-right)', () => {
    const m = parseMove('i1');
    if (m.kind === 'pawn') expect(m.to).toEqual({ row: 8, col: 8 });
  });
  it('parses e2 (p0 first forward move)', () => {
    const m = parseMove('e2');
    if (m.kind === 'pawn') expect(m.to).toEqual({ row: 7, col: 4 });
  });
  it('is case insensitive', () => {
    const lower = parseMove('e5');
    const upper = parseMove('E5');
    expect(lower).toEqual(upper);
  });
  it('trims whitespace', () => {
    const m = parseMove('  e5  ');
    expect(m.kind).toBe('pawn');
  });
});

describe('parseMove — wall moves', () => {
  it('parses horizontal wall e3h', () => {
    const m = parseMove('e3h');
    expect(m.kind).toBe('wall');
    if (m.kind === 'wall') {
      expect(m.wall).toEqual({ row: 6, col: 4, orientation: 'h' }); // rank 3 → row 9-3=6
    }
  });
  it('parses vertical wall e3v', () => {
    const m = parseMove('e3v');
    if (m.kind === 'wall') {
      expect(m.wall).toEqual({ row: 6, col: 4, orientation: 'v' });
    }
  });
  it('parses wall at minimum rank a2h', () => {
    const m = parseMove('a2h');
    if (m.kind === 'wall') expect(m.wall).toEqual({ row: 7, col: 0, orientation: 'h' });
  });
  it('parses wall at maximum rank i9h', () => {
    const m = parseMove('i9h');
    if (m.kind === 'wall') expect(m.wall).toEqual({ row: 0, col: 8, orientation: 'h' });
  });
  it('rejects wall at rank 1 (h-walls need rank ≥ 2)', () => {
    expect(() => parseMove('e1h')).toThrowError(NotationError);
  });
});

describe('parseMove — invalid input', () => {
  it('throws NotationError for empty string', () => {
    expect(() => parseMove('')).toThrowError(NotationError);
  });
  it('throws for out-of-range col z1', () => {
    expect(() => parseMove('z1')).toThrowError(NotationError);
  });
  it('throws for out-of-range rank e0', () => {
    expect(() => parseMove('e0')).toThrowError(NotationError);
  });
  it('throws for two-digit rank e10', () => {
    expect(() => parseMove('e10')).toThrowError(NotationError);
  });
  it('throws for invalid wall orientation e3x', () => {
    expect(() => parseMove('e3x')).toThrowError(NotationError);
  });
  it('throws for purely numeric input', () => {
    expect(() => parseMove('45')).toThrowError(NotationError);
  });
  it('throws for extra characters', () => {
    expect(() => parseMove('e5hh')).toThrowError(NotationError);
  });
});

// ── serializeMove ─────────────────────────────────────────────────────────────

describe('serializeMove', () => {
  it('serializes pawn move at (4,4) to e5', () => {
    const m: Move = { kind: 'pawn', to: { row: 4, col: 4 } };
    expect(serializeMove(m)).toBe('e5');
  });
  it('serializes pawn at (8,4) to e1', () => {
    const m: Move = { kind: 'pawn', to: { row: 8, col: 4 } };
    expect(serializeMove(m)).toBe('e1');
  });
  it('serializes horizontal wall to e3h', () => {
    const m: Move = { kind: 'wall', wall: { row: 6, col: 4, orientation: 'h' } };
    expect(serializeMove(m)).toBe('e3h');
  });
  it('serializes vertical wall to e3v', () => {
    const m: Move = { kind: 'wall', wall: { row: 6, col: 4, orientation: 'v' } };
    expect(serializeMove(m)).toBe('e3v');
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe('parseMove / serializeMove round-trip', () => {
  const notations = ['e1', 'e9', 'a1', 'i9', 'a9', 'i1', 'd4', 'e3h', 'e3v', 'a2h', 'i9v', 'b5h'];
  for (const notation of notations) {
    it(`round-trips ${notation}`, () => {
      expect(serializeMove(parseMove(notation))).toBe(notation);
    });
  }
});
