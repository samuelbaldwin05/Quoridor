import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// api.ts builds an auth header before every request: the Supabase client needs configured env,
// and the dev-token check needs localStorage, neither of which exists in the node environment.
// The header is not what these tests are about.
const getSession = vi.hoisted(() => vi.fn(async () => ({ data: { session: null } })));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }));
vi.mock('@/lib/dev', () => ({ getDevToken: () => null }));

const { apiFetch, ApiTimeoutError, API_TIMEOUT_MS } = await import('../api');

/**
 * The timeout is the fix for a blank-screen bug, not a nicety: the auth provider only clears
 * `isLoading` when this promise settles, and the app rendered nothing while it was true. A
 * request that never settled left the app blank forever.
 */

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/**
 * A fetch that only ever settles by abort, which is what a black-holed connection to a cold
 * backend looks like from here. Rejects immediately when handed an already-aborted signal, the
 * way a real fetch does.
 */
function hangingFetch() {
  return vi.fn((_url: unknown, init?: RequestInit) => {
    const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (init?.signal?.aborted) return Promise.reject(abortError());
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(abortError()));
    });
  }) as unknown as typeof fetch;
}

describe('apiFetch timeout', () => {
  it('rejects a request that never settles, instead of hanging', async () => {
    globalThis.fetch = hangingFetch();

    const pending = apiFetch('/auth/me');
    const assertion = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS + 10);
    await assertion;
  });

  it('honours a caller-supplied timeout', async () => {
    globalThis.fetch = hangingFetch();

    const pending = apiFetch('/auth/me', { timeoutMs: 50 });
    const assertion = expect(pending).rejects.toThrow(/timed out after 50ms/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it('leaves a fast response alone', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    await expect(apiFetch<{ ok: boolean }>('/auth/me')).resolves.toEqual({ ok: true });
  });

  it('reports a caller abort as an abort, not as a timeout', async () => {
    // The distinction matters: a component unmounting mid-request is normal, a deadline is not.
    globalThis.fetch = hangingFetch();

    const controller = new AbortController();
    const pending = apiFetch('/auth/me', { signal: controller.signal });
    const assertion = expect(pending).rejects.not.toBeInstanceOf(ApiTimeoutError);
    controller.abort();
    await assertion;
  });

  it('still surfaces a non-ok status as an error', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('nope', { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(apiFetch('/auth/me')).rejects.toThrow(/API 500/);
  });

  it('does not leave the deadline armed after a response', async () => {
    // A stray timer that fires after the fact would abort an unrelated later request.
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    await apiFetch('/auth/me');
    expect(vi.getTimerCount()).toBe(0);
  });
});
