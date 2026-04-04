import { useEffect, useRef, useState } from 'react';
import { NavSidebar } from '@/components/NavSidebar';
import { ProfileModal } from '@/components/ProfileModal';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserResult {
  id: string;
  display_name: string;
  elo: number;
}

interface FriendEntry {
  friendship_id: string;
  friend_id: string;
  display_name: string;
  elo: number;
  status: 'accepted' | 'pending_sent' | 'pending_received';
}

type FriendsTab = 'friends' | 'search';

// ── ELO color helper ──────────────────────────────────────────────────────────

function eloColor(elo: number): string {
  if (elo >= 1800) return '#f39c12';
  if (elo >= 1500) return '#3498db';
  if (elo >= 1300) return '#2ecc71';
  return 'rgba(255,255,255,0.5)';
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  return (
    <div className="friend-avatar">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function FriendsPage() {
  const [tab, setTab] = useState<FriendsTab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load friend list (uses seed data from DB)
  useEffect(() => {
    async function loadFriends() {
      setLoadingFriends(true);
      try {
        // Query the users table for mock friend data (demo: first 6 users)
        const { data } = await supabase
          .from('users')
          .select('id, display_name, elo')
          .order('elo', { ascending: false })
          .limit(6);

        if (data) {
          setFriends(
            data.map((u, i) => ({
              friendship_id: `mock-${u.id}`,
              friend_id: u.id,
              display_name: u.display_name,
              elo: u.elo,
              status: i < 4 ? 'accepted' : 'pending_received',
            })),
          );
        }
      } catch {
        // silently handle — no backend required
      } finally {
        setLoadingFriends(false);
      }
    }
    loadFriends();
  }, []);

  // Debounced search
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
        const { data } = await supabase
          .from('users')
          .select('id, display_name, elo')
          .ilike('display_name', `%${q}%`)
          .limit(20);
        setSearchResults((data as UserResult[]) ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 350);
  }, [searchQuery]);

  function handleAddFriend(userId: string) {
    setAddedIds((prev) => new Set(prev).add(userId));
    // TODO: POST /api/friends/request with auth
  }

  function handleAccept(friendshipId: string) {
    setFriends((prev) =>
      prev.map((f) =>
        f.friendship_id === friendshipId ? { ...f, status: 'accepted' } : f,
      ),
    );
    // TODO: PUT /api/friends/{id}/accept with auth
  }

  function handleDecline(friendshipId: string) {
    setFriends((prev) => prev.filter((f) => f.friendship_id !== friendshipId));
    // TODO: DELETE /api/friends/{id} with auth
  }

  const acceptedFriends = friends.filter((f) => f.status === 'accepted');
  const pendingReceived = friends.filter((f) => f.status === 'pending_received');
  const pendingSent = friends.filter((f) => f.status === 'pending_sent');

  const filteredAccepted = friendSearch.trim()
    ? acceptedFriends.filter((f) =>
        f.display_name.toLowerCase().includes(friendSearch.toLowerCase()),
      )
    : acceptedFriends;

  return (
    <div className="game-layout">
      <NavSidebar activePage="friends" />

      <div className="main-content">
        <div className="board-section">
          {/* ── Friends Card ─────────────────────────────────────────────── */}
          <div className="friends-card">
            {/* Tab bar */}
            <div className="friends-tabs">
              <button
                className={`friends-tab${tab === 'friends' ? ' friends-tab-active' : ''}`}
                onClick={() => setTab('friends')}
              >
                Friends{acceptedFriends.length > 0 && ` (${acceptedFriends.length})`}
              </button>
              <button
                className={`friends-tab${tab === 'search' ? ' friends-tab-active' : ''}`}
                onClick={() => setTab('search')}
              >
                Find Players
              </button>
            </div>

            {/* ── SEARCH TAB ────────────────────────────────────────────── */}
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
                    <button
                      className="friends-search-clear"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="friends-list">
                  {searchQuery.trim().length < 2 && (
                    <p className="friends-empty">Type at least 2 characters to search.</p>
                  )}
                  {loadingSearch && (
                    <p className="friends-empty">Searching…</p>
                  )}
                  {!loadingSearch && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                    <p className="friends-empty">No players found for "{searchQuery}".</p>
                  )}
                  {searchResults.map((user) => (
                    <div key={user.id} className="friend-item">
                      <Avatar name={user.display_name} />
                      <div className="friend-item-info">
                        <button
                          className="friend-item-name"
                          onClick={() => setProfileUserId(user.id)}
                        >
                          {user.display_name}
                        </button>
                        <span className="friend-item-elo" style={{ color: eloColor(user.elo) }}>
                          {user.elo} ELO
                        </span>
                      </div>
                      <div className="friend-item-actions">
                        {addedIds.has(user.id) ? (
                          <span className="friend-added-badge">Sent ✓</span>
                        ) : (
                          <button
                            className="btn friend-add-btn"
                            onClick={() => handleAddFriend(user.id)}
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FRIENDS TAB ───────────────────────────────────────────── */}
            {tab === 'friends' && (
              <div className="friends-list-body">
                {loadingFriends ? (
                  <p className="friends-empty" style={{ padding: '24px 20px' }}>Loading…</p>
                ) : (
                  <>
                    {/* Search bar for friends list */}
                    {acceptedFriends.length > 0 && (
                      <div className="friends-search-bar-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="friends-search-icon">🔍</span>
                        <input
                          className="friends-search-input"
                          type="text"
                          placeholder="Search friends…"
                          value={friendSearch}
                          onChange={(e) => setFriendSearch(e.target.value)}
                        />
                        {friendSearch && (
                          <button className="friends-search-clear" onClick={() => setFriendSearch('')}>×</button>
                        )}
                      </div>
                    )}

                    {/* Pending requests from others */}
                    {pendingReceived.length > 0 && (
                      <div className="friends-section">
                        <p className="friends-section-label">PENDING REQUESTS ({pendingReceived.length})</p>
                        {pendingReceived.map((f) => (
                          <div key={f.friendship_id} className="friend-item">
                            <Avatar name={f.display_name} />
                            <div className="friend-item-info">
                              <button
                                className="friend-item-name"
                                onClick={() => setProfileUserId(f.friend_id)}
                              >
                                {f.display_name}
                              </button>
                              <span className="friend-item-elo" style={{ color: eloColor(f.elo) }}>
                                {f.elo} ELO
                              </span>
                            </div>
                            <div className="friend-item-actions">
                              <button
                                className="btn friend-accept-btn"
                                onClick={() => handleAccept(f.friendship_id)}
                                title="Accept"
                              >
                                ✓
                              </button>
                              <button
                                className="btn friend-decline-btn"
                                onClick={() => handleDecline(f.friendship_id)}
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
                        <p className="friends-section-label">SENT REQUESTS ({pendingSent.length})</p>
                        {pendingSent.map((f) => (
                          <div key={f.friendship_id} className="friend-item">
                            <Avatar name={f.display_name} />
                            <div className="friend-item-info">
                              <button
                                className="friend-item-name"
                                onClick={() => setProfileUserId(f.friend_id)}
                              >
                                {f.display_name}
                              </button>
                              <span className="friend-item-elo" style={{ color: eloColor(f.elo) }}>
                                {f.elo} ELO
                              </span>
                            </div>
                            <div className="friend-item-actions">
                              <span className="friend-pending-badge">Pending</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Accepted friends */}
                    {filteredAccepted.length > 0 && (
                      <div className="friends-section">
                        <p className="friends-section-label">FRIENDS ({filteredAccepted.length})</p>
                        {filteredAccepted.map((f) => (
                          <div key={f.friendship_id} className="friend-item">
                            <Avatar name={f.display_name} />
                            <div className="friend-item-info">
                              <button
                                className="friend-item-name"
                                onClick={() => setProfileUserId(f.friend_id)}
                              >
                                {f.display_name}
                              </button>
                              <span className="friend-item-elo" style={{ color: eloColor(f.elo) }}>
                                {f.elo} ELO
                              </span>
                            </div>
                            <div className="friend-item-actions">
                              <button
                                className="btn friend-challenge-btn"
                                title="Challenge"
                                onClick={() => {}}
                              >
                                ⚔
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {acceptedFriends.length === 0 && pendingReceived.length === 0 && (
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

      <ProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  );
}

