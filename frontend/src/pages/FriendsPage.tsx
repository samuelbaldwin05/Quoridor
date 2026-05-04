import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { NavSidebar } from '@/components/NavSidebar';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserResult {
  id: string;
  username: string;
  elo: number;
}

interface FriendEntry {
  friendship_id: string;
  friend_id: string;
  username: string;
  elo: number;
  status: 'accepted' | 'pending_sent' | 'pending_received';
}

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

interface ApiFriend {
  friendship_id: string;
  friend_id: string;
  username: string;
  elo: number;
  status: string;
  requester_id?: string;
}

type FriendsTab = 'friends' | 'search';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eloColor(elo: number): string {
  if (elo >= 1800) return '#f39c12';
  if (elo >= 1500) return '#3498db';
  if (elo >= 1300) return '#2ecc71';
  return 'rgba(255,255,255,0.5)';
}

function displayFor(u: { username: string }): string {
  return u.username;
}

function tcLabel(tc: number): string {
  return tc < 60 ? `${tc}s` : `${tc / 60}m`;
}

function Avatar({ name }: { name: string }) {
  return <div className="friend-avatar">{name.charAt(0).toUpperCase()}</div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function FriendsPage() {
  const { isGuest, isLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<FriendsTab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [challenges, setChallenges] = useState<ChallengeEntry[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myId = profile?.id ?? '';

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadFriends = useCallback(
    async (silent = false) => {
      if (!myId) return;
      if (!silent) setLoadingFriends(true);
      try {
        const [friendData, challengeData] = await Promise.all([
          apiFetch<ApiFriend[]>('/api/friends/'),
          apiFetch<ChallengeEntry[]>('/api/challenges/'),
        ]);
        setFriends(
          friendData.map((f) => {
            let status: FriendEntry['status'];
            if (f.status === 'accepted') status = 'accepted';
            else if (f.requester_id === myId) status = 'pending_sent';
            else status = 'pending_received';
            return { ...f, status };
          }),
        );
        setChallenges(challengeData);
      } catch {
        // silently handle
      } finally {
        if (!silent) setLoadingFriends(false);
      }
    },
    [myId],
  );

  // Initial load + 5s background poll so incoming requests/challenges show up
  // without needing a page interaction. The "challenger gets redirected on
  // accept" half lives in <ChallengeRedirector /> so it works app-wide.
  useEffect(() => {
    void loadFriends(false);
    const interval = setInterval(() => void loadFriends(true), 5000);
    return () => clearInterval(interval);
  }, [loadFriends]);

  // ── Debounced search ─────────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const data = await apiFetch<UserResult[]>(`/api/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 350);
  }, [searchQuery]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function setPending(id: string, on: boolean) {
    setPendingActions((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAddFriend(userId: string) {
    setPending(userId, true);
    try {
      await apiFetch('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ receiver_id: userId }),
      });
      await loadFriends();
    } catch {
      // ignore duplicate
    } finally {
      setPending(userId, false);
    }
  }

  async function handleAccept(friendshipId: string) {
    setPending(friendshipId, true);
    try {
      await apiFetch(`/api/friends/${friendshipId}/accept`, { method: 'PUT' });
      setFriends((prev) =>
        prev.map((f) => (f.friendship_id === friendshipId ? { ...f, status: 'accepted' } : f)),
      );
    } finally {
      setPending(friendshipId, false);
    }
  }

  async function handleDecline(friendshipId: string) {
    setPending(friendshipId, true);
    try {
      await apiFetch(`/api/friends/${friendshipId}`, { method: 'DELETE' });
      setFriends((prev) => prev.filter((f) => f.friendship_id !== friendshipId));
    } finally {
      setPending(friendshipId, false);
    }
  }

  async function handleChallenge(friendId: string, timeControl = 300) {
    setPending(`challenge-${friendId}`, true);
    try {
      await apiFetch('/api/challenges/', {
        method: 'POST',
        body: JSON.stringify({ challenged_id: friendId, time_control: timeControl }),
      });
      await loadFriends();
    } catch {
      // already challenged
    } finally {
      setPending(`challenge-${friendId}`, false);
    }
  }

  async function handleAcceptChallenge(
    challengeId: string,
    timeControl: number,
    challengerName: string | null,
  ) {
    setPending(`chal-${challengeId}`, true);
    try {
      const result = await apiFetch<ChallengeEntry>(`/api/challenges/${challengeId}/accept`, {
        method: 'POST',
      });
      if (result.game_id) {
        navigate(
          `/game/online/${result.game_id}?role=1&opponent=${encodeURIComponent(challengerName ?? 'Opponent')}&opponentElo=500&tc=${timeControl}`,
        );
      }
    } finally {
      setPending(`chal-${challengeId}`, false);
    }
  }

  async function handleDeleteChallenge(challengeId: string) {
    setPending(`chal-${challengeId}`, true);
    try {
      await apiFetch(`/api/challenges/${challengeId}`, { method: 'DELETE' });
      setChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    } finally {
      setPending(`chal-${challengeId}`, false);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const acceptedFriends = friends.filter((f) => f.status === 'accepted');
  const pendingReceived = friends.filter((f) => f.status === 'pending_received');
  const pendingSent = friends.filter((f) => f.status === 'pending_sent');
  const incomingChallenges = challenges.filter(
    (c) => c.challenged_id === myId && c.status === 'pending',
  );
  const outgoingChallenges = challenges.filter(
    (c) => c.challenger_id === myId && c.status === 'pending',
  );
  const friendByUserId = new Map(friends.map((f) => [f.friend_id, f]));

  const filteredAccepted = friendSearch.trim()
    ? acceptedFriends.filter((f) =>
        displayFor(f).toLowerCase().includes(friendSearch.toLowerCase()),
      )
    : acceptedFriends;

  if (!isLoading && isGuest) return <Navigate to="/login" replace />;

  return (
    <div className="game-layout">
      <NavSidebar activePage="friends" />

      <div className="main-content">
        <div className="board-section">
          <div className="friends-card">
            {/* Tab bar */}
            <div className="friends-tabs">
              <button
                className={`friends-tab${tab === 'friends' ? ' friends-tab-active' : ''}`}
                onClick={() => setTab('friends')}
              >
                Friends{acceptedFriends.length > 0 && ` (${acceptedFriends.length})`}
                {pendingReceived.length > 0 && (
                  <span className="nav-badge" style={{ marginLeft: 6 }}>
                    {pendingReceived.length}
                  </span>
                )}
              </button>
              <button
                className={`friends-tab${tab === 'search' ? ' friends-tab-active' : ''}`}
                onClick={() => setTab('search')}
              >
                Find Players
              </button>
            </div>

            {/* ── SEARCH TAB ─────────────────────────────────────────────── */}
            {tab === 'search' && (
              <div className="friends-search-body">
                <div className="friends-search-bar-wrap">
                  <span className="friends-search-icon">🔍</span>
                  <input
                    className="friends-search-input"
                    type="text"
                    placeholder="Search by username…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searchQuery && (
                    <button className="friends-search-clear" onClick={() => setSearchQuery('')}>
                      ×
                    </button>
                  )}
                </div>

                <div className="friends-list">
                  {searchQuery.trim().length < 2 && (
                    <p className="friends-empty">Type at least 2 characters to search.</p>
                  )}
                  {loadingSearch && <p className="friends-empty">Searching…</p>}
                  {!loadingSearch &&
                    searchQuery.trim().length >= 2 &&
                    searchResults.length === 0 && (
                      <p className="friends-empty">No players found.</p>
                    )}
                  {searchResults.map((user) => {
                    const name = displayFor(user);
                    const existing = friendByUserId.get(user.id);
                    const isMe = user.id === myId;
                    const pendingKey = existing?.friendship_id ?? user.id;
                    return (
                      <div key={user.id} className="friend-item">
                        <Avatar name={name} />
                        <div className="friend-item-info">
                          <button
                            className="friend-item-name"
                            onClick={() => navigate(`/profile/${user.id}`)}
                          >
                            {name}
                          </button>
                          <span className="friend-item-elo" style={{ color: eloColor(user.elo) }}>
                            {user.elo} ELO
                          </span>
                        </div>
                        <div className="friend-item-actions">
                          {isMe ? (
                            <span className="friend-added-badge">You</span>
                          ) : existing?.status === 'accepted' ? (
                            <span className="friend-added-badge">Friends ✓</span>
                          ) : existing?.status === 'pending_sent' ? (
                            <span className="friend-added-badge">Sent</span>
                          ) : existing?.status === 'pending_received' ? (
                            <button
                              className="btn friend-add-btn"
                              onClick={() => handleAccept(existing.friendship_id)}
                              disabled={pendingActions.has(pendingKey)}
                            >
                              {pendingActions.has(pendingKey) ? '…' : 'Accept'}
                            </button>
                          ) : (
                            <button
                              className="btn friend-add-btn"
                              onClick={() => handleAddFriend(user.id)}
                              disabled={pendingActions.has(user.id)}
                            >
                              {pendingActions.has(user.id) ? '…' : '+ Add'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── FRIENDS TAB ─────────────────────────────────────────────── */}
            {tab === 'friends' && (
              <div className="friends-list-body">
                {loadingFriends ? (
                  <p className="friends-empty" style={{ padding: '24px 20px' }}>
                    Loading…
                  </p>
                ) : (
                  <>
                    {/* Incoming challenges */}
                    {incomingChallenges.length > 0 && (
                      <div className="friends-section">
                        <p className="friends-section-label">
                          CHALLENGES ({incomingChallenges.length})
                        </p>
                        {incomingChallenges.map((c) => (
                          <div key={c.id} className="friend-item">
                            <Avatar name={c.challenger_name ?? '?'} />
                            <div className="friend-item-info">
                              <span className="friend-item-name" style={{ cursor: 'default' }}>
                                {c.challenger_name ?? 'Unknown'}
                              </span>
                              <span className="friend-item-elo">
                                {tcLabel(c.time_control)} game
                              </span>
                            </div>
                            <div className="friend-item-actions">
                              <button
                                className="btn friend-accept-btn"
                                onClick={() =>
                                  handleAcceptChallenge(c.id, c.time_control, c.challenger_name)
                                }
                                disabled={pendingActions.has(`chal-${c.id}`)}
                                title="Accept challenge"
                              >
                                ✓
                              </button>
                              <button
                                className="btn friend-decline-btn"
                                onClick={() => handleDeleteChallenge(c.id)}
                                disabled={pendingActions.has(`chal-${c.id}`)}
                                title="Decline"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Outgoing challenges */}
                    {outgoingChallenges.length > 0 && (
                      <div className="friends-section">
                        <p className="friends-section-label">
                          SENT CHALLENGES ({outgoingChallenges.length})
                        </p>
                        {outgoingChallenges.map((c) => (
                          <div key={c.id} className="friend-item">
                            <Avatar name={c.challenged_name ?? '?'} />
                            <div className="friend-item-info">
                              <span className="friend-item-name" style={{ cursor: 'default' }}>
                                {c.challenged_name ?? 'Unknown'}
                              </span>
                              <span className="friend-item-elo">
                                {tcLabel(c.time_control)} game
                              </span>
                            </div>
                            <div className="friend-item-actions">
                              <span className="friend-pending-badge">Pending</span>
                              <button
                                className="btn friend-decline-btn"
                                onClick={() => handleDeleteChallenge(c.id)}
                                disabled={pendingActions.has(`chal-${c.id}`)}
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pending friend requests received */}
                    {pendingReceived.length > 0 && (
                      <div className="friends-section">
                        <p className="friends-section-label">
                          FRIEND REQUESTS ({pendingReceived.length})
                        </p>
                        {pendingReceived.map((f) => (
                          <div key={f.friendship_id} className="friend-item">
                            <Avatar name={displayFor(f)} />
                            <div className="friend-item-info">
                              <button
                                className="friend-item-name"
                                onClick={() => navigate(`/profile/${f.friend_id}`)}
                              >
                                {displayFor(f)}
                              </button>
                              <span className="friend-item-elo" style={{ color: eloColor(f.elo) }}>
                                {f.elo} ELO
                              </span>
                            </div>
                            <div className="friend-item-actions">
                              <button
                                className="btn friend-accept-btn"
                                onClick={() => handleAccept(f.friendship_id)}
                                disabled={pendingActions.has(f.friendship_id)}
                                title="Accept"
                              >
                                ✓
                              </button>
                              <button
                                className="btn friend-decline-btn"
                                onClick={() => handleDecline(f.friendship_id)}
                                disabled={pendingActions.has(f.friendship_id)}
                                title="Decline"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sent requests */}
                    {pendingSent.length > 0 && (
                      <div className="friends-section">
                        <p className="friends-section-label">
                          SENT REQUESTS ({pendingSent.length})
                        </p>
                        {pendingSent.map((f) => (
                          <div key={f.friendship_id} className="friend-item">
                            <Avatar name={displayFor(f)} />
                            <div className="friend-item-info">
                              <button
                                className="friend-item-name"
                                onClick={() => navigate(`/profile/${f.friend_id}`)}
                              >
                                {displayFor(f)}
                              </button>
                              <span className="friend-item-elo" style={{ color: eloColor(f.elo) }}>
                                {f.elo} ELO
                              </span>
                            </div>
                            <div className="friend-item-actions">
                              <span className="friend-pending-badge">Pending</span>
                              <button
                                className="btn friend-decline-btn"
                                onClick={() => handleDecline(f.friendship_id)}
                                disabled={pendingActions.has(f.friendship_id)}
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Friend search + list */}
                    {acceptedFriends.length > 0 && (
                      <>
                        <div
                          className="friends-search-bar-wrap"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <span className="friends-search-icon">🔍</span>
                          <input
                            className="friends-search-input"
                            type="text"
                            placeholder="Search friends…"
                            value={friendSearch}
                            onChange={(e) => setFriendSearch(e.target.value)}
                          />
                          {friendSearch && (
                            <button
                              className="friends-search-clear"
                              onClick={() => setFriendSearch('')}
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className="friends-section">
                          <p className="friends-section-label">
                            FRIENDS ({filteredAccepted.length})
                          </p>
                          {filteredAccepted.map((f) => (
                            <div key={f.friendship_id} className="friend-item">
                              <Avatar name={displayFor(f)} />
                              <div className="friend-item-info">
                                <button
                                  className="friend-item-name"
                                  onClick={() => navigate(`/profile/${f.friend_id}`)}
                                >
                                  {displayFor(f)}
                                </button>
                                <span
                                  className="friend-item-elo"
                                  style={{ color: eloColor(f.elo) }}
                                >
                                  {f.elo} ELO
                                </span>
                              </div>
                              <div className="friend-item-actions">
                                <button
                                  className="btn friend-challenge-btn"
                                  title="Challenge"
                                  disabled={pendingActions.has(`challenge-${f.friend_id}`)}
                                  onClick={() => handleChallenge(f.friend_id)}
                                >
                                  ⚔
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {acceptedFriends.length === 0 &&
                      pendingReceived.length === 0 &&
                      incomingChallenges.length === 0 && (
                        <div className="friends-empty-state">
                          <span className="friends-empty-emoji">👥</span>
                          <p className="friends-empty-title">No friends yet</p>
                          <p className="friends-empty-sub">
                            Use "Find Players" to search by username.
                          </p>
                        </div>
                      )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
