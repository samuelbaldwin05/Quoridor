import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vite loads .env locally; CI runs the suite with no environment at all. lib/supabase.ts
// builds its client at import time and throws "supabaseUrl is required" without these, so a
// test fails on an import it never meant to reach: PlayPanel pulls in MatchmakingModal, which
// pulls in lib/api, which pulls in the client. Filled in only when absent, so a real .env
// still wins. Mirrors the setdefault in backend/tests/conftest.py.
const ENV_DEFAULTS: Record<string, string> = {
  VITE_SUPABASE_URL: 'http://localhost:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
};
for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (!import.meta.env[key]) vi.stubEnv(key, value);
}

// Unmount React trees between tests (no globals:true, so RTL won't auto-register this).
afterEach(() => {
  cleanup();
});
