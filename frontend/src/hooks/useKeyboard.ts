import { useEffect } from 'react';

export type KeyAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'diag-ul'
  | 'diag-ur'
  | 'diag-dl'
  | 'diag-dr';

// Arrow keys removed — WASD + diagonals only
const KEY_MAP: Record<string, KeyAction> = {
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  q: 'diag-ul',
  Q: 'diag-ul',
  e: 'diag-ur',
  E: 'diag-ur',
  z: 'diag-dl',
  Z: 'diag-dl',
  x: 'diag-dr',
  X: 'diag-dr',
};

export function useKeyboard(
  enabled: boolean,
  isHumanTurn: boolean,
  onAction: (action: KeyAction) => void,
): void {
  useEffect(() => {
    if (!enabled || !isHumanTurn) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.key];
      if (action) {
        e.preventDefault();
        onAction(action);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isHumanTurn, onAction]);
}
