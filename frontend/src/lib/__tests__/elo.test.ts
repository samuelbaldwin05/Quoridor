import { describe, expect, it } from 'vitest';
import { eloColor } from '../elo';

describe('eloColor', () => {
  it('maps each tier to its color', () => {
    expect(eloColor(4000)).toBe('#f39c12'); // >= 3600
    expect(eloColor(3600)).toBe('#f39c12'); // boundary
    expect(eloColor(3200)).toBe('#3498db'); // >= 3000
    expect(eloColor(3000)).toBe('#3498db'); // boundary
    expect(eloColor(2800)).toBe('#2ecc71'); // >= 2600
    expect(eloColor(2600)).toBe('#2ecc71'); // boundary
    expect(eloColor(2599)).toBe('rgba(255,255,255,0.6)'); // default tier
    expect(eloColor(1000)).toBe('rgba(255,255,255,0.6)'); // the starting rating
  });
});
