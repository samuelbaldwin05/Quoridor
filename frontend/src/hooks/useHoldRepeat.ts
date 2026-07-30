import { useCallback, useEffect, useRef } from 'react';

// Pointer-event handlers that fire `callback` on press and repeat every repeatMs
// while held. callbackRef keeps the latest callback so the running interval never
// fires a stale closure; pointer (not click) events give touch + mouse parity.
export function useHoldRepeat(callback: () => void, repeatMs = 140) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    callbackRef.current();
    intervalRef.current = setInterval(() => callbackRef.current(), repeatMs);
  }, [repeatMs]);

  useEffect(() => stop, [stop]);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  } as const;
}
