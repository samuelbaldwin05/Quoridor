/**
 * The loading board in index.html, from the app's side.
 *
 * It is markup the browser paints before the bundle has even downloaded, which is the whole
 * point of it, so React cannot own it: mounting a copy inside #root would tear the original
 * down and restart the animation mid-stride, which is the flash this arrangement avoids. The
 * app only gets to write the caption and, once auth resolves, take the thing away.
 */

const SPLASH_ID = 'boot-splash';
const NOTE_ID = 'boot-splash-note';

// Matches the CSS transition in index.html. Removing the node early would cut the fade short.
const FADE_MS = 250;

let dismissed = false;

/** What the splash says under the board. Empty until the app knows enough to say anything. */
export function setBootSplashNote(note: string): void {
  if (dismissed) return;
  const el = document.getElementById(NOTE_ID);
  if (el && el.textContent !== note) el.textContent = note;
}

/** Fade the splash out and drop it. Safe to call more than once. */
export function dismissBootSplash(): void {
  if (dismissed) return;
  dismissed = true;
  const el = document.getElementById(SPLASH_ID);
  if (!el) return;
  el.dataset.done = 'true';
  setTimeout(() => el.remove(), FADE_MS);
}

/** Test seam: there is one splash per document, so the module keeps one flag. */
export function resetBootSplashForTests(): void {
  dismissed = false;
}
