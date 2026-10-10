// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissBootSplash, resetBootSplashForTests, setBootSplashNote } from '@/lib/bootSplash';

function mountSplash() {
  document.body.innerHTML =
    '<div id="boot-splash"><p id="boot-splash-note"></p></div><div id="root"></div>';
}

const splash = () => document.getElementById('boot-splash');
const note = () => document.getElementById('boot-splash-note');

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
  it('writes the caption the app asks for', () => {
    setBootSplashNote('Signing you in…');
    expect(note()!.textContent).toBe('Signing you in…');
  });

  it('fades before it leaves, so the app is uncovered rather than cut to', () => {
    dismissBootSplash();
    expect(splash()!.dataset.done).toBe('true');
    expect(splash()).not.toBeNull();

    vi.advanceTimersByTime(500);
    expect(splash()).toBeNull();
  });

  it('ignores a caption written after it has been dismissed', () => {
    // Auth can settle while a recovery retry is still in flight; the splash is gone by then
    // and putting words back on screen would be a resurrection.
    dismissBootSplash();
    setBootSplashNote('Reconnecting…');
    expect(note()!.textContent).toBe('');
  });

  it('can be dismissed twice without throwing', () => {
    dismissBootSplash();
    vi.advanceTimersByTime(500);
    expect(() => dismissBootSplash()).not.toThrow();
  });

  it('does nothing when there is no splash, as in a test or an embedded render', () => {
    document.body.innerHTML = '';
    expect(() => {
      setBootSplashNote('Signing you in…');
      dismissBootSplash();
    }).not.toThrow();
  });
});
