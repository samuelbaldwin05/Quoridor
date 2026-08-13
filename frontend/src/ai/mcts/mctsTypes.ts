import type { Move } from '@/engine/gameTypes';

/** Where a search ran. Shown in dev stats so a silent fallback is visible. */
export type EngineSource = 'server' | 'wasm' | 'fallback';

export interface EngineStats {
  readonly source: EngineSource;
  readonly iterations: number;
  readonly elapsedMs: number;
  readonly targetIterations: number;
  readonly threads: number;
  readonly cached: boolean;
  readonly engineCommit: string;
}

export interface EngineDecision {
  readonly move: Move;
  readonly stats: EngineStats;
}

/**
 * The engine's own view of a position. p1 is engine player 0, which runs to row 8 and moves
 * first; p2 is engine player 1, which runs to row 0. See stateMapping for the translation.
 */
export interface EngineStateWire {
  readonly p1Row: number;
  readonly p1Col: number;
  readonly p2Row: number;
  readonly p2Col: number;
  readonly p1Walls: number;
  readonly p2Walls: number;
  readonly turn: 0 | 1;
  readonly hWalls: Uint8Array;
  readonly vWalls: Uint8Array;
}

/**
 * Config knobs, camelCase names of the C++ MCTSConfig members (see
 * include/util/config_named.hpp in the engine repo for the full set and what each does).
 * The engine reports any key it does not recognize, and the worker treats that as an error.
 */
export interface EngineConfig {
  readonly threads?: number;
  readonly usePruning?: boolean;
  readonly usePuct?: boolean;
  readonly fencePenalty?: number;
  readonly maxIters?: number;
  readonly seed?: number;
  readonly winSpeed?: number;
  readonly epsilon?: number;
  readonly ucbC?: number;
  /** Progressive widening. pwK 0 disables it. */
  readonly pwK?: number;
  readonly pwAlpha?: number;
  /** -1 full rollout, 0 static eval, N truncates the playout at N plies. */
  readonly evalDepth?: number;
  readonly raceEval?: boolean;
  readonly raceRoot?: boolean;
  readonly solver?: boolean;
  readonly reuseTree?: boolean;
  readonly rolloutWalls?: number;
  readonly rolloutWallGain?: number;
  readonly rolloutNoBackstep?: boolean;
  readonly fenceCands?: number;
}

export interface WorkerSearchRequest {
  readonly kind: 'search';
  readonly id: number;
  readonly state: EngineStateWire;
  readonly config: EngineConfig;
  readonly timeMs: number;
}

export type WorkerRequest = WorkerSearchRequest | { readonly kind: 'ping'; readonly id: number };

export type WorkerResponse =
  | {
      readonly kind: 'result';
      readonly id: number;
      readonly action: number;
      readonly iterations: number;
      readonly elapsedMs: number;
    }
  | { readonly kind: 'ready'; readonly id: number }
  | { readonly kind: 'error'; readonly id: number; readonly message: string };
