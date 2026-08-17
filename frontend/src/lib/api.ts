import { config } from './config';
import { getDevToken } from './dev';
import { supabase } from './supabase';

/**
 * The bearer header for the current session, or null for a guest. Exported because a couple of
 * callers need it without the rest of apiFetch: `/api/ai/move` reads Retry-After off a 503 and
 * so cannot use apiFetch, but still has to identify itself for the members-only engine.
 */
export async function getAuthHeader(): Promise<string | null> {
  const devToken = getDevToken();
  if (devToken) return `Bearer ${devToken}`;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : null;
}

/**
 * Every request gets a deadline. An unbounded fetch is not just slow, it strands whatever is
 * waiting on it: the auth provider only clears `isLoading` in this promise's `finally`, so a
 * request that never settles used to leave the app rendering nothing at all. A cold backend
 * scaled to zero is exactly that case.
 *
 * Generous rather than tight, since it is a backstop and not a latency budget. Callers that
 * expect to be slow can raise it; nothing should turn it off.
 */
export const API_TIMEOUT_MS = 15000;

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * A non-2xx response. Carries the status so callers can tell a request worth retrying (the
 * backend was asleep, the network blinked) from one that will fail identically forever (the
 * server rejected the payload). The message keeps its original `API <status>: <body>` shape.
 */
export class ApiHttpError extends Error {
  // Declared and assigned rather than taken as constructor parameter properties: the
  // build runs with erasableSyntaxOnly, which rules that shorthand out.
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiHttpError';
    this.status = status;
    this.body = body;
  }

  /** 5xx and 429 are the server's problem or a queue, so the same request may yet land. */
  get isTransient(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

export class ApiTimeoutError extends Error {
  constructor(path: string, timeoutMs: number) {
    super(`API ${path} timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}

export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const { timeoutMs = API_TIMEOUT_MS, ...requestInit } = init ?? {};
  const authHeader = await getAuthHeader();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(requestInit.headers as Record<string, string> | undefined),
  };
  if (authHeader) headers['Authorization'] = authHeader;

  // A caller's own signal still wins; this only adds the deadline on top of it.
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const callerSignal = requestInit.signal;
  const onCallerAbort = () => timeoutController.abort();
  // Check before subscribing: a signal that was already aborted will never emit the event, and
  // attaching alone would let the request run on regardless of it.
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      ...requestInit,
      headers,
      signal: timeoutController.signal,
    });
  } catch (err) {
    // Distinguish our deadline from a caller cancelling, so a timeout is reported as one.
    if (timeoutController.signal.aborted && callerSignal?.aborted !== true) {
      throw new ApiTimeoutError(path, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiHttpError(res.status, text);
  }
  // 204 / empty bodies (e.g. DELETE endpoints) have no JSON to parse.
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
