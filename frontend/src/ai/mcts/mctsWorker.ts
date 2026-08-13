/// <reference lib="webworker" />

/**
 * Runs the WASM MCTS search off the main thread.
 *
 * The search is a synchronous C++ loop, so it cannot be interrupted once started: the client
 * cancels by terminating the worker. That is also why this file holds no state worth keeping,
 * beyond the loaded engine instance.
 *
 * The engine is loaded at runtime from `/engine/engine.js` rather than imported, so the app
 * builds and deploys whether or not the artifacts are present. A missing engine surfaces as
 * an error message here, which the caller turns into a fallback to another source. Build the
 * artifacts with `make -f Makefile.wasm app-update` in the QuoridorMCTS repo.
 */

import type { EngineConfig, EngineStateWire, WorkerRequest, WorkerResponse } from './mctsTypes';

const ENGINE_DIR = '/engine';

interface WasmSearchResult {
  action: number;
  iterations: number;
  elapsedMs: number;
}

interface WasmEngine {
  setConfig(config: Record<string, number | boolean>): string[];
  search(state: EngineStateWire, timeMs: number): WasmSearchResult;
  reset(): void;
}

interface WasmModule {
  MctsEngine: new () => WasmEngine;
}

type EngineFactory = (options?: { locateFile?: (path: string) => string }) => Promise<WasmModule>;

let enginePromise: Promise<WasmEngine> | null = null;

async function loadEngine(): Promise<WasmEngine> {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const url = `${ENGINE_DIR}/engine.js`;
    const module = (await import(/* @vite-ignore */ url)) as { default?: EngineFactory };
    const factory = module.default;
    if (typeof factory !== 'function') {
      throw new Error('engine.js did not export a module factory');
    }
    const runtime = await factory({ locateFile: (path) => `${ENGINE_DIR}/${path}` });
    return new runtime.MctsEngine();
  })();

  try {
    return await enginePromise;
  } catch (err) {
    enginePromise = null; // let a later attempt retry rather than caching the failure
    throw err;
  }
}

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

// setConfig returns the keys it did not recognize. A typo silently leaving a knob at its
// default is exactly the kind of "configuration nobody measured" worth failing loudly on.
function applyConfig(engine: WasmEngine, config: EngineConfig): void {
  const unknown = engine.setConfig(config as Record<string, number | boolean>);
  if (unknown.length > 0) {
    throw new Error(`engine rejected config keys: ${unknown.join(', ')}`);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const engine = await loadEngine();

    if (request.kind === 'ping') {
      post({ kind: 'ready', id: request.id });
      return;
    }

    applyConfig(engine, request.config);
    const result = engine.search(request.state, request.timeMs);
    post({
      kind: 'result',
      id: request.id,
      action: result.action,
      iterations: result.iterations,
      elapsedMs: result.elapsedMs,
    });
  } catch (err) {
    post({
      kind: 'error',
      id: request.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
