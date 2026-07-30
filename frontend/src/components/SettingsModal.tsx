import { useState } from 'react';
import type { Settings } from '@/lib/schemas/settingsSchemas';

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

// Note: devMode (game stats overlay) is kept in Settings but has no UI toggle here.
// To enable: open browser console and run:
//   localStorage.setItem('quoridor_settings', JSON.stringify({...JSON.parse(localStorage.getItem('quoridor_settings')||'{}'), devMode: true}))

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onResetScore?: () => void;
  /** Hide AI delay + keyboard-move settings that only apply to offline games. */
  showOfflineSettings?: boolean;
  /** Session-scoped: when true, placing a wall requires a second click to confirm. */
  confirmWallPlacement?: boolean;
  onConfirmWallPlacementChange?: (value: boolean) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  showOfflineSettings = true,
  confirmWallPlacement,
  onConfirmWallPlacementChange,
}: SettingsModalProps) {
  const [touch] = useState(isTouchDevice);
  if (!isOpen) return null;

  return (
    <div className="modal flex-center" onClick={onClose}>
      <div className="modal-content settings-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <span className="settings-modal-title">Settings</span>
          <button className="close-btn settings-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="settings-modal-body">
          <label className="settings-row">
            <input
              type="checkbox"
              checked={settings.keyboardEnabled}
              onChange={(e) => onUpdateSettings({ keyboardEnabled: e.target.checked })}
            />
            <span>Keyboard Controls (WASD)</span>
          </label>

          {showOfflineSettings && (
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.aiDelayEnabled}
                onChange={(e) => onUpdateSettings({ aiDelayEnabled: e.target.checked })}
              />
              <span>AI Move Delay</span>
            </label>
          )}

          <label className="settings-row">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
            />
            <span>Sound Effects</span>
          </label>

          {onConfirmWallPlacementChange && touch && (
            <label className="settings-row">
              <input
                type="checkbox"
                checked={!!confirmWallPlacement}
                onChange={(e) => onConfirmWallPlacementChange(e.target.checked)}
              />
              <span>Double-tap to Place Fence</span>
            </label>
          )}

          <label className="settings-row settings-row-volume">
            <span className="settings-volume-label">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => onUpdateSettings({ volume: Number(e.target.value) / 100 })}
            />
            <span className="settings-volume-val">{Math.round(settings.volume * 100)}%</span>
          </label>
        </div>
      </div>
    </div>
  );
}
