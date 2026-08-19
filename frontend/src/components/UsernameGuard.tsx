import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Sends a signed-in user who has never chosen a username to /setup, and holds everything else
 * until auth has resolved.
 *
 * This wraps every route except /login and /setup, so whatever it renders while loading is the
 * entire app for that moment. Rendering nothing is deliberate and is NOT the blank-page bug
 * that AppLoading was once added to fix: the loading board in index.html is still on screen at
 * this point, covering the viewport, and useAuth takes it away when auth resolves. See
 * lib/bootSplash.ts and DECISIONS.
 *
 * Lives here rather than in App.tsx so it can be tested without importing every page, and with
 * it the Supabase client, which needs configured env just to construct.
 */
export function UsernameGuard({ children }: { children: React.ReactNode }) {
  const { needsUsername, isLoading } = useAuth();
  if (isLoading) return null;
  if (needsUsername) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}
