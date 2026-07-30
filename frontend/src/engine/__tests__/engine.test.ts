import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyMove, createInitialState } from '../gameEngine';
import { getValidPawnMoves, isValidWallPlacement } from '../moveValidation';
import { parseMove } from '../notation';
import type { GameState, Move, PlayerIndex, Wall } from '../gameTypes';

interface BaseCase {
  name: string;
  history: string[];
}
interface PawnLegalCase extends BaseCase {
  kind: 'pawn_legal';
  candidate: string;
  expected: boolean;
}
interface WallLegalCase extends BaseCase {
  kind: 'wall_legal';
  candidate: string;
  expected: boolean;
}
interface HistoryWinnerCase extends BaseCase {
  kind: 'history_winner';
  expected_winner: PlayerIndex;
}
interface HistoryInvalidCase extends BaseCase {
  kind: 'history_invalid';
}
type Case = PawnLegalCase | WallLegalCase | HistoryWinnerCase | HistoryInvalidCase;
interface Corpus {
  version: number;
  cases: Case[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const corpusPath = resolve(__dirname, '../../../../tests/fixtures/engine_cases.json');
const corpus: Corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'));

function startedGame(): GameState {
  return { ...createInitialState(), status: 'playing' };
}

function applyHistory(history: string[]): { state: GameState; ok: boolean } {
  let state = startedGame();
  for (const text of history) {
    const move = parseMove(text);
    const result = applyMove(state, move);
    if (!result.valid) return { state, ok: false };
    state = result.nextState;
  }
  return { state, ok: true };
}

function positionsEqual(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  return a.row === b.row && a.col === b.col;
}

function wallsEqual(a: Wall, b: Wall): boolean {
  return a.row === b.row && a.col === b.col && a.orientation === b.orientation;
}

function runPawnLegal(c: PawnLegalCase): void {
  const { state, ok } = applyHistory(c.history);
  expect(ok, `setup history failed: ${c.history.join(',')}`).toBe(true);
  const move = parseMove(c.candidate) as Extract<Move, { kind: 'pawn' }>;
  expect(move.kind).toBe('pawn');
  const valid = getValidPawnMoves(state, state.currentPlayerIndex);
  const isLegal = valid.some((p) => positionsEqual(p, move.to));
  expect(isLegal).toBe(c.expected);
}

function runWallLegal(c: WallLegalCase): void {
  const { state, ok } = applyHistory(c.history);
  expect(ok, `setup history failed: ${c.history.join(',')}`).toBe(true);
  const move = parseMove(c.candidate) as Extract<Move, { kind: 'wall' }>;
  expect(move.kind).toBe('wall');
  // Avoid silent matches if the wall is already in state — that's the duplicate case.
  if (state.walls.some((w) => wallsEqual(w, move.wall))) {
    expect(c.expected).toBe(false);
    return;
  }
  expect(isValidWallPlacement(state, move.wall)).toBe(c.expected);
}

function runHistoryWinner(c: HistoryWinnerCase): void {
  const { state, ok } = applyHistory(c.history);
  expect(ok, `history rejected: ${c.history.join(',')}`).toBe(true);
  expect(state.status).toBe('finished');
  expect(state.winner).toBe(c.expected_winner);
}

function runHistoryInvalid(c: HistoryInvalidCase): void {
  const { ok } = applyHistory(c.history);
  expect(ok).toBe(false);
}

describe('engine corpus parity', () => {
  for (const c of corpus.cases) {
    it(c.name, () => {
      switch (c.kind) {
        case 'pawn_legal':
          return runPawnLegal(c);
        case 'wall_legal':
          return runWallLegal(c);
        case 'history_winner':
          return runHistoryWinner(c);
        case 'history_invalid':
          return runHistoryInvalid(c);
      }
    });
  }
});
