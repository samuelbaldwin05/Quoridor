import { useEffect, useState } from 'react';
import { NavSidebar } from '@/components/NavSidebar';
import { ProfileModal } from '@/components/ProfileModal';
import { supabase } from '@/lib/supabase';
import { eloColor } from '@/lib/elo';

type SortMode = 'elo' | 'games_played';

interface LeaderEntry {
  id: string;
  username: string;
  elo: number;
  games_played: number;
}

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'elo', label: 'By ELO' },
  { id: 'games_played', label: 'By Games Played' },
];

export function LeaderboardPage() {
  const [sort, setSort] = useState<SortMode>('elo');
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, username, elo, games_played')
          .eq('username_chosen', true)
          .gt('games_played', 0)
          .order(sort, { ascending: false })
          .limit(20);
        if (cancelled) return;
        setEntries((data as LeaderEntry[]) ?? []);
      } catch {
        // swallow; finally still flips loading off
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sort]);

  return (
    <div className="game-layout">
      <NavSidebar activePage="leaderboard" />

      <div className="main-content">
        <div className="leaderboard-page-card">
          <div className="leaderboard-page-header">
            <span className="leaderboard-page-title">Leaderboard</span>
            <div className="leaderboard-sort-tabs">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`leaderboard-sort-tab${sort === opt.id ? ' leaderboard-sort-tab-active' : ''}`}
                  onClick={() => setSort(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="leaderboard-page-list">
            {loading && entries.length === 0 && <p className="leaderboard-page-empty">Loading…</p>}

            {!loading && entries.length === 0 && (
              <p className="leaderboard-page-empty">No data yet.</p>
            )}

            {entries.map((entry, i) => (
              <button
                key={entry.id}
                className="leaderboard-page-row"
                onClick={() => setProfileUserId(entry.id)}
              >
                <span className="leaderboard-page-rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <span className="leaderboard-page-name">{entry.username}</span>
                <span className="leaderboard-page-games">{entry.games_played} games</span>
                <span className="leaderboard-page-elo" style={{ color: eloColor(entry.elo) }}>
                  {entry.elo} ELO
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  );
}
