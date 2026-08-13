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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeader = await getAuthHeader();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (authHeader) headers['Authorization'] = authHeader;

  const res = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  // 204 / empty bodies (e.g. DELETE endpoints) have no JSON to parse.
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
