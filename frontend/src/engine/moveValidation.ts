import { BOARD_SIZE } from './constants';
import type { GameState, PlayerIndex, Position, Wall } from './gameTypes';
import { isMovementBlocked, wallsEqual, wallsIntersect, wouldWallPostOverlap } from './wallUtils';

function isOnBoard(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE;
}

function positionsEqual(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * Port of GameEngine.getValidMoves
 * Returns valid pawn positions for the given player.
 */
export function getValidPawnMoves(state: GameState, playerIndex: PlayerIndex): Position[] {
  const player = state.players[playerIndex];
  const opponent = state.players[playerIndex === 0 ? 1 : 0];
  const validMoves: Position[] = [];

  const directions: Position[] = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  for (const dir of directions) {
    const newPos: Position = {
      row: player.position.row + dir.row,
      col: player.position.col + dir.col,
    };

    if (!isOnBoard(newPos)) continue;
    if (isMovementBlocked(player.position, newPos, state.walls)) continue;

    if (positionsEqual(newPos, opponent.position)) {
      // Try to jump straight over
      const jumpPos: Position = {
        row: newPos.row + dir.row,
        col: newPos.col + dir.col,
      };

      if (
        isOnBoard(jumpPos) &&
        !isMovementBlocked(newPos, jumpPos, state.walls) &&
        !positionsEqual(jumpPos, player.position)
      ) {
        validMoves.push(jumpPos);
      } else {
        // Straight jump blocked – try diagonal jumps
        const diagDirections: Position[] =
          dir.row !== 0
            ? [
                { row: 0, col: -1 },
                { row: 0, col: 1 },
              ]
            : [
                { row: -1, col: 0 },
                { row: 1, col: 0 },
              ];

        for (const diagDir of diagDirections) {
          const diagJumpPos: Position = {
            row: newPos.row + diagDir.row,
            col: newPos.col + diagDir.col,
          };

          if (
            isOnBoard(diagJumpPos) &&
            !isMovementBlocked(newPos, diagJumpPos, state.walls) &&
            !positionsEqual(diagJumpPos, player.position)
          ) {
            validMoves.push(diagJumpPos);
          }
        }
      }
    } else {
      validMoves.push(newPos);
    }
  }

  return validMoves;
}

/**
 * BFS to check if there is a path from startPos to goalRow without any player blocking.
 * Only considers wall connectivity.
 */
export function hasPathToGoal(
  startPos: Position,
  goalRow: number,
  walls: readonly Wall[],
): boolean {
  const visited = new Set<string>();
  const queue: Position[] = [startPos];
  visited.add(`${startPos.row},${startPos.col}`);

  const directions: Position[] = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.row === goalRow) return true;

    for (const dir of directions) {
      const next: Position = { row: current.row + dir.row, col: current.col + dir.col };
      const key = `${next.row},${next.col}`;
      if (
        isOnBoard(next) &&
        !visited.has(key) &&
        !isMovementBlocked(current, next, walls)
      ) {
        visited.add(key);
        queue.push(next);
      }
    }
  }

  return false;
}

/**
 * Port of GameEngine.isValidFencePlacement
 */
export function isValidWallPlacement(state: GameState, wall: Wall): boolean {
  // Bounds check: row/col 0-7 (anchor spans 2 squares)
  if (wall.row < 0 || wall.row > 7 || wall.col < 0 || wall.col > 7) return false;

  // Duplicate check
  if (state.walls.some((w) => wallsEqual(w, wall))) return false;

  // Post overlap check
  if (wouldWallPostOverlap(wall, state.walls)) return false;

  // Intersection check
  for (const existing of state.walls) {
    if (wallsIntersect(wall, existing)) return false;
  }

  // Path connectivity check with the new wall added
  const newWalls = [...state.walls, wall];
  for (const player of state.players) {
    if (!hasPathToGoal(player.position, player.goalRow, newWalls)) return false;
  }

  return true;
}
