import type { AiDecision, Bot1Context } from '@/ai/aiTypes';
import { dijkstraDistance, findBestMoveWithDijkstra, findWinningMove } from '@/ai/pathfinder';
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
  if (ctx.moveCount <= AI_CONFIG.BOT1_RANDOM_MOVES && Math.random() < AI_CONFIG.BOT1_RANDOM_CHANCE) {
    const nonBacktrack = ctx.previousPosition
      ? validMoves.filter(
          (m) => !(m.row === ctx.previousPosition!.row && m.col === ctx.previousPosition!.col),
        )
      : validMoves;
    const pool = nonBacktrack.length > 0 ? nonBacktrack : validMoves;
    const randomMove = pool[Math.floor(Math.random() * pool.length)]!;
    return { move: { kind: 'pawn', to: randomMove }, message: 'Computer moved.' };
  }

  // 3. High-impact fence
  if (player.wallsRemaining > 0) {
    const currentDist = dijkstraDistance(state, opponent.position, opponent.goalRow);
    const candidates = shuffle(getValidFencePlacements(state));
    for (const wall of candidates) {
      const testState: GameState = { ...state, walls: [...state.walls, wall] };
      const newDist = dijkstraDistance(testState, opponent.position, opponent.goalRow);
      if (newDist - currentDist >= AI_CONFIG.HIGH_IMPACT_THRESHOLD) {
        return { move: { kind: 'wall', wall }, message: 'Computer placed a fence.' };
      }
    }
  }

  // 4. Strategic fence when opponent is close
  if (player.wallsRemaining > 0 && opponent.position.row >= AI_CONFIG.BOT1_STRATEGIC_ROW_THRESHOLD) {
    const currentDist = dijkstraDistance(state, opponent.position, opponent.goalRow);
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

    // 5. Side fence
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

  // 6. Dijkstra best move
  const bestMove = findBestMoveWithDijkstra(state, playerIndex);
  if (bestMove) {
    return { move: { kind: 'pawn', to: bestMove }, message: 'Computer moved.' };
  }

  // Fallback
  return { move: { kind: 'pawn', to: validMoves[0]! }, message: 'Computer moved.' };
}
