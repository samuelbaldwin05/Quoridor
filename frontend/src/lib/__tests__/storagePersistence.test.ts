// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '@/lib/storagePersistence';

const original = navigator.storage;

function setStorageManager(value: unknown) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value });
}

afterEach(() => {
  setStorageManager(original);
});

describe('requestPersistentStorage', () => {
  it('asks for persistence when the browser supports it', async () => {
    const persist = vi.fn(async () => true);
    setStorageManager({ persist, persisted: vi.fn(async () => false) });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalled();
  });

  it('does not ask again when it is already granted', async () => {
    const persist = vi.fn(async () => true);
    setStorageManager({ persist, persisted: vi.fn(async () => true) });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports false where the API is missing, which is Safari', async () => {
    setStorageManager(undefined);
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('swallows a browser that throws, since nothing here is load-bearing', async () => {
    setStorageManager({
      persist: () => {
        throw new Error('nope');
      },
      persisted: async () => false,
    });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});
