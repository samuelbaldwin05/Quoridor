import { describe, expect, it } from 'vitest';
import { eloColor } from '../elo';

describe('eloColor', () => {
  it('maps each tier to its color', () => {
    expect(eloColor(2000)).toBe('#f39c12'); // >= 1800
    expect(eloColor(1800)).toBe('#f39c12'); // boundary
    expect(eloColor(1600)).toBe('#3498db'); // >= 1500
    expect(eloColor(1500)).toBe('#3498db'); // boundary
    expect(eloColor(1400)).toBe('#2ecc71'); // >= 1300
    expect(eloColor(1300)).toBe('#2ecc71'); // boundary
    expect(eloColor(1299)).toBe('rgba(255,255,255,0.6)'); // default tier
    expect(eloColor(500)).toBe('rgba(255,255,255,0.6)');
  });
});
