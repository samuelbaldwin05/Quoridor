import { SettingsSchema, type Settings } from './schemas/settingsSchemas';

const STORAGE_KEY = 'quoridor-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SettingsSchema.parse({});
    const parsed = JSON.parse(raw) as unknown;
    const result = SettingsSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {
    // fall through to defaults
  }
  return SettingsSchema.parse({});
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Silently ignore storage errors
  }
}
