// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { UsernameGuard } from '../UsernameGuard';

/**
 * This guard wraps every route except /login and /setup, so what it renders while auth resolves
 * is the entire app for that moment. It used to render null: a blank page for as long as the
 * profile request took, and forever if that request never settled. That was the bug.
 */

const useAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({ useAuth, AuthProvider: ({ children }: never) => children }));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <UsernameGuard>
              <p>the app</p>
            </UsernameGuard>
          }
        />
        <Route path="/setup" element={<p>pick a username</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UsernameGuard', () => {
  it('shows a loading state while auth resolves, not a blank page', () => {
    useAuth.mockReturnValue({ isLoading: true, needsUsername: false });
    const { container } = renderGuard();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Signing you in…')).toBeInTheDocument();
    expect(container.textContent).not.toBe('');
  });

  it('renders the page once auth has resolved', () => {
    useAuth.mockReturnValue({ isLoading: false, needsUsername: false });
    renderGuard();
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it('sends a user with no username to setup', () => {
    useAuth.mockReturnValue({ isLoading: false, needsUsername: true });
    renderGuard();
    expect(screen.getByText('pick a username')).toBeInTheDocument();
  });

  it('does not redirect to setup before auth has resolved', () => {
    // needsUsername is false until the profile arrives, so redirecting while loading would send
    // every signed-in user through /setup on every load.
    useAuth.mockReturnValue({ isLoading: true, needsUsername: true });
    renderGuard();
    expect(screen.queryByText('pick a username')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
