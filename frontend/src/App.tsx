import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GamePage } from './pages/GamePage';
import { RulesPage } from './pages/RulesPage';
import { GameHistoryPage } from './pages/GameHistoryPage';
import { PuzzlesPage } from './pages/PuzzlesPage';
import { FriendsPage } from './pages/FriendsPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GamePage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/puzzles" element={<PuzzlesPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/history" element={<GameHistoryPage />} />
          <Route path="/history/:id" element={<GameHistoryPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
