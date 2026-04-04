import { config } from './config';
import { getDevToken } from './dev';
import { supabase } from './supabase';

async function getAuthHeader(): Promise<string | null> {
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
  return res.json() as Promise<T>;
}
