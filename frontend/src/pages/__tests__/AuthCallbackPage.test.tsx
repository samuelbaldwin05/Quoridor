// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthCallbackPage } from '../AuthCallbackPage';
import { beginHandoff } from '@/lib/oauthHandoff';

const signInWithIdToken = vi.hoisted(() =>
  vi.fn(async () => ({ data: {}, error: null }) as unknown),
);
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithIdToken } } }));
vi.mock('@/components/NavSidebar', () => ({ NavSidebar: () => null }));

function renderCallback(fragment: string) {
  window.history.replaceState(null, '', `/auth/callback#${fragment}`);
  return render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<p>the app</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  signInWithIdToken.mockResolvedValue({ data: {}, error: null } as unknown);
});

describe('AuthCallbackPage', () => {
  it('trades a returned id_token for a Supabase session', async () => {
    const handoff = beginHandoff();
    renderCallback(`id_token=abc&access_token=xyz&handoff=${handoff}`);

    await waitFor(() => expect(signInWithIdToken).toHaveBeenCalled());
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'abc',
      access_token: 'xyz',
    });
    await screen.findByText('the app');
  });

  it('ignores a fragment this browser never asked for', async () => {
    // Someone else's id_token in a link would otherwise sign this browser into their
    // account. Nothing was started here, so there is no handoff to match.
    renderCallback('id_token=someone-elses-token&handoff=made-up');

    await screen.findByText(/did not start in this tab/i);
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('keeps the tokens out of the address bar', async () => {
    const handoff = beginHandoff();
    renderCallback(`id_token=abc&handoff=${handoff}`);

    await waitFor(() => expect(signInWithIdToken).toHaveBeenCalled());
    expect(window.location.hash).toBe('');
  });

  it('explains a sign-in the backend gave up on', async () => {
    renderCallback('auth_error=cancelled');

    await screen.findByText('Sign-in was cancelled.');
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('reports a rejection from Supabase rather than pretending it worked', async () => {
    const handoff = beginHandoff();
    signInWithIdToken.mockResolvedValue({
      data: {},
      error: { message: 'Unacceptable audience in id_token' },
    } as unknown);
    renderCallback(`id_token=abc&handoff=${handoff}`);

    await screen.findByText('Unacceptable audience in id_token');
  });
});
