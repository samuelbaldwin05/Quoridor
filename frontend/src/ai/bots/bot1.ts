import type { AiDecision, Bot1Context } from '@/ai/aiTypes';
import {
  dijkstraDistance,
  findBestMoveWithDijkstra,
  findWinningMove,
  getShortestPathFromPosition,
} from '@/ai/pathfinder';
import { AI_CONFIG, BOARD_SIZE } from '@/engine/constants';
import type { GameState, PlayerIndex, Position, Wall } from '@/engine/gameTypes';
import { isValidWallPlacement } from '@/engine/moveValidation';
import { getValidPawnMoves } from '@/engine/moveValidation';

function getDirectBlockingFences(opponentPos: Position, opponentGoalRow: number): Wall[] {
  const fences: Wall[] = [];
  const goalDirection = opponentGoalRow < opponentPos.row ? -1 : 1;

  if (goalDirection === -1) {
    const fenceRow = opponentPos.row - 1;
    const fenceCol1 = Math.max(0, Math.min(7, opponentPos.col - 1));
    fences.push({ row: fenceRow, col: fenceCol1, orientation: 'h' });
    const fenceCol2 = Math.max(0, Math.min(7, opponentPos.col));
    fences.push({ row: fenceRow, col: fenceCol2, orientation: 'h' });
  } else {
    const fenceRow = opponentPos.row;
    const fenceCol1 = Math.max(0, Math.min(7, opponentPos.col - 1));
    fences.push({ row: fenceRow, col: fenceCol1, orientation: 'h' });
    const fenceCol2 = Math.max(0, Math.min(7, opponentPos.col));
    fences.push({ row: fenceRow, col: fenceCol2, orientation: 'h' });
  }

  return fences;
}

function getSideBlockingFences(opponentPos: Position): Wall[] {
  const fences: Wall[] = [];

  if (opponentPos.col > 0) {
    fences.push({ row: opponentPos.row, col: opponentPos.col - 1, orientation: 'v' });
  }
  if (opponentPos.col < BOARD_SIZE - 1) {
    fences.push({ row: opponentPos.row, col: opponentPos.col, orientation: 'v' });
  }
  if (opponentPos.row > 0) {
    if (opponentPos.col > 0) {
      fences.push({ row: opponentPos.row - 1, col: opponentPos.col - 1, orientation: 'v' });
    }
    if (opponentPos.col < BOARD_SIZE - 1) {
      fences.push({ row: opponentPos.row - 1, col: opponentPos.col, orientation: 'v' });
    }
  }

  return fences;
}

function getValidFencePlacements(state: GameState): Wall[] {
  const valid: Wall[] = [];
  for (let row = 0; row < BOARD_SIZE - 1; row++) {
    for (let col = 0; col < BOARD_SIZE - 1; col++) {
      for (const orientation of ['h', 'v'] as const) {
        const w: Wall = { row, col, orientation };
        if (isValidWallPlacement(state, w)) valid.push(w);
      }
    }
  }
  return valid;
}

/**
 * Walls that block a step of the route the opponent is currently taking. That route is the
 * pathfinder's preferred path, which is the shortest one weighted by fence proximity, not
 * strictly the shortest; for picking somewhere to inconvenience them that is close enough.
 *
 * One step is blocked by either of two walls, since a wall spans two cells: a vertical step is
 * cut by an h-wall in the groove between the two rows, anchored at either column covering it,
 * and a horizontal step by a v-wall, mirrored. Same index arithmetic as
 * wallUtils.wallBlocksMovement, read backwards.
 */
function getPathBlockingFences(state: GameState, opponentIndex: PlayerIndex): Wall[] {
  const { path } = getShortestPathFromPosition(state, opponentIndex);
  const fences: Wall[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]!;
    const to = path[i + 1]!;

    if (from.col === to.col) {
      const row = Math.min(from.row, to.row);
      for (const col of [from.col - 1, from.col]) {
        if (row >= 0 && row <= 7 && col >= 0 && col <= 7) {
          fences.push({ row, col, orientation: 'h' });
        }
      }
    } else if (from.row === to.row) {
      const col = Math.min(from.col, to.col);
      for (const row of [from.row - 1, from.row]) {
        if (row >= 0 && row <= 7 && col >= 0 && col <= 7) {
          fences.push({ row, col, orientation: 'v' });
        }
      }
    }
    // A diagonal step only happens on a jump, which no single wall blocks; skip it.
  }

  return fences;
}

/** The legal wall from `candidates` that costs the opponent the most, or null if none does. */
function bestDelayingFence(
  state: GameState,
  candidates: Wall[],
  opponent: GameState['players'][number],
): { wall: Wall; gain: number } | null {
  const currentDist = dijkstraDistance(state, opponent.position, opponent.goalRow);
  let best: { wall: Wall; gain: number } | null = null;

  for (const wall of candidates) {
    if (!isValidWallPlacement(state, wall)) continue;
    const testState: GameState = { ...state, walls: [...state.walls, wall] };
    const newDist = dijkstraDistance(testState, opponent.position, opponent.goalRow);
    const gain = newDist - currentDist;
    if (gain > 0 && (best === null || gain > best.gain)) {
      best = { wall, gain };
    }
  }

  return best;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function makeBot1Move(
  state: GameState,
  playerIndex: PlayerIndex,
  ctx: Bot1Context,
): AiDecision | null {
  const player = state.players[playerIndex];
  const opponentIndex: PlayerIndex = playerIndex === 0 ? 1 : 0;
  const opponent = state.players[opponentIndex];
  const validMoves = getValidPawnMoves(state, playerIndex);
  if (validMoves.length === 0) return null;

  // 1. Winning move
  const winningMove = findWinningMove(validMoves, player.goalRow);
  if (winningMove) {
    return { move: { kind: 'pawn', to: winningMove }, message: 'Computer wins!' };
  }

  // 2. Random early moves (avoid backtrack)
  if (
    ctx.moveCount <= AI_CONFIG.BOT1_RANDOM_MOVES &&
    Math.random() < AI_CONFIG.BOT1_RANDOM_CHANCE
  ) {
    const nonBacktrack = ctx.previousPosition
      ? validMoves.filter(
          (m) => !(m.row === ctx.previousPosition!.row && m.col === ctx.previousPosition!.col),
        )
      : validMoves;
    const pool = nonBacktrack.length > 0 ? nonBacktrack : validMoves;
    const randomMove = pool[Math.floor(Math.random() * pool.length)]!;
    return { move: { kind: 'pawn', to: randomMove }, message: 'Computer moved.' };
  }

  const opponentDist = dijkstraDistance(state, opponent.position, opponent.goalRow);
  const opponentIsClose = opponentDist <= AI_CONFIG.BOT1_BLOCK_DISTANCE;

  // 3. Stop a win in one. The opponent reaches their goal on their next move, so anything that
  // delays them beats anything else on the board. Deliberately the one thing this bot plays
  // well: losing to a bot that watched you walk in is what makes a tier feel like a gift.
  if (player.wallsRemaining > 0 && opponentDist <= 1) {
    const onPath = getPathBlockingFences(state, opponentIndex);
    const stop =
      bestDelayingFence(state, onPath, opponent) ??
      bestDelayingFence(
        state,
        getDirectBlockingFences(opponent.position, opponent.goalRow),
        opponent,
      );
    if (stop) {
      return { move: { kind: 'wall', wall: stop.wall }, message: 'Computer blocked the goal.' };
    }
  }

  // 4. High-impact fence
  if (player.wallsRemaining > 0) {
    const candidates = shuffle(getValidFencePlacements(state));
    for (const wall of candidates) {
      const testState: GameState = { ...state, walls: [...state.walls, wall] };
      const newDist = dijkstraDistance(testState, opponent.position, opponent.goalRow);
      if (newDist - opponentDist >= AI_CONFIG.HIGH_IMPACT_THRESHOLD) {
        return { move: { kind: 'wall', wall }, message: 'Computer placed a fence.' };
      }
    }
  }

  // 5. Opponent is nearly home: put a wall somewhere on their shortest path. Shuffled rather
  // than optimised, so it costs them a move or two without playing like the hard bot.
  if (player.wallsRemaining > 0 && opponentIsClose) {
    const onPath = shuffle(getPathBlockingFences(state, opponentIndex));
    for (const wall of onPath) {
      if (!isValidWallPlacement(state, wall)) continue;
      const testState: GameState = { ...state, walls: [...state.walls, wall] };
      if (dijkstraDistance(testState, opponent.position, opponent.goalRow) > opponentDist) {
        return { move: { kind: 'wall', wall }, message: 'Computer placed a fence.' };
      }
    }
  }

  // 6. Fall back to the fences immediately around the opponent, for when nothing on the path
  // is legal (already walled, or placing there would seal someone in).
  if (player.wallsRemaining > 0 && opponentIsClose) {
    const currentDist = opponentDist;
    const directFences = getDirectBlockingFences(opponent.position, opponent.goalRow);
    for (const wall of directFences) {
      if (isValidWallPlacement(state, wall)) {
        const testState: GameState = { ...state, walls: [...state.walls, wall] };
        const newDist = dijkstraDistance(testState, opponent.position, opponent.goalRow);
        if (newDist > currentDist) {
          return { move: { kind: 'wall', wall }, message: 'Computer placed a fence.' };
        }
      }
    }

    // Then the fences beside them, which cost a step by forcing a detour.
    const sideFences = shuffle(getSideBlockingFences(opponent.position));
    for (const wall of sideFences) {
      if (isValidWallPlacement(state, wall)) {
        const testState: GameState = { ...state, walls: [...state.walls, wall] };
        const newDist = dijkstraDistance(testState, opponent.position, opponent.goalRow);
        if (newDist > currentDist) {
          return { move: { kind: 'wall', wall }, message: 'Computer placed a fence.' };
        }
      }
    }
  }

  // 7. Otherwise just race.
  const bestMove = findBestMoveWithDijkstra(state, playerIndex);
  if (bestMove) {
    return { move: { kind: 'pawn', to: bestMove }, message: 'Computer moved.' };
  }

  // Fallback
  return { move: { kind: 'pawn', to: validMoves[0]! }, message: 'Computer moved.' };
}
