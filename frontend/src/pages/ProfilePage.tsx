import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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

interface ApiFriend {
  friendship_id: string;
  friend_id: string;
  status: string;
  requester_id?: string;
}

type FriendStatus = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'accepted';

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
  const { profile: myProfile } = useAuth();
  const myId = myProfile?.id ?? '';
  const isMe = myProfile?.id === userId;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiFetch<ProfileData>(`/api/users/${userId}`)
      .then(setProfile)
      .catch(() => setError('Player not found.'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId || isMe || !myId) return;
    apiFetch<ApiFriend[]>('/api/friends/')
      .then((friends) => {
        const f = friends.find((x) => x.friend_id === userId);
        if (!f) {
          setFriendStatus('none');
          setFriendshipId(null);
          return;
        }
        setFriendshipId(f.friendship_id);
        if (f.status === 'accepted') {
          setFriendStatus('accepted');
        } else {
          setFriendStatus(f.requester_id === myId ? 'pending_sent' : 'pending_received');
        }
      })
      .catch(() => {});
  }, [userId, isMe, myId]);

  async function handleAddFriend() {
    if (!userId) return;
    setActing(true);
    try {
      await apiFetch('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ receiver_id: userId }),
      });
      setFriendStatus('pending_sent');
    } catch {
      // 409 (already exists) or other — leave state alone; the duplicate-prevent
      // logic on the server is the authoritative guard.
    } finally {
      setActing(false);
    }
  }

  async function handleAcceptRequest() {
    if (!friendshipId) return;
    setActing(true);
    try {
      await apiFetch(`/api/friends/${friendshipId}/accept`, { method: 'PUT' });
      setFriendStatus('accepted');
    } finally {
      setActing(false);
    }
  }

  const status: FriendStatus = isMe ? 'self' : friendStatus;
  const displayName = profile?.username ?? profile?.display_name ?? '…';
  const winPct =
    profile && profile.games_played > 0
      ? Math.round(
          (profile.time_stats.reduce((s, t) => s + t.wins, 0) / profile.games_played) * 100,
        )
      : 0;

  function renderFriendAction() {
    if (status === 'self') return null;
    if (status === 'accepted') {
      return <span className="profile-friend-badge">Friends ✓</span>;
    }
    if (status === 'pending_sent') {
      return <span className="profile-friend-badge">Request Sent</span>;
    }
    if (status === 'pending_received') {
      return (
        <button
          className="btn profile-add-btn"
          onClick={handleAcceptRequest}
          disabled={acting}
        >
          {acting ? '…' : 'Accept Request'}
        </button>
      );
    }
    return (
      <button className="btn profile-add-btn" onClick={handleAddFriend} disabled={acting}>
        {acting ? '…' : '+ Add Friend'}
      </button>
    );
  }

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
                  <p className="profile-elo" style={{ color: eloColor(profile.elo) }}>
                    {profile.elo} ELO
                  </p>
                </div>
                {renderFriendAction()}
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
                  <span className="profile-stat-value" style={{ color: eloColor(profile.elo) }}>
                    {profile.elo}
                  </span>
                  <span className="profile-stat-label">ELO</span>
                </div>
                <div className="profile-stat-card">
                  <span className="profile-stat-value">
                    {new Date(profile.created_at).toLocaleDateString([], {
                      month: 'short',
                      year: 'numeric',
                    })}
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
                        <span className="profile-tc-elo" style={{ color: eloColor(t.elo) }}>
                          {t.elo}
                        </span>
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
