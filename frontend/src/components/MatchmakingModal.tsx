import { useEffect, useRef, useState } from 'react';

// In Docker dev, Vite proxies /api → http://backend:8000; outside Docker use env var
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

interface MatchmakingModalProps {
  timeControl: number;   // 180 | 300 | 600
  displayName: string;
  elo: number;
  onMatchFound: (gameId: string, opponentName: string, opponentElo: number) => void;
  onCancel: () => void;
}

interface QueueStatus {
  status: 'waiting' | 'matched' | 'not_in_queue';
  matched_game_id?: string;
  opponent_name?: string;
  opponent_elo?: number;
}

const TC_LABELS: Record<number, string> = { 180: '3 min', 300: '5 min', 600: '10 min' };

export function MatchmakingModal({
  timeControl,
  displayName,
  elo,
  onMatchFound,
  onCancel,
}: MatchmakingModalProps) {
  const [phase, setPhase] = useState<'joining' | 'searching' | 'found' | 'error'>('joining');
  const [errorMsg, setErrorMsg] = useState('');
  const [dots, setDots] = useState('');
  const [matchInfo, setMatchInfo] = useState<{ opponentName: string; opponentElo: number; gameId: string } | null>(null);
  const userIdRef = useRef<string>(`guest-${Math.random().toString(36).slice(2, 9)}`);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate dots
  useEffect(() => {
    if (phase !== 'searching') return;
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Join queue on mount
  useEffect(() => {
    async function joinQueue() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/matchmaking/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userIdRef.current,
            display_name: displayName,
            time_control: timeControl,
            elo,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: QueueStatus = await res.json();
        if (data.status === 'matched' && data.matched_game_id) {
          setMatchInfo({
            opponentName: data.opponent_name ?? 'Opponent',
            opponentElo: data.opponent_elo ?? 1200,
            gameId: data.matched_game_id,
          });
          setPhase('found');
        } else {
          setPhase('searching');
          startPolling();
        }
      } catch {
        setErrorMsg('Could not connect to matchmaking server.');
        setPhase('error');
      }
    }

    joinQueue();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/matchmaking/status/${userIdRef.current}`,
        );
        if (!res.ok) return;
        const data: QueueStatus = await res.json();
        if (data.status === 'matched' && data.matched_game_id) {
          if (pollRef.current) clearInterval(pollRef.current);
          setMatchInfo({
            opponentName: data.opponent_name ?? 'Opponent',
            opponentElo: data.opponent_elo ?? 1200,
            gameId: data.matched_game_id,
          });
          setPhase('found');
        }
      } catch {
        // silently ignore poll failures
      }
    }, 2500);
  }

  async function handleCancel() {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await fetch(`${BACKEND_URL}/api/matchmaking/leave/${userIdRef.current}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
    onCancel();
  }

  function handleAccept() {
    if (matchInfo) {
      onMatchFound(matchInfo.gameId, matchInfo.opponentName, matchInfo.opponentElo);
    }
  }

  return (
    <div className="modal matchmaking-overlay">
      <div className="matchmaking-card">
        <div className="matchmaking-tc-badge">
          {TC_LABELS[timeControl] ?? `${timeControl}s`}
        </div>

        {(phase === 'joining' || phase === 'searching') && (
          <>
            <div className="matchmaking-spinner" />
            <h2 className="matchmaking-title">
              {phase === 'joining' ? 'Joining queue…' : `Searching${dots}`}
            </h2>
            <p className="matchmaking-sub">
              Looking for a {TC_LABELS[timeControl]} opponent near{' '}
              <strong>{elo} ELO</strong>
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
            <div className="matchmaking-actions">
              <button className="btn btn-primary matchmaking-accept-btn" onClick={handleAccept}>
                Play
              </button>
              <button className="btn matchmaking-cancel-btn" onClick={handleCancel}>
                Decline
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
