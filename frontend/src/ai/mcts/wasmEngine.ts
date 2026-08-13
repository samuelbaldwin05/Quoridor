import type { GameState } from '@/engine/gameTypes';
import { blendSpeed, budgetFor, MCTS_BUDGET } from './budget';
import type { EngineConfig, EngineDecision, WorkerRequest, WorkerResponse } from './mctsTypes';
import { decodeAction, toEngineState } from './stateMapping';

/**
 * Client-side MCTS, running the WASM engine in a worker.
 *
 * This is the fallback path: the server plays the tier by default so strength does not depend
 * on the player's hardware. It takes over when the server is unreachable, saturated, or does
 * not have the engine installed.
 *
 * Cancellation terminates the worker. A running C++ search cannot be interrupted from JS, and
 * leaving one to finish would keep a core busy for a move nobody is waiting for.
 */

const SPEED_STORAGE_KEY = 'quoridor.mcts.itersPerSecond';
const READY_TIMEOUT_MS = 8000;
// Slack over the engine's own cap, to cover module load and message round-trips.
const SEARCH_TIMEOUT_MS = MCTS_BUDGET.timeCapMs + 7000;

// Mirrors the backend's _engine_config() in app/ai/mcts_agent.py. Keep the two in step, or
// the tier plays differently depending on which source answered.
/** Single-threaded until the host sends COOP/COEP headers for SharedArrayBuffer. */
const WASM_THREADS = 1;

const ENGINE_CONFIG: EngineConfig = {
  threads: WASM_THREADS,
  usePruning: true,
  usePuct: true,
  fencePenalty: 0.062,
  // Progressive widening: without it the search only descends into fully expanded nodes, so
  // it pays a visit per candidate action before gaining any depth.
  pwK: 2,
  pwAlpha: 0.5,
};

/** null when this device has never been measured, which is what triggers a calibration run. */
function readStoredSpeed(): number | null {
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    const value = raw === null ? NaN : Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStoredSpeed(value: number): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(Math.round(value)));
  } catch {
    // Private browsing or a full quota. The in-memory estimate still applies.
  }
}

class WasmEngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private itersPerSecond: number | null = null;
  private unavailable = false;

  /** False when this browser cannot run the engine at all, so callers skip straight past it. */
  supported(): boolean {
    return !this.unavailable && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./mctsWorker.ts', import.meta.url), { type: 'module' });
    }
    return this.worker;
  }

  /** Drop the worker. The next search starts a fresh one and reloads the module. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private send<T extends WorkerResponse['kind']>(
    build: (id: number) => WorkerRequest,
    expect: T,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Extract<WorkerResponse, { kind: T }>> {
    const id = this.nextId++;
    const worker = this.ensureWorker();

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
        clearTimeout(timer);
      };

      const fail = (err: Error) => {
        cleanup();
        // The worker may be mid-search and unresponsive; a fresh one is the only way back.
        this.terminate();
        reject(err);
      };

      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        if (response.id !== id) return;
        if (response.kind === 'error') {
          cleanup();
          reject(new Error(response.message));
          return;
        }
        if (response.kind !== expect) {
          cleanup();
          reject(new Error(`unexpected worker response: ${response.kind}`));
          return;
        }
        cleanup();
        resolve(response as Extract<WorkerResponse, { kind: T }>);
      };

      const onError = (event: ErrorEvent) => fail(new Error(event.message || 'worker error'));
      const onAbort = () => fail(new Error('aborted'));
      const timer = setTimeout(() => fail(new Error('engine timed out')), timeoutMs);

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });

      worker.postMessage(build(id));
    });
  }

  /** Loads the module without searching, so availability is known before a turn starts. */
  async probe(signal?: AbortSignal): Promise<boolean> {
    if (!this.supported()) return false;
    try {
      await this.send((id) => ({ kind: 'ping', id }), 'ready', READY_TIMEOUT_MS, signal);
      return true;
    } catch {
      // A missing artifact is permanent for this session; stop paying the load cost.
      this.unavailable = true;
      return false;
    }
  }

  async chooseMove(state: GameState, signal?: AbortSignal): Promise<EngineDecision> {
    if (!this.supported()) throw new Error('WASM engine is not supported here');

    // The first search on an unmeasured device doubles as calibration: a short, cheap budget
    // whose move is still a real move, so nothing is thrown away. A device measured in an
    // earlier session skips straight to a full budget.
    const known = this.itersPerSecond ?? readStoredSpeed();
    const calibrating = known === null;
    const budget = calibrating
      ? {
          totalIterations: MCTS_BUDGET.calibrationIterations,
          maxIters: MCTS_BUDGET.calibrationIterations,
          timeMs: MCTS_BUDGET.timeCapMs,
        }
      : budgetFor(known);

    const result = await this.send(
      (id) => ({
        kind: 'search',
        id,
        state: toEngineState(state),
        config: { ...ENGINE_CONFIG, maxIters: budget.maxIters },
        timeMs: budget.timeMs,
      }),
      'result',
      SEARCH_TIMEOUT_MS,
      signal,
    );

    const blended = blendSpeed(known, result.iterations, result.elapsedMs);
    if (blended !== null) {
      this.itersPerSecond = blended;
      writeStoredSpeed(blended);
    }

    const move = decodeAction(result.action, state);
    if (!move) {
      throw new Error(`engine returned action ${result.action}, which is not playable here`);
    }

    return {
      move,
      stats: {
        source: 'wasm',
        iterations: result.iterations,
        elapsedMs: result.elapsedMs,
        targetIterations: budget.totalIterations,
        threads: WASM_THREADS,
        cached: false,
        engineCommit: 'wasm',
      },
    };
  }

  /** Test-only: forget the measured speed and any loaded worker. */
  resetForTests(): void {
    this.terminate();
    this.itersPerSecond = null;
    this.unavailable = false;
  }
}

export const wasmEngine = new WasmEngineClient();
