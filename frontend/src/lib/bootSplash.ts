/**
 * The loading board in index.html, from the app's side.
 *
 * It is markup the browser paints before the bundle has even downloaded, which is the whole
 * point of it, so React cannot own it: mounting a copy inside #root would tear the original
 * down and restart the animation mid-stride, which is the flash this arrangement avoids. The
 * app only gets to hold it up and, once auth resolves, take it away.
 *
 * It carries no caption. The board animating is the whole message, and a line of text on top
 * of it read as a second, competing loading screen.
 */

const SPLASH_ID = 'boot-splash';

// Matches the CSS transition in index.html. Removing the node early would cut the fade short.
const FADE_MS = 250;

let dismissed = false;
let held = false;

/**
 * Keep the splash up through a step that has nothing of its own worth showing, the OAuth
 * callback being the one: it lands with no session in storage yet, so auth resolves to
 * "guest" for an instant and would otherwise pull the board away and flash a bare page.
 */
export function holdBootSplash(): void {
  if (!dismissed) held = true;
}

export function releaseBootSplash(): void {
  held = false;
}

/** Fade the splash out and drop it. Safe to call more than once. */
export function dismissBootSplash(): void {
  if (held || dismissed) return;
  dismissed = true;
  const el = document.getElementById(SPLASH_ID);
  if (!el) return;
  el.dataset.done = 'true';
  setTimeout(() => el.remove(), FADE_MS);
}

/** Test seam: there is one splash per document, so the module keeps one flag. */
export function resetBootSplashForTests(): void {
  dismissed = false;
  held = false;
}
