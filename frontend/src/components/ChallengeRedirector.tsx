import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api';

interface ChallengeEntry {
  id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_name: string | null;
  challenged_name: string | null;
  time_control: number;
  status: string;
  game_id: string | null;
}

const POLL_INTERVAL_MS = 5000;

// Top-level effect: while logged in (and not already in a game), poll for
// outgoing challenges that flipped to 'accepted' and redirect the challenger
// to the game. Lives outside the FriendsPage so the redirect works no matter
// where the challenger happens to be in the app.
export function ChallengeRedirector() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navigatedRef = useRef<Set<string>>(new Set());
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  });

  useEffect(() => {
    const myId = profile?.id;
    if (!myId) return;

    const check = async () => {
      // Skip while in a game so we don't yank the user out of an active match.
      if (locationRef.current.pathname.startsWith('/game/online/')) return;
      try {
        const challenges = await apiFetch<ChallengeEntry[]>('/api/challenges/');
        const accepted = challenges.find(
          (c) =>
            c.status === 'accepted' &&
            c.challenger_id === myId &&
            c.game_id &&
            !navigatedRef.current.has(c.id),
        );
        if (!accepted || !accepted.game_id) return;
        navigatedRef.current.add(accepted.id);
        void apiFetch(`/api/challenges/${accepted.id}`, { method: 'DELETE' }).catch(() => {});
        const opponent = encodeURIComponent(accepted.challenged_name ?? 'Opponent');
        navigate(
          `/game/online/${accepted.game_id}?role=0&opponent=${opponent}&opponentElo=500&tc=${accepted.time_control}`,
        );
      } catch {
        // ignore poll failures
      }
    };

    void check();
    const interval = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [profile?.id, navigate]);

  return null;
}
