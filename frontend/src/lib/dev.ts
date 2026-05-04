import { config } from './config';

const DEV_TOKEN_KEY = 'quoridor-dev-token';
const DEV_TOKEN_VALUE = 'dev-token';

export function getDevToken(): string | undefined {
  if (!config.development.bypassAuth) return undefined;
  return localStorage.getItem(DEV_TOKEN_KEY) ?? undefined;
}

export function setDevToken(): void {
  localStorage.setItem(DEV_TOKEN_KEY, DEV_TOKEN_VALUE);
}

export function clearDevToken(): void {
  localStorage.removeItem(DEV_TOKEN_KEY);
}
