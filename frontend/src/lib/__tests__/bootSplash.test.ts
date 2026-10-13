// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissBootSplash,
  holdBootSplash,
  releaseBootSplash,
  resetBootSplashForTests,
} from '@/lib/bootSplash';

function mountSplash() {
  document.body.innerHTML = '<div id="boot-splash"></div><div id="root"></div>';
}

const splash = () => document.getElementById('boot-splash');

beforeEach(() => {
  resetBootSplashForTests();
  mountSplash();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('bootSplash', () => {
  it('fades before it leaves, so the app is uncovered rather than cut to', () => {
    dismissBootSplash();
    expect(splash()!.dataset.done).toBe('true');
    expect(splash()).not.toBeNull();

    vi.advanceTimersByTime(500);
    expect(splash()).toBeNull();
  });

  it('stays up while held, and goes once released', () => {
    // The OAuth callback holds it: that page lands with no session in storage yet, so auth
    // resolves to "guest" for an instant and would otherwise pull the board away mid
    // sign-in and flash a bare page.
    holdBootSplash();
    dismissBootSplash();
    expect(splash()!.dataset.done).toBeUndefined();

    releaseBootSplash();
    dismissBootSplash();
    expect(splash()!.dataset.done).toBe('true');
  });

  it('cannot be held again once it is gone', () => {
    // Auth can settle while a recovery retry is still in flight. Putting the board back on
    // screen after the app is visible would be a resurrection.
    dismissBootSplash();
    vi.advanceTimersByTime(500);
    holdBootSplash();
    expect(splash()).toBeNull();
  });

  it('can be dismissed twice without throwing', () => {
    dismissBootSplash();
    vi.advanceTimersByTime(500);
    expect(() => dismissBootSplash()).not.toThrow();
  });

  it('does nothing when there is no splash, as in a test or an embedded render', () => {
    document.body.innerHTML = '';
    expect(() => {
      holdBootSplash();
      releaseBootSplash();
      dismissBootSplash();
    }).not.toThrow();
  });
});
