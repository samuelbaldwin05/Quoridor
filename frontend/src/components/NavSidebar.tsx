import { useNavigate } from 'react-router-dom';

type PageId = 'play' | 'rules' | 'puzzles' | 'friends' | 'history';

const NAV_ITEMS: { id: PageId; label: string; path: string; emoji: string }[] = [
  { id: 'play',    label: 'Play',         path: '/',        emoji: '♟️' },
  { id: 'rules',   label: 'Rules',        path: '/rules',   emoji: '📖' },
  { id: 'puzzles', label: 'Puzzles',      path: '/puzzles', emoji: '🧩' },
  { id: 'friends', label: 'Friends',      path: '/friends', emoji: '👥' },
  { id: 'history', label: 'Game History', path: '/history', emoji: '📋' },
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
          </button>
        ))}
      </div>

      {/* Profile + logout pinned to bottom */}
      <div className="nav-bottom">
        <button className="nav-item nav-profile">
          <div className="nav-avatar">G</div>
          <div className="nav-profile-info">
            <span className="nav-profile-name">Profile</span>
            <span className="nav-profile-id">guest_user</span>
          </div>
        </button>
        <button className="nav-item nav-item-logout">Log out</button>
      </div>
    </nav>
  );
}
