import { useEffect, useRef } from 'react';
import { syncPendingBotGames } from '@/lib/botGameSync';
import { useAuth } from './useAuth';

// Backfill local bot-game history to the backend once per authenticated session.
// Runs when the user is signed in (dev or Google); a sign-out re-arms it so the
// next login syncs again. Unsynced games only upload once the user next logs in.
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
