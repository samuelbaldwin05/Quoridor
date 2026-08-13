/**
 * Search budget arithmetic, shared by the client-side engine paths.
 *
 * Strength is budgeted in iterations rather than milliseconds. Iterations per second swing by
 * roughly tenfold between the opening and a decided endgame (measured: about 2.5k/s early and
 * 28k/s once the race is settled, single-threaded native), so a fixed time budget over-searches
 * positions that no longer matter and under-searches the ones that decide the game.
 *
 * Wall clock still has to be bounded, because nobody wants to wait on a phone. The engine
 * ignores its deadline once an iteration cap is set, so the cap itself is trimmed here using a
 * measured speed rather than relying on the engine to stop.
 */

export const MCTS_BUDGET = {
  /** Total iterations to aim for, matching the backend's mcts_target_iterations default. */
  targetIterations: 8000,
  /** Floor for a slow device: below this the search is too weak to be worth the wait. */
  minIterations: 800,
  /** Hard ceiling on one move. The first second overlaps the existing AI move delay. */
  timeCapMs: 2500,
  /** Assumed iterations per second before this device has been measured. */
  initialItersPerSecond: 2000,
  /** Iterations used by the calibration search. Its move is a real move, not thrown away. */
  calibrationIterations: 300,
} as const;

export interface Budget {
  /** Iterations the search should complete in total. */
  readonly totalIterations: number;
  /** Per-worker cap. Single-threaded in the browser today, so the two are equal. */
  readonly maxIters: number;
  /** Wall-clock ceiling handed to the engine, as a backstop. */
  readonly timeMs: number;
}

export function budgetFor(itersPerSecond: number, threads = 1): Budget {
  const affordable = itersPerSecond * (MCTS_BUDGET.timeCapMs / 1000);
  const total = Math.round(
    Math.max(MCTS_BUDGET.minIterations, Math.min(MCTS_BUDGET.targetIterations, affordable)),
  );
  return {
    totalIterations: total,
    maxIters: Math.max(1, Math.ceil(total / Math.max(1, threads))),
    timeMs: MCTS_BUDGET.timeCapMs,
  };
}

/** Iterations per second implied by one search, or null if the search was degenerate. */
export function sampleSpeed(iterations: number, elapsedMs: number): number | null {
  if (iterations <= 0 || elapsedMs <= 0) return null;
  return (iterations * 1000) / elapsedMs;
}

/**
 * Heavily smoothed, because per-move speed varies far more than device speed does. The
 * estimate only needs to catch sustained slowness.
 *
 * Pass `previous` as null for the first measurement so the sample is taken as-is: blending it
 * with a hardcoded guess would carry that guess into every later budget.
 */
export function blendSpeed(
  previous: number | null,
  iterations: number,
  elapsedMs: number,
): number | null {
  const sample = sampleSpeed(iterations, elapsedMs);
  if (sample === null) return previous;
  if (previous === null) return sample;
  return 0.8 * previous + 0.2 * sample;
}
