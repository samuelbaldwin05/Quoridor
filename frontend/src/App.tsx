import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { useBotGameSync } from './hooks/useBotGameSync';
import { UsernameGuard } from './components/UsernameGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChallengeRedirector } from './components/ChallengeRedirector';
import { GamePage } from './pages/GamePage';
import { RulesPage } from './pages/RulesPage';
import { GameHistoryPage } from './pages/GameHistoryPage';
import { PuzzlesPage } from './pages/PuzzlesPage';
import { FriendsPage } from './pages/FriendsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginPage } from './pages/LoginPage';
import { OnlineGamePage } from './pages/OnlineGamePage';
import { UsernameSetupPage } from './pages/UsernameSetupPage';
import { ProfilePage } from './pages/ProfilePage';

const queryClient = new QueryClient();

// Side-effect-only: backfills local bot-game history to the backend once the user
// is authenticated. Renders nothing.
function BotGameSyncer() {
  useBotGameSync();
  return null;
}

function LandscapeBlocker() {
  return (
    <div className="landscape-blocker" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="landscape-blocker-icon"
      >
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
      <p className="landscape-blocker-text">Rotate to portrait</p>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <LandscapeBlocker />
          {/* Inside the router and the auth provider, so the fallback can still use both, and
              wrapping the routes rather than the whole tree so a page-level throw does not
              take the providers down with it. */}
          <ErrorBoundary>
            <ChallengeRedirector />
            <BotGameSyncer />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup" element={<UsernameSetupPage />} />
              <Route
                path="/"
                element={
                  <UsernameGuard>
                    <GamePage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/rules"
                element={
                  <UsernameGuard>
                    <RulesPage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/puzzles"
                element={
                  <UsernameGuard>
                    <PuzzlesPage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/friends"
                element={
                  <UsernameGuard>
                    <FriendsPage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/leaderboard"
                element={
                  <UsernameGuard>
                    <LeaderboardPage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/history"
                element={
                  <UsernameGuard>
                    <GameHistoryPage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/history/:id"
                element={
                  <UsernameGuard>
                    <GameHistoryPage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/game/online/:gameId"
                element={
                  <UsernameGuard>
                    <OnlineGamePage />
                  </UsernameGuard>
                }
              />
              <Route
                path="/profile/:userId"
                element={
                  <UsernameGuard>
                    <ProfilePage />
                  </UsernameGuard>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
