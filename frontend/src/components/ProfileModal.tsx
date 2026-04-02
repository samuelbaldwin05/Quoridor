import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface TimeStats {
  time_control: number;
  games_played: number;
  wins: number;
  losses: number;
  elo: number;
}

interface UserProfile {
  id: string;
  display_name: string;
  elo: number;
  games_played: number;
  time_stats: TimeStats[];
}

interface ProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

const TC_LABELS: Record<number, string> = {
  180: '3 min',
  300: '5 min',
  600: '10 min',
};

function winPct(wins: number, played: number): string {
  if (played === 0) return '—';
  return `${Math.round((wins / played) * 100)}%`;
}

function eloColor(elo: number): string {
  if (elo >= 1800) return '#f39c12';
  if (elo >= 1500) return '#3498db';
  if (elo >= 1300) return '#2ecc71';
  return 'rgba(255,255,255,0.5)';
}

export function ProfileModal({ userId, onClose }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setProfile(null);

    async function load() {
      try {
        const [userRes, statsRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, display_name, elo, games_played')
            .eq('id', userId)
            .single(),
          supabase
            .from('user_time_stats')
            .select('time_control, games_played, wins, losses, elo')
            .eq('user_id', userId)
            .order('time_control'),
        ]);

        if (userRes.error) throw userRes.error;
        if (!userRes.data) throw new Error('User not found');

        setProfile({
          id: userRes.data.id,
          display_name: userRes.data.display_name,
          elo: userRes.data.elo,
          games_played: userRes.data.games_played,
          time_stats: (statsRes.data ?? []) as TimeStats[],
        });
      } catch {
        setError('Could not load profile.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="modal profile-modal-overlay" onClick={onClose}>
      <div
        className="profile-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="profile-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {loading && <p className="profile-modal-loading">Loading…</p>}
        {error && <p className="profile-modal-error">{error}</p>}

        {profile && (
          <>
            {/* Header */}
            <div className="profile-modal-header">
              <div className="profile-modal-avatar">
                {profile.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="profile-modal-info">
                <h2 className="profile-modal-name">{profile.display_name}</h2>
                <span className="profile-modal-elo" style={{ color: eloColor(profile.elo) }}>
                  {profile.elo} ELO
                </span>
              </div>
            </div>

            {/* Overall stat */}
            <div className="profile-overall-row">
              <div className="profile-stat-box">
                <span className="profile-stat-val">{profile.games_played}</span>
                <span className="profile-stat-lbl">Games</span>
              </div>
              <div className="profile-stat-box">
                <span className="profile-stat-val">
                  {profile.time_stats.reduce((s, t) => s + t.wins, 0)}
                </span>
                <span className="profile-stat-lbl">Wins</span>
              </div>
              <div className="profile-stat-box">
                <span className="profile-stat-val">
                  {winPct(
                    profile.time_stats.reduce((s, t) => s + t.wins, 0),
                    profile.games_played,
                  )}
                </span>
                <span className="profile-stat-lbl">Win %</span>
              </div>
            </div>

            {/* Per-time-control stats */}
            {profile.time_stats.length > 0 && (
              <div className="profile-tc-section">
                <p className="profile-tc-heading">BY TIME CONTROL</p>
                <div className="profile-tc-table">
                  <div className="profile-tc-head">
                    <span>Format</span>
                    <span>ELO</span>
                    <span>W / L</span>
                    <span>Win %</span>
                  </div>
                  {profile.time_stats.map((ts) => (
                    <div key={ts.time_control} className="profile-tc-row">
                      <span className="profile-tc-format">
                        {TC_LABELS[ts.time_control] ?? `${ts.time_control}s`}
                      </span>
                      <span
                        className="profile-tc-elo"
                        style={{ color: eloColor(ts.elo) }}
                      >
                        {ts.elo}
                      </span>
                      <span className="profile-tc-wl">
                        {ts.wins} / {ts.losses}
                      </span>
                      <span className="profile-tc-pct">
                        {winPct(ts.wins, ts.games_played)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.time_stats.length === 0 && (
              <p className="profile-no-stats">No rated games yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
