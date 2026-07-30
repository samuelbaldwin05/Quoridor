import { describe, expect, it } from 'vitest';
import { didUserWin } from '../gameStorage';

describe('didUserWin', () => {
  it('treats winner === userRole as a user win', () => {
    expect(didUserWin({ winner: 0, userRole: 0 })).toBe(true);
    expect(didUserWin({ winner: 1, userRole: 1 })).toBe(true);
  });

  it('treats winner !== userRole as a user loss', () => {
    expect(didUserWin({ winner: 1, userRole: 0 })).toBe(false);
    expect(didUserWin({ winner: 0, userRole: 1 })).toBe(false);
  });

  it('defaults missing userRole to 0 (backwards-compat with pre-userRole saves)', () => {
    expect(didUserWin({ winner: 0 })).toBe(true);
    expect(didUserWin({ winner: 1 })).toBe(false);
  });

  it('returns false for unfinished games (winner === null)', () => {
    expect(didUserWin({ winner: null, userRole: 0 })).toBe(false);
    expect(didUserWin({ winner: null, userRole: 1 })).toBe(false);
    expect(didUserWin({ winner: null })).toBe(false);
  });
});
