---
title: MCTS Integration
covers:
  - backend/app/ai/mcts_agent.py
  - frontend/src/ai/mcts
reviewed_at: 41812a9
---

# MCTS Integration

How the C++ MCTS engine from the QuoridorMCTS repo reaches players, as the Insane bot tier.
Rationale for the shape of it is in [DECISIONS.md](DECISIONS.md); the layering summary is in
[ARCHITECTURE.md](ARCHITECTURE.md); what is still open is in [BACKLOG.md](BACKLOG.md).

Status: implemented end to end and tested, but not yet live. Two things have to happen before
a player sees a real MCTS move: the engine submodule has to be added so the backend image
builds the wheel, and the WASM artifacts have to be built for the browser fallback. Until
then the tier is selectable and plays, falling back to bot2.

## The pieces

Engine repo (QuoridorMCTS):

- `include/util/config_named.hpp`: one table of every `MCTSConfig` member, driving both
  binding layers. A `static_assert` on `sizeof(MCTSConfig)` breaks the build if a member is
  added without being registered.
- `include/quoridor/external_state.hpp`: builds a `QuoridorState` from untrusted external
  fields, with the clamping shared by both bindings.
- `src/web/bindings.cpp`: Embind. Now exposes every config field, holds the engine across
  calls (so `reuse_tree` is reachable at all), returns iterations and elapsed time with the
  action, and reports config keys it did not recognize.
- `src/python/bindings.cpp` plus `setup.py`: the `quoridor_mcts` extension module. Releases
  the GIL around the search, so FastAPI can run it under `asyncio.to_thread`. Accepts wall
  grids as bytes, bytearray, memoryview or a list of ints.
- `Makefile.wasm`: `app-update` now ships the single-thread build plus an
  `engine-version.json` stamp into `frontend/public/engine/`. `app-update-mt` adds the
  multi-thread build, which needs COOP/COEP on the host.

Backend:

- `app/ai/mcts_agent.py`: state mapping, action decoding, the search pool, the speed
  calibration and the move cache.
- `app/schemas/ai.py`: `engine: "extreme" | "mcts"` on the request, an optional `stats` block
  on the response, and `EngineStatusResponse` for `GET /api/ai/engines`.
- `app/core/exceptions.py`: `EngineBusyError` and `EngineUnavailableError`, both mapped to 503
  with `Retry-After` in `api/main.py`.
- `Dockerfile`: two stages, the first compiling the wheel from `vendor/quoridor-mcts`. The
  engine is optional; without it the API boots and the tier reports itself unavailable.

Frontend:

- `src/ai/mcts/stateMapping.ts`: the pure translation, no WASM involved, fully unit-tested.
- `src/ai/mcts/budget.ts`: iteration budget arithmetic and the speed estimator.
- `src/ai/mcts/mctsWorker.ts` and `wasmEngine.ts`: the worker and its client.
- `src/ai/mcts/serverEngine.ts` and `engineSource.ts`: the backend call and the fallback
  ladder.
- Tier wiring: `aiTypes.ts`, `aiCoordinator.ts`, `settingsSchemas.ts`, `PlayPanel.tsx`,
  `GameCard.tsx`, `gameReducer.ts`, and `DevStats.tsx` for the per-move search readout.
- `hooks/useAi.ts`: the search now overlaps the artificial move delay instead of stacking with
  it, so a 1.5s search feels like 1.5s rather than 2.5s.

Database: migration `018_mcts_difficulty.sql` extends the `games.ai_difficulty` CHECK, which
011 wrote as an inline list of the four levels that existed then. Without it every finished
game against the tier fails to sync.

## Who can use it

The tier is members-only, so the ladder is Easy, Medium, Hard, Extreme, and Extreme carries a
lock for guests. `engine: "mcts"` without a valid bearer token is a 403, which `serverEngine`
treats the same way it treats 429, 503 and a network failure: drop a rung. See DECISIONS for
why only this engine is gated, and INFRASTRUCTURE for what a move actually costs.

## The two invariants worth staring at

**Player mapping.** The engine's p1 is internal player 0, hardcoded by its constructor to
start on row 0 and run to row 8, and it moves first. This app's player 0 starts on row 8 and
runs to row 0. Goal rows are not transmitted across the boundary, so the mapping keys on
`goal_row` (`_to_engine_state`, `toEngineState`) rather than on list position, which also
means a payload that lists the two players in the other order still maps correctly. Reverse
it and the bot races toward the wrong edge and computes every distance backwards, while still
returning legal moves. That is why there is a test asserting the direction of travel and not
just legality.

Wall geometry needs no translation at all. App `Wall{row, col, 'h'}` is engine
`h_walls[row][col]`: same 0 through 7 anchor, same two-cell span, same blocking rule
(`wallUtils.wallBlocksMovement` against `QuoridorState::blocked`), and the same placement
legality (`isValidWallPlacement` against `try_fence_paths`: duplicate, collinear overlap,
shared post, and both players keeping a path). Pawn jumps agree too: straight jump first, then
perpendicular diagonals only, never back onto the mover's own square.

**Action decoding.** Indices 0 through 7 are directions, not destinations, so a jump over the
opponent shares an index with the single step in that direction. Both callers resolve an index
by scanning their own legal moves for one whose row and column deltas have matching signs, and
both refuse anything their own engine calls illegal. Indices 8 through 71 are horizontal walls,
72 through 135 vertical, 136 is pass, and -1 means the position is already finished. Two legal
destinations can never share a sign pair without being the same square, so the decode is
unambiguous.

## Think time

Measured with the engine repo's own `main_sim`, native `-O3`, one thread, pruning and PUCT on,
`fence_penalty` 0.062, at 500ms per move:

```
opening and midgame:  1,250 to 2,250 iterations per 500 ms   (~2.5k to 4.5k iters/sec)
endgame:             14,209 iterations per 500 ms            (~28k iters/sec)
```

Iterations per second swing tenfold inside one game, because rollouts shorten once the race
resolves. So the tier's strength is defined by an iteration count and wall clock is only a
ceiling. The knobs:

| Setting | Default | Meaning |
| --- | --- | --- |
| `mcts_target_iterations` | 8000 | total iterations per move, summed across workers |
| `mcts_min_iterations` | 800 | floor when the box cannot reach the target in time |
| `mcts_time_cap_ms` | 3000 | wall-clock ceiling the iteration budget is trimmed to fit |
| `mcts_calibration_iterations` | 500 | budget for the first search of a process |
| `mcts_threads` | 0 (auto) | root parallelization width, `min(cores, 4)` when auto |
| `mcts_max_concurrent` | 0 (auto) | concurrent searches, `cores / threads` when auto |
| `mcts_queue_timeout_s` | 1.5 | wait for a search slot before shedding with 503 |
| `mcts_fence_penalty` | 0.062 | tuned in the engine repo for a 500ms-class budget |
| `mcts_pw_k` / `mcts_pw_alpha` | 2.0 / 0.5 | progressive widening; 0 disables it |
| `mcts_cache_size` | 512 | positions remembered; openings repeat across users |

Every `MCTSConfig` member is settable at runtime from both bindings, so retuning never means
rebuilding: the backend reads the table above from env vars, and the browser reads
`ENGINE_CONFIG` in `wasmEngine.ts`. Note that `search(state, timeMs)`'s deadline is ignored
whenever `maxIters > 0`, which both callers set, so a purely time-based search needs
`maxIters: 0`. There is no depth limit to set; tree depth is a function of iterations, and the
nearest levers are `evalDepth` (rollout truncation) and progressive widening.

The browser mirrors these in `frontend/src/ai/mcts/budget.ts`, with a lower time cap (2500ms)
because the first second overlaps the existing move delay.

Two details that matter. The engine ignores its deadline once `max_iters` is set, so the cap is
sized from a measured iterations-per-second rather than left to the engine. And because nothing
is known about a box until it has searched once, the first search of a process runs the
calibration budget; its move is real and used, but it is not cached, so a cheap early answer
cannot be served for the life of the process.

8000 is a placeholder. The engine repo's `main_sim` accepts `--max-iters` and `--seed`, so the
right number comes from a strength-versus-iterations sweep against HeuristicBot, taking the
knee of the curve. For reference, the tuned results in the engine's NOTES.md (70% at 500ms
across 12 threads, 90% at 2000ms) are roughly 21,000 and 84,000 total iterations, which is
several seconds of single-threaded search. Thread count, not patience, is what buys strength
here.

## Verification

Done and passing:

- Engine headers: a compiled self-check confirms all 20 config fields are reachable by name
  and round-trip, the drift guard fires correctly, out-of-range external input is clamped, and
  a pawn already on its goal row reads as finished.
- Python extension: built with g++ and exercised directly. Config typos are reported, wall
  grids accept bytes and lists and reject wrong lengths, a fixed `seed` plus `max_iters` is
  reproducible, a finished position returns -1, and the engine's p1 moves toward row 8.
- Backend: `pytest` green at 365 tests, 37 of them new (the agent, the service dispatch, and
  the route's 503 mapping). The engine-backed subset runs when the extension is installed and
  skips cleanly when it is not, so CI stays green until the submodule lands. Ruff clean.
- Frontend: `tsc -b` clean, eslint clean, prettier clean. 35 new tests covering the mapping,
  the action decoder, the budget arithmetic, the fallback ladder and the delay overlap.
- The native engine build (`make`) still succeeds with the new binding sources excluded.

- The WASM build. Two blockers had to be fixed first, both of which meant the target had
  never compiled: `-fno-exceptions` against the two throwing entry points in `state.cpp` (now
  gated on `__cpp_exceptions`, falling back to `abort()`, so the native build is unchanged),
  and `Makefile.wasm` driving the link through `emcc`, the C driver, which links without the
  C++ runtime (now `em++`). The artifacts are 49 KB of JS and 60 KB of wasm.
- The WASM engine at runtime, driven through Embind on a node-enabled build of the same
  sources: the exact config the app sends is accepted (including `pwK`/`pwAlpha`), a typo comes
  back as an unknown key, the search returns a usable `{action, iterations, elapsedMs}`, wall
  grids cross the boundary, and a finished position reports -1. Roughly 10k iterations/sec
  single-threaded, so the browser fallback reaches the full target inside its time cap.
- The production frontend build, which emits the worker as its own chunk.

Not verified:

- The two-stage Docker build. The local Docker daemon was not responsive, so the wheel has
  only been built directly, not through the image.
- The browser path end to end. The Embind contract and the worker's bundling are both
  checked, but nothing has driven an actual `new Worker` in a real page.
- Anything on the Container App: no measurement on production hardware.
