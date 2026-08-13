import { describe, expect, it } from 'vitest';
import { selectableDifficulty } from '@/lib/botTiers';

/**
 * The tier list changed twice over: 'bot0' was retired from selection, and the search-engine
 * tier became members-only. Both leave saved settings that no longer describe something the
 * player can pick, and the Play button must not dead-end on either.
 */
describe('selectableDifficulty', () => {
  it('keeps a tier the player can actually pick', () => {
    expect(selectableDifficulty('bot1', false)).toBe('bot1');
    expect(selectableDifficulty('bot1', true)).toBe('bot1');
    expect(selectableDifficulty('extreme', true)).toBe('extreme');
  });

  it('moves a returning bot0 player onto a live tier', () => {
    expect(selectableDifficulty('bot0', false)).toBe('bot2');
    expect(selectableDifficulty('bot0', true)).toBe('bot2');
  });

  it('lets a signed-in player keep the members-only tier', () => {
    expect(selectableDifficulty('mcts', false)).toBe('mcts');
  });

  it('moves a guest off the members-only tier', () => {
    expect(selectableDifficulty('mcts', true)).toBe('bot2');
  });
});
