import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests (no globals:true, so RTL won't auto-register this).
afterEach(() => {
  cleanup();
});
