// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

/**
 * Without a boundary, an uncaught render error unmounts the whole app and the only symptom is a
 * blank page, which is indistinguishable from a hung load. These pin that a throw produces
 * something readable and still records the error for whoever has to diagnose it.
 */

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  // React logs the caught error itself; keep the test output legible.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows a fallback instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('includes the error message, since the person hitting it is usually the reporter', () => {
    render(
      <ErrorBoundary>
        <Boom message="cannot read properties of undefined" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('cannot read properties of undefined')).toBeInTheDocument();
  });

  it('still logs the error, so the component stack is not lost', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.flat();
    expect(logged.some((arg) => String(arg).includes('Unhandled render error'))).toBe(true);
  });
});
