import { useEffect, useRef } from 'react';
import { syncPendingBotGames } from '@/lib/botGameSync';
import { useAuth } from './useAuth';

// Backfill local game history to the backend once per session. Runs for any session
// (guest, dev or Google); a sign-out re-arms it so the next one syncs again.
//
// This is the retroactive half of the recording: games played in this browser before there
// was ever a session, including every guest game, upload the first time one exists.
export function useBotGameSync(): void {
  const { authMode, isLoading } = useAuth();
  const didSync = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (authMode === 'none') {
      didSync.current = false; // re-arm for the next login
      return;
    }
    if (didSync.current) return;
    didSync.current = true;
    void syncPendingBotGames();
  }, [authMode, isLoading]);
}
