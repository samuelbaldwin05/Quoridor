import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { STARTING_ELO } from '@/lib/elo';

interface MatchmakingModalProps {
  timeControl: number; // 180 | 300 | 600
  displayName: string;
  elo: number;
  onMatchFound: (
    gameId: string,
    opponentName: string,
    opponentElo: number,
    playerRole: 0 | 1,
  ) => void;
  onCancel: () => void;
  /** Offered when a search ends with nobody around. Omitted, the button is not shown. */
  onPlayBot?: () => void;
}

interface QueueStatus {
  status: 'waiting' | 'matched' | 'not_in_queue' | 'expired';
  matched_game_id?: string;
  opponent_name?: string;
  opponent_elo?: number;
  player_role?: 0 | 1;
  /** Search time left before the cap. The cap itself is the backend's to define. */
  expires_in_seconds?: number;
}

type Phase = 'joining' | 'searching' | 'found' | 'error' | 'expired' | 'paused';

const TC_LABELS: Record<number, string> = { 180: '3 min', 300: '5 min', 600: '10 min' };
const MIN_LOADING_MS = 2000;
const POLL_MS = 2500;

// How long the tab may sit in the background before the search stops. A glance at another
// tab keeps your place; walking away does not. Also grounded in what the browser does:
// timers in a hidden tab are throttled hard, so a backgrounded client barely polls and the
// server would soon sweep it as idle anyway.
const HIDDEN_GRACE_MS = 60 * 1000;

export function MatchmakingModal({
  timeControl,
  displayName,
  elo,
  onMatchFound,
  onCancel,
  onPlayBot,
}: MatchmakingModalProps) {
  const [phase, setPhase] = useState<Phase>('joining');
  const [errorMsg, setErrorMsg] = useState('');
  const [dots, setDots] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [matchInfo, setMatchInfo] = useState<{
    opponentName: string;
    opponentElo: number;
    gameId: string;
    playerRole: 0 | 1;
  } | null>(null);
  // Seconds of search left, as last reported by the backend. It owns the cap; this is
  // only how the give-up message appears the moment the time lapses instead of on the
  // next poll. Null means the server has not said, so there is no local deadline and the
  // poll's "expired" is what ends the search.
  const [expiresInSeconds, setExpiresInSeconds] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedRef = useRef(false);
  const mountedAt = useRef(Date.now());

  const tcLabel = TC_LABELS[timeControl] ?? `${timeControl}s`;

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  // Leaving is always best-effort: the backend expires idle rows on its own, so a failed
  // or cut-short request costs latency, not correctness. `keepalive` is for the unload
  // path, where the request has to outlive the page.
  const leaveQueue = useCallback(async (keepalive = false) => {
    try {
      await apiFetch('/matchmaking/leave', { method: 'DELETE', keepalive });
    } catch {
      // ignore
    }
  }, []);

  const endSearch = useCallback(
    (next: 'expired' | 'paused') => {
      stopPolling();
      void leaveQueue();
      setPhase(next);
    },
    [stopPolling, leaveQueue],
  );

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await apiFetch<QueueStatus>('/matchmaking/status');
        if (data.status === 'matched' && data.matched_game_id) {
          stopPolling();
          setMatchInfo({
            opponentName: data.opponent_name ?? 'Opponent',
            opponentElo: data.opponent_elo ?? STARTING_ELO,
            gameId: data.matched_game_id,
            playerRole: data.player_role ?? 0,
          });
          setPhase('found');
        } else if (data.status === 'waiting') {
          // Re-anchor on every poll, so the local deadline tracks the server's rather
          // than drifting from it.
          if (data.expires_in_seconds !== undefined) setExpiresInSeconds(data.expires_in_seconds);
        } else if (data.status === 'expired' || data.status === 'not_in_queue') {
          // The server hit the cap first, or the row went out from under us.
          stopPolling();
          setPhase('expired');
        }
      } catch {
        // silently ignore poll failures
      }
    }, POLL_MS);
  }, [stopPolling]);

  const joinQueue = useCallback(async () => {
    setPhase('joining');
    setExpiresInSeconds(null);
    try {
      const data = await apiFetch<QueueStatus>('/matchmaking/join', {
        method: 'POST',
        body: JSON.stringify({ time_control: timeControl }),
      });
      if (data.status === 'matched' && data.matched_game_id) {
        setMatchInfo({
          opponentName: data.opponent_name ?? 'Opponent',
          opponentElo: data.opponent_elo ?? STARTING_ELO,
          gameId: data.matched_game_id,
          playerRole: data.player_role ?? 0,
        });
        setPhase('found');
      } else {
        setExpiresInSeconds(data.expires_in_seconds ?? null);
        setPhase('searching');
        startPolling();
      }
    } catch (e) {
      // Hold the loading state for at least MIN_LOADING_MS so a fast-failing
      // first request doesn't flash the error UI before settling.
      const elapsed = Date.now() - mountedAt.current;
      const wait = Math.max(0, MIN_LOADING_MS - elapsed);
      setTimeout(() => {
        setErrorMsg(e instanceof Error ? e.message : 'Could not connect to matchmaking server.');
        setPhase('error');
      }, wait);
    }
  }, [timeControl, startPolling]);

  useEffect(() => {
    if (phase !== 'searching') return;
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Tick the countdown down once per second when match is found.
  useEffect(() => {
    if (phase !== 'found') return;
    setCountdown(3);
    const t = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Fire onMatchFound once countdown reaches 0 — separated from the state
  // updater above so React strict-mode's purity check can't double-trigger
  // a parent setState during render.
  useEffect(() => {
    if (phase === 'found' && countdown === 0 && matchInfo) {
      onMatchFound(
        matchInfo.gameId,
        matchInfo.opponentName,
        matchInfo.opponentElo,
        matchInfo.playerRole,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown, matchInfo]);

  useEffect(() => {
    // React 19 dev strict-mode double-invokes effects. Skip the second fire so
    // we don't race two POST /matchmaking/join calls into a unique-key 500.
    if (joinedRef.current) return;
    joinedRef.current = true;
    void joinQueue();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The search cap, on the backend's clock.
  useEffect(() => {
    if (phase !== 'searching' || expiresInSeconds === null) return;
    const t = setTimeout(() => endSearch('expired'), Math.max(0, expiresInSeconds * 1000));
    return () => clearTimeout(t);
  }, [phase, expiresInSeconds, endSearch]);

  // Stop searching for a player who has left the tab behind. The grace timer is armed on
  // hide and disarmed on return, so only a sustained absence ends the search.
  useEffect(() => {
    if (phase !== 'searching') return;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const disarm = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        disarm();
        graceTimer = setTimeout(() => endSearch('paused'), HIDDEN_GRACE_MS);
      } else {
        disarm();
      }
    };
    if (document.hidden) onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disarm();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [phase, endSearch]);

  // Closing the tab or navigating away: tell the server on the way out. It expires the row
  // by itself within QUEUE_IDLE_TIMEOUT_SECONDS, so this only shortens the ghost's life.
  useEffect(() => {
    if (phase !== 'joining' && phase !== 'searching') return;
    const onPageHide = () => void leaveQueue(true);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [phase, leaveQueue]);

  async function handleCancel() {
    stopPolling();
    await leaveQueue();
    onCancel();
  }

  return (
    <div className="modal matchmaking-overlay">
      <div className="matchmaking-card">
        <div className="matchmaking-tc-badge">{tcLabel}</div>

        {(phase === 'joining' || phase === 'searching') && (
          <>
            <div className="matchmaking-spinner" />
            <h2 className="matchmaking-title">
              {phase === 'joining' ? 'Joining queue…' : `Searching${dots}`}
            </h2>
            <p className="matchmaking-sub">
              Looking for a {tcLabel} opponent near <strong>{elo} ELO</strong>
            </p>
            <button className="btn matchmaking-cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </>
        )}

        {phase === 'found' && matchInfo && (
          <>
            <div className="matchmaking-found-icon">⚔️</div>
            <h2 className="matchmaking-title">Match Found!</h2>
            <div className="matchmaking-vs-row">
              <div className="matchmaking-player">
                <span className="matchmaking-player-name">{displayName}</span>
                <span className="matchmaking-player-elo">{elo}</span>
              </div>
              <span className="matchmaking-vs-sep">VS</span>
              <div className="matchmaking-player matchmaking-opponent">
                <span className="matchmaking-player-name">{matchInfo.opponentName}</span>
                <span className="matchmaking-player-elo">{matchInfo.opponentElo}</span>
              </div>
            </div>
            <p className="matchmaking-sub">
              Starting in <strong>{countdown}</strong>…
            </p>
          </>
        )}

        {phase === 'expired' && (
          <>
            <div className="matchmaking-idle-icon">🕑</div>
            <h2 className="matchmaking-title">Nobody around right now</h2>
            <p className="matchmaking-sub">
              The {tcLabel} pool is quiet at the moment. Check back a little later, or play a bot.
            </p>
            <div className="matchmaking-actions">
              <button
                className="btn btn-primary matchmaking-accept-btn"
                onClick={() => void joinQueue()}
              >
                Search again
              </button>
              {onPlayBot && (
                <button className="btn matchmaking-cancel-btn" onClick={onPlayBot}>
                  Play a bot
                </button>
              )}
              <button className="btn matchmaking-cancel-btn" onClick={onCancel}>
                Close
              </button>
            </div>
          </>
        )}

        {phase === 'paused' && (
          <>
            <div className="matchmaking-idle-icon">⏸</div>
            <h2 className="matchmaking-title">Search paused</h2>
            <p className="matchmaking-sub">You stepped away, so we stopped looking.</p>
            <div className="matchmaking-actions">
              <button
                className="btn btn-primary matchmaking-accept-btn"
                onClick={() => void joinQueue()}
              >
                Search again
              </button>
              <button className="btn matchmaking-cancel-btn" onClick={onCancel}>
                Close
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="matchmaking-error-icon">⚠</div>
            <h2 className="matchmaking-title">Connection Error</h2>
            <p className="matchmaking-sub">{errorMsg}</p>
            <button className="btn matchmaking-cancel-btn" onClick={onCancel}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
