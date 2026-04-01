import { AI_CONFIG, BOARD_SIZE } from '@/engine/constants';
import type { GameState, PlayerIndex, Position, Wall } from '@/engine/gameTypes';
import { getValidPawnMoves } from '@/engine/moveValidation';

/**
 * Dijkstra distance from startPos to goalRow.
 * When evaluating moves from each node, we temporarily place the pathfinding
 * player at that node position so jump logic works correctly.
 */
export function dijkstraDistance(
  state: GameState,
  startPos: Position,
  goalRow: number,
): number {
  // Find which player index has the given goalRow (for building temp state)
  const playerIndex: PlayerIndex =
    state.players[0].goalRow === goalRow ? 0 : 1;

  const distances: Record<string, number> = {};
  const visited = new Set<string>();
  const queue: Array<{ position: Position; distance: number }> = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      distances[`${row},${col}`] = Infinity;
    }
  }

  const startKey = `${startPos.row},${startPos.col}`;
  distances[startKey] = 0;
  queue.push({ position: startPos, distance: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift()!;
    const currentKey = `${current.position.row},${current.position.col}`;

    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    if (current.position.row === goalRow) return current.distance;

    // Temporarily set this player's position to current for move generation
    const newPlayers: [typeof state.players[0], typeof state.players[1]] = [
      { ...state.players[0] },
      { ...state.players[1] },
    ];
    newPlayers[playerIndex] = { ...state.players[playerIndex], position: current.position };
    const tempState: GameState = { ...state, players: newPlayers };

    const possibleMoves = getValidPawnMoves(tempState, playerIndex);

    for (const move of possibleMoves) {
      const moveKey = `${move.row},${move.col}`;
      if (!visited.has(moveKey)) {
        const fencePenalty = calculateFenceProximityPenalty(state.walls, move);
        const opposingPos = state.players[playerIndex === 0 ? 1 : 0].position;
        const opposingPenalty = calculateOpposingPlayerPenalty(opposingPos, move);
        const newDistance = current.distance + 1 + fencePenalty + opposingPenalty;

        if (newDistance < distances[moveKey]) {
          distances[moveKey] = newDistance;
          queue.push({ position: move, distance: newDistance });
        }
      }
    }
  }

  return Infinity;
}

/**
 * Get shortest path from player's current position using Dijkstra.
 */
export function getShortestPathFromPosition(
  state: GameState,
  playerIndex: PlayerIndex,
): { path: Position[]; distances: Record<string, number> } {
  const player = state.players[playerIndex];
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const visited = new Set<string>();
  const queue: Array<{ position: Position; distance: number }> = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const key = `${row},${col}`;
      distances[key] = Infinity;
      previous[key] = null;
    }
  }

  const startKey = `${player.position.row},${player.position.col}`;
  distances[startKey] = 0;
  queue.push({ position: player.position, distance: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift()!;
    const currentKey = `${current.position.row},${current.position.col}`;

    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    if (current.position.row === player.goalRow) {
      // Reconstruct path
      const path: Position[] = [];
      let cur: string | null = currentKey;
      while (cur !== null) {
        const [row, col] = cur.split(',').map(Number);
        path.unshift({ row: row!, col: col! });
        cur = previous[cur] ?? null;
      }
      return { path, distances };
    }

    // Temporarily set player position to current for move generation
    const newPlayers: [typeof state.players[0], typeof state.players[1]] = [
      { ...state.players[0] },
      { ...state.players[1] },
    ];
    newPlayers[playerIndex] = { ...player, position: current.position };
    const tempState: GameState = { ...state, players: newPlayers };

    const possibleMoves = getValidPawnMoves(tempState, playerIndex);

    for (const move of possibleMoves) {
      const moveKey = `${move.row},${move.col}`;
      if (!visited.has(moveKey)) {
        const fencePenalty = calculateFenceProximityPenalty(state.walls, move);
        const opposingPos = state.players[playerIndex === 0 ? 1 : 0].position;
        const opposingPenalty = calculateOpposingPlayerPenalty(opposingPos, move);
        const newDistance = current.distance + 1 + fencePenalty + opposingPenalty;

        if (newDistance < distances[moveKey]) {
          distances[moveKey] = newDistance;
          previous[moveKey] = currentKey;
          queue.push({ position: move, distance: newDistance });
        }
      }
    }
  }

  return { path: [], distances };
}

/**
 * Find the best next pawn move using Dijkstra.
 */
export function findBestMoveWithDijkstra(
  state: GameState,
  playerIndex: PlayerIndex,
): Position | null {
  const validMoves = getValidPawnMoves(state, playerIndex);
  if (validMoves.length === 0) return null;

  const pathData = getShortestPathFromPosition(state, playerIndex);

  if (pathData.path.length <= 1) {
    // Fallback: pick move with shortest distance to goal
    let bestMove: Position | null = null;
    let shortestDistance = Infinity;
    const player = state.players[playerIndex];
    for (const move of validMoves) {
      const dist = dijkstraDistance(state, move, player.goalRow);
      if (dist < shortestDistance) {
        shortestDistance = dist;
        bestMove = move;
      }
    }
    return bestMove;
  }

  const nextOptimal = pathData.path[1]!;
  const bestMove = validMoves.find(
    (m) => m.row === nextOptimal.row && m.col === nextOptimal.col,
  );
  return bestMove ?? validMoves[0]!;
}

/**
 * Check if any valid move wins (reaches the goal row).
 */
export function findWinningMove(validMoves: Position[], goalRow: number): Position | null {
  for (const move of validMoves) {
    if (move.row === goalRow) return move;
  }
  return null;
}

function getFenceAffectedSquares(wall: Wall): Position[] {
  const squares: Position[] = [];
  // Both orientations use the same 4 squares around anchor
  squares.push({ row: wall.row, col: wall.col });
  squares.push({ row: wall.row, col: wall.col + 1 });
  squares.push({ row: wall.row + 1, col: wall.col });
  squares.push({ row: wall.row + 1, col: wall.col + 1 });
  return squares;
}

function getDistanceToWall(position: Position, wall: Wall): number {
  let minDist = Infinity;
  for (const sq of getFenceAffectedSquares(wall)) {
    const dist = Math.abs(position.row - sq.row) + Math.abs(position.col - sq.col);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

export function calculateFenceProximityPenalty(walls: readonly Wall[], position: Position): number {
  if (walls.length === 0) return 0;
  let minDist = Infinity;
  for (const w of walls) {
    const dist = getDistanceToWall(position, w);
    if (dist < minDist) minDist = dist;
  }
  const penalties = AI_CONFIG.FENCE_PROXIMITY_PENALTIES;
  if (minDist === 0) return penalties.ADJACENT;
  if (minDist === 1) return penalties.NEAR;
  if (minDist === 2) return penalties.MEDIUM;
  if (minDist === 3) return penalties.FAR;
  return penalties.NONE;
}

export function calculateOpposingPlayerPenalty(
  opposingPos: Position,
  position: Position,
): number {
  const rowDiff = Math.abs(position.row - opposingPos.row);
  const colDiff = Math.abs(position.col - opposingPos.col);
  if (rowDiff <= 1 && colDiff <= 1 && !(rowDiff === 0 && colDiff === 0)) {
    return AI_CONFIG.OPPOSING_PLAYER_PENALTY;
  }
  return 0;
}

export function calculateFenceDistance(walls: readonly Wall[], position: Position): number {
  if (walls.length === 0) return Infinity;
  let minDist = Infinity;
  for (const w of walls) {
    const dist = getDistanceToWall(position, w);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}
