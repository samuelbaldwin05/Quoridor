// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { beginHandoff, claimHandoff } from '@/lib/oauthHandoff';

beforeEach(() => {
  sessionStorage.clear();
});

describe('oauth handoff', () => {
  it('accepts the value the same tab started with', () => {
    const value = beginHandoff();
    expect(value).not.toBe('');
    expect(claimHandoff(value)).toBe(true);
  });

  it('rejects a callback nobody in this tab asked for', () => {
    // The attack this exists for: a link straight to /auth/callback carrying the
    // attacker's own id_token, which would otherwise sign the victim into their account.
    expect(claimHandoff('some-value-we-never-issued')).toBe(false);
  });

  it('rejects a value that does not match', () => {
    beginHandoff();
    expect(claimHandoff('a-different-value')).toBe(false);
  });

  it('rejects a missing value', () => {
    beginHandoff();
    expect(claimHandoff(null)).toBe(false);
  });

  it('is single use, so a fragment cannot be replayed', () => {
    const value = beginHandoff();
    expect(claimHandoff(value)).toBe(true);
    expect(claimHandoff(value)).toBe(false);
  });

  it('issues a different value every time', () => {
    const first = beginHandoff();
    const second = beginHandoff();
    expect(first).not.toBe(second);
  });
});
