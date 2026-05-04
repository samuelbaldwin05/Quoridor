import type { AiDecision, Bot2Context } from '@/ai/aiTypes';
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

/**
 * Bot2 opening move patterns.
 * Player 1 (AI) starts at row 0 col 4, going down to row 8.
 * 'left' = col-1, 'right' = col+1, 'down' = row+1
 */
function findBot2OpeningMove(
  state: GameState,
  playerIndex: PlayerIndex,
  ctx: Bot2Context,
): { position: Position | null; nextCtx: Bot2Context } {
  let pattern = ctx.openingPattern;
  let step = ctx.openingStep;

  if (!pattern) {
    const patterns = [
      { moves: ['left', 'left'], weight: 2 },
      { moves: ['down', 'left'], weight: 2 },
      { moves: ['down', 'right'], weight: 2 },
      { moves: ['right', 'right'], weight: 2 },
      { moves: ['left', 'down', 'left'], weight: 2 },
      { moves: ['right', 'down', 'right'], weight: 2 },
      { moves: ['left', 'left', 'left'], weight: 1 },
      { moves: ['right', 'right', 'right'], weight: 1 },
    ];
    const totalWeight = patterns.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let selected: string[] = patterns[0]!.moves;
    for (const p of patterns) {
      rand -= p.weight;
      if (rand <= 0) {
        selected = p.moves;
        break;
      }
    }
    pattern = selected;
    step = 0;
  }

  if (step >= pattern.length) {
    return { position: null, nextCtx: { ...ctx, openingPattern: pattern, openingStep: step } };
  }

  const direction = pattern[step]!;
  const dirMap: Record<string, Position> = {
    left: { row: 0, col: -1 },
    right: { row: 0, col: 1 },
    down: { row: 1, col: 0 },
  };
  const dir = dirMap[direction]!;
  const player = state.players[playerIndex];
  const targetPos: Position = {
    row: player.position.row + dir.row,
    col: player.position.col + dir.col,
  };

  const validMoves = getValidPawnMoves(state, playerIndex);
  const desiredMove = validMoves.find((m) => m.row === targetPos.row && m.col === targetPos.col);

  if (desiredMove) {
    return {
      position: desiredMove,
      nextCtx: { ...ctx, openingPattern: pattern, openingStep: step + 1 },
    };
  } else {
    // Abandon opening
    const fallback = findBestMoveWithDijkstra(state, playerIndex);
    return {
      position: fallback,
      nextCtx: { ...ctx, openingPattern: null, openingStep: 0 },
    };
  }
}

export function makeBot2Move(
  state: GameState,
  playerIndex: PlayerIndex,
  ctx: Bot2Context,
): { decision: AiDecision | null; nextCtx: Bot2Context } {
  const player = state.players[playerIndex];
  const opponentIndex: PlayerIndex = playerIndex === 0 ? 1 : 0;
  const opponent = state.players[opponentIndex];
  const validMoves = getValidPawnMoves(state, playerIndex);

  if (validMoves.length === 0) return { decision: null, nextCtx: ctx };

  // 1. Opening strategy
  if (
    ctx.moveCount <= AI_CONFIG.BOT2_OPENING_MOVES &&
    Math.random() < AI_CONFIG.BOT2_OPENING_CHANCE
  ) {
    const { position, nextCtx } = findBot2OpeningMove(state, playerIndex, ctx);
    if (position) {
      return {
        decision: { move: { kind: 'pawn', to: position }, message: 'Computer moved.' },
        nextCtx,
      };
    }
  }

  // 2. Winning move
  const winningMove = findWinningMove(validMoves, player.goalRow);
  if (winningMove) {
    return {
      decision: { move: { kind: 'pawn', to: winningMove }, message: 'Computer wins!' },
      nextCtx: ctx,
    };
  }

  // 3. High-impact fence
  if (player.wallsRemaining > 0) {
    const currentHumanDist = dijkstraDistance(state, opponent.position, opponent.goalRow);
    const currentAiDist = dijkstraDistance(state, player.position, player.goalRow);
    const currentAdvantage = currentHumanDist - currentAiDist;

    const candidates = shuffle(getValidFencePlacements(state));
    let bestFence: Wall | null = null;
    let maxAdvantageIncrease = 0;

    for (const wall of candidates) {
      const testState: GameState = { ...state, walls: [...state.walls, wall] };
      const newHumanDist = dijkstraDistance(testState, opponent.position, opponent.goalRow);
      const newAiDist = dijkstraDistance(testState, player.position, player.goalRow);
      const newAdvantage = newHumanDist - newAiDist;
      const increase = newAdvantage - currentAdvantage;
      if (increase >= AI_CONFIG.HIGH_IMPACT_THRESHOLD && increase > maxAdvantageIncrease) {
        maxAdvantageIncrease = increase;
        bestFence = wall;
      }
    }

    if (bestFence) {
      return {
        decision: { move: { kind: 'wall', wall: bestFence }, message: 'Computer placed a fence.' },
        nextCtx: ctx,
      };
    }

    // 4. Strategic fence when opponent is close
    const opponentDistToGoal = dijkstraDistance(state, opponent.position, opponent.goalRow);
    const opponentRowDist = Math.abs(opponent.position.row - opponent.goalRow);
    const shouldPlaceFence =
      opponentDistToGoal <= AI_CONFIG.OPPONENT_DISTANCE_THRESHOLD &&
      opponentRowDist <= AI_CONFIG.OPPONENT_ROW_THRESHOLD;

    if (shouldPlaceFence) {
      const directFences = getDirectBlockingFences(opponent.position, opponent.goalRow);
      let bestStrategicFence: Wall | null = null;
      let bestAdvantageIncrease = 0;

      for (const wall of directFences) {
        if (isValidWallPlacement(state, wall)) {
          const testState: GameState = { ...state, walls: [...state.walls, wall] };
          const newHumanDist = dijkstraDistance(testState, opponent.position, opponent.goalRow);
          const newAiDist = dijkstraDistance(testState, player.position, player.goalRow);
          const newAdvantage = newHumanDist - newAiDist;
          const increase = newAdvantage - currentAdvantage;
          if (increase > bestAdvantageIncrease) {
            bestAdvantageIncrease = increase;
            bestStrategicFence = wall;
          }
        }
      }

      if (bestStrategicFence) {
        return {
          decision: {
            move: { kind: 'wall', wall: bestStrategicFence },
            message: 'Computer placed a fence.',
          },
          nextCtx: ctx,
        };
      }
    }
  }

  // 5. Dijkstra best move
  const bestMove = findBestMoveWithDijkstra(state, playerIndex);
  if (bestMove) {
    return {
      decision: { move: { kind: 'pawn', to: bestMove }, message: 'Computer moved.' },
      nextCtx: ctx,
    };
  }

  // Fallback
  return {
    decision: { move: { kind: 'pawn', to: validMoves[0]! }, message: 'Computer moved.' },
    nextCtx: ctx,
  };
}
