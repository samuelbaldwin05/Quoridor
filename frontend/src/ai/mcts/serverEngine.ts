import { z } from 'zod';
import type { GameState, Move } from '@/engine/gameTypes';
import { config } from '@/lib/config';
import type { EngineDecision } from './mctsTypes';

/**
 * The default source for the MCTS tier: the same C++ engine, compiled natively and run on the
 * backend, so every player gets the same strength regardless of their device.
 *
 * A 503 (saturated or engine not installed) or a network failure is reported as
 * ServerEngineUnavailable, which tells the caller to fall back rather than retry.
 */

const MoveSchema = z.union([
  z.object({
    kind: z.literal('pawn'),
    to: z.object({ row: z.number().int(), col: z.number().int() }),
  }),
  z.object({
    kind: z.literal('wall'),
    wall: z.object({
      row: z.number().int(),
      col: z.number().int(),
      orientation: z.enum(['h', 'v']),
    }),
  }),
]);

const StatsSchema = z.object({
  iterations: z.number().int(),
  elapsed_ms: z.number().int(),
  target_iterations: z.number().int(),
  threads: z.number().int(),
  cached: z.boolean(),
  engine_commit: z.string(),
});

const ResponseSchema = z.object({
  move: MoveSchema,
  stats: StatsSchema.nullish(),
});

export class ServerEngineUnavailable extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ServerEngineUnavailable';
    this.retryAfterMs = retryAfterMs;
  }
}

// Long enough for a full search plus a cold start, short enough that a wedged backend does not
// hold up the turn. Past this the client plays the move itself.
const REQUEST_TIMEOUT_MS = 6000;

function toPayload(state: GameState) {
  return {
    state: {
      players: state.players.map((p) => ({
        position: { row: p.position.row, col: p.position.col },
        walls_remaining: p.wallsRemaining,
        goal_row: p.goalRow,
      })),
      walls: state.walls.map((w) => ({ row: w.row, col: w.col, orientation: w.orientation })),
      current_player_index: state.currentPlayerIndex,
    },
    engine: 'mcts' as const,
  };
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseFloat(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null;
}

export async function chooseMoveOnServer(
  state: GameState,
  signal?: AbortSignal,
): Promise<EngineDecision> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const onOuterAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  let response: Response;
  try {
    // Not apiFetch: this path needs to read Retry-After off a 503 and to treat a failure as a
    // fallback signal rather than an exception. The bearer header still goes along, because the
    // search engine is members-only and answers 403 without it.
    // Imported here rather than at the top of the file on purpose. `@/lib/api` constructs the
    // Supabase client at module load and throws without configured env, and this module is
    // reachable from the game reducer, so a static import would take the whole reducer down in
    // any environment without frontend env vars (CI, for one).
    //
    // A failed session lookup must not cost the move either: send it unauthenticated and let
    // the server decide. For the members-only engine that means a 403 and a drop to the next
    // source, which beats throwing on the way out.
    const authHeader = await import('@/lib/api')
      .then((api) => api.getAuthHeader())
      .catch(() => null);
    response = await fetch(`${config.apiUrl}/api/ai/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(toPayload(state)),
      signal: timeoutController.signal,
    });
  } catch (err) {
    // A caller-driven abort is not an engine failure; let it propagate as-is.
    if (signal?.aborted) throw err;
    throw new ServerEngineUnavailable(
      err instanceof Error ? err.message : 'network error while reaching the engine',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  // 401/403 mean this caller is not entitled to the engine (the tier is members-only), which is
  // as much a "use another source" answer as saturation is. The UI locks the tier for guests, so
  // reaching here is either a signed-out mid-game session or an expired token.
  if ([401, 403, 429, 503].includes(response.status)) {
    throw new ServerEngineUnavailable(
      `engine unavailable (${response.status})`,
      parseRetryAfterMs(response.headers.get('retry-after')),
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new ServerEngineUnavailable(`engine error ${response.status}: ${detail}`);
  }

  const parsed = ResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ServerEngineUnavailable('engine returned an unrecognized response');
  }

  const body = parsed.data;
  const move: Move =
    body.move.kind === 'pawn'
      ? { kind: 'pawn', to: body.move.to }
      : { kind: 'wall', wall: body.move.wall };

  return {
    move,
    stats: {
      source: 'server',
      iterations: body.stats?.iterations ?? 0,
      elapsedMs: body.stats?.elapsed_ms ?? 0,
      targetIterations: body.stats?.target_iterations ?? 0,
      threads: body.stats?.threads ?? 0,
      cached: body.stats?.cached ?? false,
      engineCommit: body.stats?.engine_commit ?? 'unknown',
    },
  };
}
