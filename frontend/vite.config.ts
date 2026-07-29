import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    // Default to the fast node environment; component/DOM tests opt into jsdom
    // per-file with a `// @vitest-environment jsdom` docblock so the pure engine
    // suite isn't slowed by jsdom startup.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
  server: {
    host: '0.0.0.0', // needed for Docker — accept connections from outside the container
    port: 5173,
    watch: {
      usePolling: true, // needed for hot-reload inside Docker on Windows/Mac
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
});
