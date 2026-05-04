import { useRef, useCallback } from 'react';

export function useAudio(enabled: boolean, volume: number) {
  const moveAudio = useRef<HTMLAudioElement | null>(null);
  const wallAudio = useRef<HTMLAudioElement | null>(null);
  const winAudio = useRef<HTMLAudioElement | null>(null);
  const loseAudio = useRef<HTMLAudioElement | null>(null);
  const startAudio = useRef<HTMLAudioElement | null>(null);

  const getOrCreate = (
    ref: React.MutableRefObject<HTMLAudioElement | null>,
    src: string,
  ): HTMLAudioElement => {
    if (!ref.current) {
      ref.current = new Audio(src);
    }
    return ref.current;
  };

  const playSound = useCallback(
    (ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) => {
      if (!enabled) return;
      const audio = getOrCreate(ref, src);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay errors
      });
    },
    [enabled, volume],
  );

  const playMove = useCallback(() => playSound(moveAudio, '/sounds/click.mp3'), [playSound]);

  const playWall = useCallback(() => playSound(wallAudio, '/sounds/clack.mp3'), [playSound]);

  const playWin = useCallback(() => playSound(winAudio, '/sounds/win.mp3'), [playSound]);

  const playLose = useCallback(() => playSound(loseAudio, '/sounds/lose.mp3'), [playSound]);

  const playStart = useCallback(() => playSound(startAudio, '/sounds/start.mp3'), [playSound]);

  return { playMove, playWall, playWin, playLose, playStart };
}
