import { useEffect } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right';

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

export function useKeyboard(
  enabled: boolean,
  isHumanTurn: boolean,
  onMove: (dir: Direction) => void,
): void {
  useEffect(() => {
    if (!enabled || !isHumanTurn) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key];
      if (dir) {
        e.preventDefault();
        onMove(dir);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isHumanTurn, onMove]);
}
