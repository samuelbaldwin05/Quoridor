/**
 * Ties the tokens that come back in the callback fragment to the tab that asked for them.
 *
 * Without it, anyone could send a victim to /auth/callback#id_token=<their own token> and
 * quietly sign that browser into someone else's account. The backend's state cookie can't
 * catch that, since the attack skips the backend entirely. So the tab writes a random value
 * before it leaves, the backend echoes it back untouched, and the callback refuses anything
 * that doesn't match.
 */

const HANDOFF_KEY = 'quoridor-oauth-handoff';
const PROBE_KEY = 'quoridor-storage-probe';

function storageWorks(): boolean {
  try {
    sessionStorage.setItem(PROBE_KEY, '1');
    sessionStorage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function randomValue(): string {
  // randomUUID needs a secure context, which a phone hitting the dev server over the LAN
  // is not, and that is exactly where this gets tested.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

/** Random value for this sign-in attempt, to be handed to the backend. */
export function beginHandoff(): string {
  const value = randomValue();
  try {
    sessionStorage.setItem(HANDOFF_KEY, value);
    return value;
  } catch {
    // Private mode with storage walled off. The check below stands down rather than
    // locking the browser out of signing in.
    return '';
  }
}

/** Whether this callback belongs to a sign-in this tab started. Consumes the value. */
export function claimHandoff(received: string | null): boolean {
  if (!storageWorks()) return true;
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    return true;
  }
  return stored !== null && stored !== '' && stored === received;
}
