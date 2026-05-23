import { useCallback } from 'react';

const SOUND_SOURCES = {
  move: '/sounds/click.mp3',
  wall: '/sounds/clack.mp3',
  win: '/sounds/win.mp3',
  lose: '/sounds/lose.mp3',
  start: '/sounds/start.mp3',
} as const;

type SoundKey = keyof typeof SOUND_SOURCES;

let cache: Partial<Record<SoundKey, HTMLAudioElement>> | null = null;

function getCache(): Partial<Record<SoundKey, HTMLAudioElement>> {
  if (cache) return cache;
  if (typeof window === 'undefined') return {};
  const c: Partial<Record<SoundKey, HTMLAudioElement>> = {};
  (Object.keys(SOUND_SOURCES) as SoundKey[]).forEach((key) => {
    const audio = new Audio(SOUND_SOURCES[key]);
    audio.preload = 'auto';
    audio.load();
    c[key] = audio;
  });
  cache = c;
  return c;
}

export function useAudio(enabled: boolean, volume: number) {
  const playSound = useCallback(
    (key: SoundKey) => {
      if (!enabled) return;
      const audio = getCache()[key];
      if (!audio) return;
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.currentTime = 0;
      audio.play().catch(() => {});
    },
    [enabled, volume],
  );

  const playMove = useCallback(() => playSound('move'), [playSound]);
  const playWall = useCallback(() => playSound('wall'), [playSound]);
  const playWin = useCallback(() => playSound('win'), [playSound]);
  const playLose = useCallback(() => playSound('lose'), [playSound]);
  const playStart = useCallback(() => playSound('start'), [playSound]);

  return { playMove, playWall, playWin, playLose, playStart };
}
