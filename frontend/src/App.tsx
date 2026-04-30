import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
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

// Redirects logged-in users without a username to /setup before anything else
function UsernameGuard({ children }: { children: React.ReactNode }) {
  const { needsUsername, isLoading } = useAuth();
  if (isLoading) return null;
  if (needsUsername) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<UsernameSetupPage />} />
            <Route path="/" element={<UsernameGuard><GamePage /></UsernameGuard>} />
            <Route path="/rules" element={<UsernameGuard><RulesPage /></UsernameGuard>} />
            <Route path="/puzzles" element={<UsernameGuard><PuzzlesPage /></UsernameGuard>} />
            <Route path="/friends" element={<UsernameGuard><FriendsPage /></UsernameGuard>} />
            <Route path="/leaderboard" element={<UsernameGuard><LeaderboardPage /></UsernameGuard>} />
            <Route path="/history" element={<UsernameGuard><GameHistoryPage /></UsernameGuard>} />
            <Route path="/history/:id" element={<UsernameGuard><GameHistoryPage /></UsernameGuard>} />
            <Route path="/game/online/:gameId" element={<UsernameGuard><OnlineGamePage /></UsernameGuard>} />
            <Route path="/profile/:userId" element={<UsernameGuard><ProfilePage /></UsernameGuard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
