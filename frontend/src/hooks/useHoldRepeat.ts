import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns pointer-event handlers that fire `callback` immediately on press
 * and then repeatedly every `repeatMs` ms while held. Works on touch and mouse.
 */
export function useHoldRepeat(callback: () => void, repeatMs = 140) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

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
