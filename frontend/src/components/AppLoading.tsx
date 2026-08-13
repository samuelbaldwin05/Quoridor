/**
 * Shown while auth state is still resolving.
 *
 * Exists because the alternative was `return null`, which renders a blank page. Auth
 * resolution waits on a network call, so "briefly" is not guaranteed: a cold backend can make
 * this the only thing on screen for a while, and a blank screen is indistinguishable from a
 * broken app. See DECISIONS.
 */
export function AppLoading({ note }: { note?: string }) {
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <div className="matchmaking-spinner" />
      <p className="app-loading-text">{note ?? 'Loading…'}</p>
    </div>
  );
}
