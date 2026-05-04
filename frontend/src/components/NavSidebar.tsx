import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { config } from '@/lib/config';
import { supabase } from '@/lib/supabase';

type PageId = 'play' | 'rules' | 'puzzles' | 'friends' | 'history' | 'leaderboard';

const ALL_NAV_ITEMS: { id: PageId; label: string; path: string; emoji: string }[] = [
  { id: 'play', label: 'Play', path: '/', emoji: '♟️' },
  { id: 'puzzles', label: 'Puzzles', path: '/puzzles', emoji: '🧩' },
  { id: 'friends', label: 'Friends', path: '/friends', emoji: '👥' },
  { id: 'history', label: 'Game History', path: '/history', emoji: '📋' },
  { id: 'leaderboard', label: 'Leaderboard', path: '/leaderboard', emoji: '🏆' },
  { id: 'rules', label: 'Rules', path: '/rules', emoji: '📖' },
];

const featureFlags: Record<string, boolean | undefined> = config.features;
const NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => featureFlags[item.id] ?? true);

interface NavSidebarProps {
  activePage?: PageId;
}

function PawnIcon() {
  return (
    <svg className="nav-pawn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="6.5" r="3.5" />
      <path d="M10 10.5 C8.5 13 7.5 16 6.5 20.5 H17.5 C16.5 16 15.5 13 14 10.5 Z" />
      <rect x="5" y="20.5" width="14" height="2" rx="1" />
    </svg>
  );
}

export function NavSidebar({ activePage = 'play' }: NavSidebarProps) {
  const navigate = useNavigate();
  const { user, profile, isGuest, signOut, updateUsername } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setPendingCount(0);
      return;
    }
    const fetchPending = async () => {
      const [friends, challenges] = await Promise.all([
        supabase
          .from('friendships')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('challenges')
          .select('id', { count: 'exact', head: true })
          .eq('challenged_id', user.id)
          .eq('status', 'pending'),
      ]);
      setPendingCount((friends.count ?? 0) + (challenges.count ?? 0));
    };
    void fetchPending();
    const interval = setInterval(() => void fetchPending(), 5000);
    return () => clearInterval(interval);
    // user.id is the stable identifier; full user object reference changes on every auth refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Close menu on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setEditingUsername(false);
        setUsernameError('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const displayName = profile?.username ?? 'Guest';
  const avatarLetter = displayName[0]?.toUpperCase() ?? 'G';
  const eloLabel = profile ? `ELO ${profile.elo}` : isGuest ? 'Guest' : '…';

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  function openUsernameEdit() {
    setUsernameInput(profile?.username ?? '');
    setUsernameError('');
    setEditingUsername(true);
  }

  async function saveUsername() {
    const trimmed = usernameInput.trim();
    if (trimmed.length < 3) {
      setUsernameError('At least 3 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError('Letters, numbers, underscores only.');
      return;
    }
    setSavingUsername(true);
    setUsernameError('');
    try {
      await updateUsername(trimmed);
      setEditingUsername(false);
      setMenuOpen(false);
    } catch (err) {
      setUsernameError(
        err instanceof Error && err.message.includes('409') ? 'Username taken.' : 'Error saving.',
      );
    } finally {
      setSavingUsername(false);
    }
  }

  return (
    <nav className="nav-sidebar">
      {/* Logo */}
      <div className="nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        <PawnIcon />
        <span className="nav-logo-text">Quoridor</span>
      </div>

      {/* Main navigation */}
      <div className="nav-items">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item${activePage === item.id ? ' nav-item-active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-item-emoji">{item.emoji}</span>
            {item.label}
            {item.id === 'friends' && pendingCount > 0 && (
              <span className="nav-badge" aria-label={`${pendingCount} pending`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Profile + auth pinned to bottom */}
      <div className="nav-bottom">
        {isGuest ? (
          <>
            <div className="nav-item nav-profile">
              <div className="nav-avatar nav-avatar-guest">G</div>
              <div className="nav-profile-info">
                <span className="nav-profile-name">Playing as Guest</span>
              </div>
            </div>
            <button className="nav-item nav-item-login" onClick={() => navigate('/login')}>
              Log in
            </button>
          </>
        ) : (
          <div className="nav-profile-wrap" ref={menuRef}>
            {/* Profile button → opens mini menu */}
            <button
              className="nav-item nav-profile nav-profile-btn"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <div className="nav-avatar">{avatarLetter}</div>
              <div className="nav-profile-info">
                <span className="nav-profile-name">{displayName}</span>
                <span className="nav-profile-id">{eloLabel}</span>
              </div>
              <svg
                className="nav-chevron"
                viewBox="0 0 10 6"
                fill="currentColor"
                width="10"
                height="6"
              >
                <path d={menuOpen ? 'M0 6L5 0L10 6' : 'M0 0L5 6L10 0'} />
              </svg>
            </button>

            {/* Mini menu */}
            {menuOpen && (
              <div className="nav-profile-menu">
                <button
                  className="nav-profile-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/profile/${profile?.id}`);
                  }}
                >
                  <span>👤</span> View Profile
                </button>

                {!editingUsername ? (
                  <button className="nav-profile-menu-item" onClick={openUsernameEdit}>
                    <span>✏️</span> Change Username
                  </button>
                ) : (
                  <div className="nav-username-edit">
                    <input
                      className={`nav-username-input${usernameError ? ' nav-username-input-error' : ''}`}
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value);
                        setUsernameError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveUsername();
                        if (e.key === 'Escape') setEditingUsername(false);
                      }}
                      placeholder="new username"
                      maxLength={24}
                      autoFocus
                    />
                    {usernameError && <p className="nav-username-error">{usernameError}</p>}
                    <div className="nav-username-actions">
                      <button
                        className="btn nav-username-save"
                        onClick={saveUsername}
                        disabled={savingUsername}
                      >
                        {savingUsername ? '…' : 'Save'}
                      </button>
                      <button
                        className="btn nav-username-cancel"
                        onClick={() => setEditingUsername(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button className="nav-item nav-item-logout" onClick={handleLogout}>
              <svg
                className="nav-logout-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8" />
                <polyline points="17 8 21 12 17 16" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
