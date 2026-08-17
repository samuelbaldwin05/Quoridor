/**
 * Ask the browser not to throw this origin's storage away.
 *
 * What it buys: on Chromium, an installed web app is granted persistent storage, which
 * takes localStorage out of the pool the browser evicts under storage pressure. That
 * matters here because the Supabase session and the local game history both live there,
 * and losing them looks to a player like being silently signed out.
 *
 * What it does not buy: Safari's seven-day cap on script-writable storage is not an
 * eviction policy and is not affected by this. Safari does not implement `persist()` at
 * all, so on iOS this is a no-op and the cap stands. Beating it would need the session in
 * a server-set cookie, and the frontend is a static bundle with no server to set one. The
 * mitigation there is that a wipe now costs a re-tap of Sign in with Google rather than a
 * player's history, which the backend holds.
 *
 * Best-effort by design: never throws, never blocks startup, and the app works whatever
 * the answer is.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
