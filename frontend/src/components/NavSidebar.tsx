import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type PageId = 'play' | 'rules' | 'puzzles' | 'friends' | 'history' | 'leaderboard';

const NAV_ITEMS: { id: PageId; label: string; path: string; emoji: string }[] = [
  { id: 'play',        label: 'Play',         path: '/',            emoji: '♟️' },
  { id: 'puzzles',     label: 'Puzzles',      path: '/puzzles',     emoji: '🧩' },
  { id: 'friends',     label: 'Friends',      path: '/friends',     emoji: '👥' },
  { id: 'history',     label: 'Game History', path: '/history',     emoji: '📋' },
  { id: 'leaderboard', label: 'Leaderboard',  path: '/leaderboard', emoji: '🏆' },
  { id: 'rules',       label: 'Rules',        path: '/rules',       emoji: '📖' },
];

interface NavSidebarProps {
  activePage?: PageId;
}

function PawnIcon() {
  return (
    <svg
      className="nav-pawn-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="6.5" r="3.5" />
      <path d="M10 10.5 C8.5 13 7.5 16 6.5 20.5 H17.5 C16.5 16 15.5 13 14 10.5 Z" />
      <rect x="5" y="20.5" width="14" height="2" rx="1" />
    </svg>
  );
}

export function NavSidebar({ activePage = 'play' }: NavSidebarProps) {
  const navigate = useNavigate();
  const { user, profile, isGuest, signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) { setPendingCount(0); return; }
    void supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0));
  }, [user?.id]);

  const displayName = profile?.display_name ?? user?.email?.split('@')[0] ?? 'Guest';
  const avatarLetter = displayName[0]?.toUpperCase() ?? 'G';
  const eloLabel = profile ? `ELO ${profile.elo}` : isGuest ? 'Guest' : '…';

  async function handleLogout() {
    await signOut();
    navigate('/');
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
              <span className="nav-pending-dot" aria-label={`${pendingCount} pending request`} />
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
          <>
            <button className="nav-item nav-profile">
              <div className="nav-avatar">{avatarLetter}</div>
              <div className="nav-profile-info">
                <span className="nav-profile-name">{displayName}</span>
                <span className="nav-profile-id">{eloLabel}</span>
              </div>
            </button>
            <button className="nav-item nav-item-logout" onClick={handleLogout}>
              <svg className="nav-logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {/* Door frame (open door) */}
                <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8" />
                {/* Arrow pointing right (out the door) */}
                <polyline points="17 8 21 12 17 16" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
