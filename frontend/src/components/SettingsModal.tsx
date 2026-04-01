import type { Settings } from '@/lib/schemas/settingsSchemas';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onResetScore: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetScore,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal flex-center" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <h2>Game Settings</h2>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <div className="setting-item flex flex-gap-md">
              <label className="flex flex-gap-sm">
                <span>AI Difficulty:</span>
                <select
                  className="bot-selector"
                  value={settings.difficulty}
                  onChange={(e) =>
                    onUpdateSettings({
                      difficulty: e.target.value as Settings['difficulty'],
                    })
                  }
                >
                  <option value="bot0">Easy (Bot 0)</option>
                  <option value="bot1">Medium (Bot 1)</option>
                  <option value="bot2">Hard (Bot 2)</option>
                </select>
              </label>
            </div>

            <div className="setting-item flex flex-gap-md">
              <label className="flex flex-gap-sm">
                <input
                  type="checkbox"
                  checked={settings.keyboardEnabled}
                  onChange={(e) => onUpdateSettings({ keyboardEnabled: e.target.checked })}
                />
                Enable Keyboard Controls (Arrow Keys &amp; WASD)
              </label>
            </div>

            <div className="setting-item flex flex-gap-md">
              <label className="flex flex-gap-sm">
                <input
                  type="checkbox"
                  checked={settings.clickMoveEnabled}
                  onChange={(e) => onUpdateSettings({ clickMoveEnabled: e.target.checked })}
                />
                Enable Click to Move
              </label>
            </div>

            <div className="setting-item flex flex-gap-md">
              <label className="flex flex-gap-sm">
                <input
                  type="checkbox"
                  checked={settings.aiDelayEnabled}
                  onChange={(e) => onUpdateSettings({ aiDelayEnabled: e.target.checked })}
                />
                AI Move Delay (1000ms)
              </label>
            </div>

            <div className="setting-item flex flex-gap-md">
              <label className="flex flex-gap-sm">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                />
                Enable Sound Effects
              </label>
            </div>

            <div className="setting-item flex flex-gap-md">
              <button
                className="btn action-btn"
                style={{ marginTop: '8px' }}
                onClick={onResetScore}
              >
                Reset Scoreboard
              </button>
            </div>

            <div className="setting-item flex flex-gap-md">
              <label htmlFor="volume-slider">Sound Volume:</label>
              <input
                type="range"
                id="volume-slider"
                min={0}
                max={100}
                value={Math.round(settings.volume * 100)}
                onChange={(e) =>
                  onUpdateSettings({ volume: Number(e.target.value) / 100 })
                }
              />
              <span id="volume-display">{Math.round(settings.volume * 100)}%</span>
            </div>
          </div>

          <div className="settings-controls flex-between">
            <button
              className="btn dev-btn"
              onClick={() => onUpdateSettings({ devMode: !settings.devMode })}
            >
              {settings.devMode ? 'Hide Stats' : 'Game Stats'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
