import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface MatchmakingModalProps {
  timeControl: number;   // 180 | 300 | 600
  displayName: string;
  elo: number;
  onMatchFound: (gameId: string, opponentName: string, opponentElo: number, playerRole: 0 | 1) => void;
  onCancel: () => void;
}

interface QueueStatus {
  status: 'waiting' | 'matched' | 'not_in_queue';
  matched_game_id?: string;
  opponent_name?: string;
  opponent_elo?: number;
  player_role?: 0 | 1;
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
  const [countdown, setCountdown] = useState(3);
  const [matchInfo, setMatchInfo] = useState<{
    opponentName: string;
    opponentElo: number;
    gameId: string;
    playerRole: 0 | 1;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== 'searching') return;
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Auto-redirect countdown when match is found
  useEffect(() => {
    if (phase !== 'found' || !matchInfo) return;
    setCountdown(3);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          onMatchFound(matchInfo.gameId, matchInfo.opponentName, matchInfo.opponentElo, matchInfo.playerRole);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    async function joinQueue() {
      try {
        const data = await apiFetch<QueueStatus>('/matchmaking/join', {
          method: 'POST',
          body: JSON.stringify({ time_control: timeControl }),
        });
        if (data.status === 'matched' && data.matched_game_id) {
          setMatchInfo({
            opponentName: data.opponent_name ?? 'Opponent',
            opponentElo: data.opponent_elo ?? 500,
            gameId: data.matched_game_id,
            playerRole: data.player_role ?? 0,
          });
          setPhase('found');
        } else {
          setPhase('searching');
          startPolling();
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Could not connect to matchmaking server.');
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
        const data = await apiFetch<QueueStatus>('/matchmaking/status');
        if (data.status === 'matched' && data.matched_game_id) {
          if (pollRef.current) clearInterval(pollRef.current);
          setMatchInfo({
            opponentName: data.opponent_name ?? 'Opponent',
            opponentElo: data.opponent_elo ?? 500,
            gameId: data.matched_game_id,
            playerRole: data.player_role ?? 0,
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
      await apiFetch('/matchmaking/leave', { method: 'DELETE' });
    } catch {
      // ignore
    }
    onCancel();
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
            <p className="matchmaking-sub">
              Starting in <strong>{countdown}</strong>…
            </p>
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
