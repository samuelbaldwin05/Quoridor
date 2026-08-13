import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppLoading } from './AppLoading';

/**
 * Sends a signed-in user who has never chosen a username to /setup, and holds everything else
 * until auth has resolved.
 *
 * This wraps every route except /login and /setup, so whatever it renders while loading is the
 * entire app for that moment. It used to render null, which meant a blank page for as long as
 * the profile request took, and forever if that request never settled. See DECISIONS.
 *
 * Lives here rather than in App.tsx so it can be tested without importing every page, and with
 * it the Supabase client, which needs configured env just to construct.
 */
export function UsernameGuard({ children }: { children: React.ReactNode }) {
  const { needsUsername, isLoading } = useAuth();
  if (isLoading) return <AppLoading note="Signing you in…" />;
  if (needsUsername) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}
