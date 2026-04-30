import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavSidebar } from '@/components/NavSidebar';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface TimeStats {
  time_control: number;
  games_played: number;
  wins: number;
  losses: number;
  elo: number;
  win_pct: number;
}

interface ProfileData {
  id: string;
  display_name: string;
  username: string | null;
  elo: number;
  games_played: number;
  created_at: string;
  time_stats: TimeStats[];
}

function eloColor(elo: number): string {
  if (elo >= 1800) return '#f39c12';
  if (elo >= 1500) return '#3498db';
  if (elo >= 1300) return '#2ecc71';
  return 'rgba(255,255,255,0.6)';
}

function tcLabel(tc: number): string {
  if (tc < 60) return `${tc}s`;
  return `${tc / 60}m`;
}

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { profile: myProfile } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    apiFetch<ProfileData>(`/api/users/${userId}`)
      .then(setProfile)
      .catch(() => setError('Player not found.'))
      .finally(() => setLoading(false));
  }, [userId]);

  const displayName = profile?.username ?? profile?.display_name ?? '…';
  const isMe = myProfile?.id === userId;
  const winPct = profile && profile.games_played > 0
    ? Math.round((profile.time_stats.reduce((s, t) => s + t.wins, 0) / profile.games_played) * 100)
    : 0;

  return (
    <div className="game-layout">
      <NavSidebar activePage="play" />
      <div className="main-content">
        <div className="profile-page-card">
          {loading && <p className="profile-loading">Loading…</p>}
          {error && <p className="profile-loading">{error}</p>}
          {profile && (
            <>
              <div className="profile-header">
                <div className="profile-avatar-lg">{displayName[0]?.toUpperCase()}</div>
                <div className="profile-header-info">
                  <h2 className="profile-username">{displayName}</h2>
                  {profile.username && (
                    <p className="profile-google-name">{profile.display_name}</p>
                  )}
                  <p className="profile-elo" style={{ color: eloColor(profile.elo) }}>
                    {profile.elo} ELO
                  </p>
                </div>
                {!isMe && (
                  <button className="btn profile-add-btn" onClick={() => navigate('/friends')}>
                    + Add Friend
                  </button>
                )}
              </div>

              <div className="profile-stats-grid">
                <div className="profile-stat-card">
                  <span className="profile-stat-value">{profile.games_played}</span>
                  <span className="profile-stat-label">Games Played</span>
                </div>
                <div className="profile-stat-card">
                  <span className="profile-stat-value">{winPct}%</span>
                  <span className="profile-stat-label">Win Rate</span>
                </div>
                <div className="profile-stat-card">
                  <span className="profile-stat-value" style={{ color: eloColor(profile.elo) }}>{profile.elo}</span>
                  <span className="profile-stat-label">ELO</span>
                </div>
                <div className="profile-stat-card">
                  <span className="profile-stat-value">
                    {new Date(profile.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                  </span>
                  <span className="profile-stat-label">Member Since</span>
                </div>
              </div>

              {profile.time_stats.length > 0 && (
                <div className="profile-section">
                  <p className="profile-section-label">BY TIME CONTROL</p>
                  <div className="profile-tc-list">
                    {profile.time_stats.map((t) => (
                      <div key={t.time_control} className="profile-tc-row">
                        <span className="profile-tc-label">{tcLabel(t.time_control)}</span>
                        <span className="profile-tc-stat">{t.games_played} games</span>
                        <span className="profile-tc-stat">{Math.round(t.win_pct * 100)}% wins</span>
                        <span className="profile-tc-elo" style={{ color: eloColor(t.elo) }}>{t.elo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
