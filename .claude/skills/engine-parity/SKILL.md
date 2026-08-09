---
name: engine-parity
description: Use whenever a change touches Quoridor rules, move validation, jump or diagonal-jump logic, wall placement or path-blocking, pathfinding, or notation parsing. Applies to edits in frontend/src/engine/ or backend/app/engine/, or to tests/fixtures/engine_cases.json.
---

# Engine parity

The frontend TypeScript engine and the backend Python engine must produce identical results for identical inputs. A divergence between them is a release blocker, not a bug to triage later, because the backend Python engine is what actually decides move legality and game outcomes for every online game (see the multiplayer authority model in `docs/ARCHITECTURE.md`). `frontend/src/engine/notation.ts` even says so in its own header comment: "kept in lockstep with backend/app/engine/notation.py."

## When to use this

Any time you are about to change, or have just changed, one of these six paired modules:

| Frontend (`frontend/src/engine/`) | Backend (`backend/app/engine/`) |
|---|---|
| `constants.ts` | `constants.py` |
| `gameTypes.ts` | `game_types.py` |
| `notation.ts` | `notation.py` |
| `wallUtils.ts` | `wall_utils.py` |
| `moveValidation.ts` | `move_validation.py` |
| `gameEngine.ts` | `game_engine.py` |

Two files exist on only one side and are not paired: `frontend/src/engine/moveDisplay.ts` is a UI-only helper (move glyphs, replay-to-index for the move-list scrubber) with no rules content, and `backend/app/engine/replay.py` is backend-only (it replays a stored move history and validates a claimed winner; used by `game_service.record_game_result`, called from `submit_game_result`). Neither needs a mirror on the other side. Do not "fix" that asymmetry.

One naming asymmetry that is not a bug: the backend has an explicit `start_game()` that flips a fresh state's status to `"playing"`. The frontend has no equivalent function; it sets `status: 'playing'` inline wherever a game starts (for example `frontend/src/hooks/gameReducer.ts`, and the `startedGame()` helpers in the engine test files). Same behavior, no shared function on the TS side. Don't invent a `startGame` export just to mirror the name.

## The invariant, concretely

Both sides expose matched function pairs that must agree on every input, for example:

- `getValidPawnMoves` (TS) / `get_valid_pawn_moves` (Python), including straight jumps and the diagonal-jump fallback when the straight jump is blocked.
- `isValidWallPlacement` (TS) / `is_valid_wall_placement` (Python): duplicate check, post-overlap check, intersection check, then a BFS path check (`hasPathToGoal` / `has_path_to_goal`) for both players with the candidate wall added.
- `parseMove` / `parse_move` and `serializeMove` / `serialize_move`: same regex-equivalent notation grammar (`^[a-i][1-9]$` for pawns, `^[a-i][2-9][hv]$` for walls).
- `applyMove` / `apply_move`, `createInitialState` / `create_initial_state`: same initial board (9x9, players at the two ends, 10 walls each per `INITIAL_WALL_COUNT`), same win check (pawn reaches its goal row).

If a rule change or bug fix lands in one of these functions, make the equivalent edit in its pair before you consider the change done.

## The shared corpus

`tests/fixtures/engine_cases.json` (repo root, not under either `frontend/` or `backend/`) is a versioned JSON file of cases, each with a `kind`:

- `pawn_legal` / `wall_legal`: a move history to replay, then a `candidate` notation string and whether it should be `expected` legal.
- `history_winner`: a move history that must end with `status: "finished"` and a specific `expected_winner`.
- `history_invalid`: a move history that must be rejected partway through.

Both suites load this same file directly:

- `frontend/src/engine/__tests__/engine.test.ts` reads it via `resolve(__dirname, '../../../../tests/fixtures/engine_cases.json')` and runs one Vitest `it()` per case.
- `backend/tests/test_engine.py` reads it via a path built from `Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "engine_cases.json"` and runs one `pytest.mark.parametrize` case per entry.

When you change a rule, add or adjust a case here first (or alongside the code change) so the new behavior is pinned on both sides from one source. A case you add once is exercised by both suites automatically; you do not write it twice.

Beyond the shared corpus, each side also has module-specific tests that are not shared: `frontend/src/engine/__tests__/moveValidation.test.ts`, `notation.test.ts`, `wallUtils.test.ts`, `gameEngine.full.test.ts` on the frontend, and `backend/tests/test_move_validation.py`, `test_notation.py`, `test_game_engine.py`, `test_replay.py` on the backend. These cover implementation details (for example `replay.py`'s behavior, which has no frontend counterpart) that don't belong in the cross-language corpus.

## Running both sides

- Frontend: `make test-frontend` (`cd frontend && bun run test:run`, i.e. `vitest run`), or scope it to the engine with `bun run test:run src/engine`.
- Backend: `make test-backend` (`cd backend && uv run pytest`), or scope it with `uv run pytest tests/test_engine.py`.
- `make test` runs both.

## Closing checklist

- [ ] Changed the rule, type, or notation logic in both the `.ts` file and its paired `.py` file (or confirmed the change only affects the one file that has no pair: `moveDisplay.ts` or `replay.py`).
- [ ] Added or updated a case in `tests/fixtures/engine_cases.json` that exercises the new or changed behavior.
- [ ] `make test-frontend` is green.
- [ ] `make test-backend` is green.
- [ ] If the change affects `docs/ARCHITECTURE.md`'s description of the game engine or the parity invariant, see the `docs-freshness` skill.
