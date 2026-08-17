import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Guards a deploy-critical file that nothing else covers.
 *
 * Azure Static Web Apps serves whatever is in `dist`, and without a navigation fallback a
 * request for a client-side route (`/leaderboard`, `/history/<id>`) is a request for a file
 * that does not exist, which returns Azure's own 404 page. That is what a phone hits when it
 * reloads a page it had been left on. Vite copies `public/` verbatim, so this file lives
 * there to reach `dist`; delete it and the app deep-links to a 404 again, with nothing
 * failing until it is deployed.
 */
const configPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../public/staticwebapp.config.json',
);

interface SwaConfig {
  navigationFallback?: { rewrite?: string; exclude?: string[] };
  mimeTypes?: Record<string, string>;
}

describe('staticwebapp.config.json', () => {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as SwaConfig;

  it('falls back to the SPA entry point for unknown routes', () => {
    expect(config.navigationFallback?.rewrite).toBe('/index.html');
  });

  it('leaves real files to 404 on their own', () => {
    // A missing bundle answering with index.html is worse than a 404: the browser gets HTML
    // where it expected JavaScript, and the failure reads as a parse error.
    const exclude = config.navigationFallback?.exclude ?? [];
    expect(exclude).toContain('/assets/*');
    expect(exclude.some((pattern) => pattern.includes('css') && pattern.includes('js'))).toBe(true);
  });

  it('serves wasm with a type the browser will stream', () => {
    // WebAssembly.instantiateStreaming rejects anything that is not application/wasm, and
    // the browser engine tier loads that way.
    expect(config.mimeTypes?.['.wasm']).toBe('application/wasm');
  });
});
