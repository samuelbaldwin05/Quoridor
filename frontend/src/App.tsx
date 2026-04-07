import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { GamePage } from './pages/GamePage';
import { RulesPage } from './pages/RulesPage';
import { GameHistoryPage } from './pages/GameHistoryPage';
import { PuzzlesPage } from './pages/PuzzlesPage';
import { FriendsPage } from './pages/FriendsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginPage } from './pages/LoginPage';
import { OnlineGamePage } from './pages/OnlineGamePage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<GamePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/puzzles" element={<PuzzlesPage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/history" element={<GameHistoryPage />} />
            <Route path="/history/:id" element={<GameHistoryPage />} />
            <Route path="/game/online/:gameId" element={<OnlineGamePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
