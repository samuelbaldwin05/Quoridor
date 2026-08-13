import type { AiContext, AiDecision } from './aiTypes';
import { makeBot0Move } from './bots/bot0';
import { makeBot1Move } from './bots/bot1';
import { makeBot2Move } from './bots/bot2';
import { chooseEngineMove } from './mcts/engineSource';
import type { GameState, Move } from '@/engine/gameTypes';
import { config } from '@/lib/config';

// AI always plays as player index 1
const AI_PLAYER_INDEX = 1 as const;

interface ExtremeMoveResponse {
  move:
    | { kind: 'pawn'; to: { row: number; col: number } }
    | { kind: 'wall'; wall: { row: number; col: number; orientation: 'h' | 'v' } };
}

const EXTREME_MAX_ATTEMPTS = 3;
const EXTREME_FALLBACK_RETRY_MS = 1000;
const EXTREME_MAX_RETRY_MS = 15000;

class AbortedError extends Error {
  constructor() {
    super('aborted');
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new AbortedError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfterMs(headerValue: string | null): number {
  if (!headerValue) return EXTREME_FALLBACK_RETRY_MS;
  const seconds = Number.parseFloat(headerValue);
  if (!Number.isFinite(seconds) || seconds <= 0) return EXTREME_FALLBACK_RETRY_MS;
  return Math.min(EXTREME_MAX_RETRY_MS, Math.ceil(seconds * 1000));
}

async function makeExtremeMove(state: GameState, signal?: AbortSignal): Promise<AiDecision> {
  const payload = {
    state: {
      players: state.players.map((p) => ({
        position: { row: p.position.row, col: p.position.col },
        walls_remaining: p.wallsRemaining,
        goal_row: p.goalRow,
      })),
      walls: state.walls.map((w) => ({
        row: w.row,
        col: w.col,
        orientation: w.orientation,
      })),
      current_player_index: state.currentPlayerIndex,
    },
    time_budget_s: 1.0,
  };

  // /api/ai/move is unauthenticated — skip apiFetch so we can read the
  // Retry-After header on a 429 and back off cleanly. AbortSignal cancels
  // both the in-flight fetch and any retry-wait.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < EXTREME_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${config.apiUrl}/api/ai/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (res.ok) {
      const body = (await res.json()) as ExtremeMoveResponse;
      const move: Move =
        body.move.kind === 'pawn'
          ? { kind: 'pawn', to: body.move.to }
          : { kind: 'wall', wall: body.move.wall };
      return { move, message: 'Extreme: neural net move' };
    }

    if (res.status === 429 && attempt < EXTREME_MAX_ATTEMPTS - 1) {
      const waitMs = parseRetryAfterMs(res.headers.get('retry-after'));
      await sleep(waitMs, signal);
      continue;
    }

    const detail = await res.text().catch(() => res.statusText);
    lastErr = new Error(`API ${res.status}: ${detail}`);
    break;
  }

  throw lastErr ?? new Error('extreme move failed');
}

export async function makeAiMove(
  state: GameState,
  context: AiContext,
  signal?: AbortSignal,
): Promise<{ decision: AiDecision | null; nextContext: AiContext }> {
  if (context.difficulty === 'bot0') {
    return { decision: makeBot0Move(state, AI_PLAYER_INDEX), nextContext: context };
  }
  if (context.difficulty === 'bot1') {
    const decision = makeBot1Move(state, AI_PLAYER_INDEX, context.bot1);
    return {
      decision,
      nextContext: {
        difficulty: 'bot1',
        bot1: {
          moveCount: context.bot1.moveCount + 1,
          previousPosition: { ...state.players[AI_PLAYER_INDEX].position },
        },
      },
    };
  }
  if (context.difficulty === 'bot2') {
    const { decision, nextCtx } = makeBot2Move(state, AI_PLAYER_INDEX, context.bot2);
    return {
      decision,
      nextContext: {
        difficulty: 'bot2',
        bot2: {
          ...nextCtx,
          moveCount: context.bot2.moveCount + 1,
        },
      },
    };
  }
  if (context.difficulty === 'mcts') {
    const { move, stats } = await chooseEngineMove(state, AI_PLAYER_INDEX, 'auto', signal);
    return {
      decision: { move, message: `Engine: ${stats.iterations} iterations (${stats.source})` },
      nextContext: {
        difficulty: 'mcts',
        mcts: { moveCount: context.mcts.moveCount + 1, lastStats: stats },
      },
    };
  }

  // extreme — backend PPO model
  const decision = await makeExtremeMove(state, signal);
  return { decision, nextContext: context };
}
