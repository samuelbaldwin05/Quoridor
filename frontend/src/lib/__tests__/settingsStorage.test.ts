// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { loadSettings, saveSettings } from '../settingsStorage';
import { SettingsSchema } from '../schemas/settingsSchemas';

const STORAGE_KEY = 'quoridor-settings';
const DEFAULTS = SettingsSchema.parse({});

beforeEach(() => {
  localStorage.clear();
});

describe('loadSettings', () => {
  it('returns schema defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  it('returns schema defaults when the stored value is malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{ not valid json');
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  it('falls back to defaults when stored data fails schema validation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: 99, difficulty: 'nope' }));
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  it('round-trips a valid saved settings object', () => {
    const custom = { ...DEFAULTS, volume: 0.25, soundEnabled: false, difficulty: 'bot0' as const };
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
  });

  it('merges partial stored data with defaults for missing keys', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: 0.1 }));
    const loaded = loadSettings();
    expect(loaded.volume).toBe(0.1);
    expect(loaded.difficulty).toBe(DEFAULTS.difficulty);
  });
});
