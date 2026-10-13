import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NavSidebar } from '@/components/NavSidebar';
import { supabase } from '@/lib/supabase';
import { dismissBootSplash, holdBootSplash, releaseBootSplash } from '@/lib/bootSplash';
import { claimHandoff } from '@/lib/oauthHandoff';

// Codes the backend puts in the fragment when it gives up. Anything unrecognised gets the
// generic line, since these are for the person reading them, not for us.
const MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  not_configured: 'Google sign-in is not set up on this server.',
  expired: 'That sign-in took too long. Please try again.',
  bad_state: 'That sign-in could not be verified. Please try again.',
  email_unverified: 'Google has not verified the email on that account.',
  google_unreachable: 'Could not reach Google. Please try again in a moment.',
};

function messageFor(code: string): string {
  return MESSAGES[code] ?? 'Something went wrong signing you in. Please try again.';
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // StrictMode runs effects twice in development, and an id_token is only good once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // The loading board from index.html stays up for the whole exchange, and this page draws
    // nothing of its own until something goes wrong. Without the hold, auth resolves to
    // "guest" for an instant here (the session is not in storage yet) and the board would be
    // pulled away mid-sign-in.
    holdBootSplash();

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    // Out of the address bar before anything awaits, so a token can't be shoulder-read or
    // land in a shared screenshot while Supabase is thinking.
    window.history.replaceState(null, '', '/auth/callback');

    function fail(message: string): void {
      releaseBootSplash();
      dismissBootSplash();
      setError(message);
    }

    async function complete(): Promise<void> {
      const failure = params.get('auth_error');
      if (failure) {
        fail(messageFor(failure));
        return;
      }

      const idToken = params.get('id_token');
      if (!idToken) {
        fail(messageFor('missing'));
        return;
      }
      if (!claimHandoff(params.get('handoff'))) {
        fail('That sign-in did not start in this tab, so it was ignored.');
        return;
      }

      const accessToken = params.get('access_token');
      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        // Supabase needs this to check the id_token's at_hash claim.
        access_token: accessToken || undefined,
      });
      if (authError) {
        fail(authError.message);
        return;
      }
      // Dismissed here rather than left to useAuth: the session arriving does not move
      // isLoading, so nothing downstream would take the splash away. The fade covers the
      // handover to the page underneath.
      releaseBootSplash();
      dismissBootSplash();
      navigate('/', { replace: true });
    }

    void complete();
  }, [navigate]);

  // Nothing to draw while it is working: the loading board is covering the screen.
  if (!error) return null;

  return (
    <div className="game-layout">
      <NavSidebar activePage="play" />
      <div className="main-content">
        <div className="login-card">
          <h1 className="login-title">Sign-in failed</h1>
          <p className="login-error">{error}</p>
          <p className="login-subtitle">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
