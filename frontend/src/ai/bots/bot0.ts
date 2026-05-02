import type { AiDecision } from '@/ai/aiTypes';
import { findBestMoveWithDijkstra, findWinningMove } from '@/ai/pathfinder';
import type { GameState, PlayerIndex } from '@/engine/gameTypes';
import { getValidPawnMoves } from '@/engine/moveValidation';

export function makeBot0Move(state: GameState, playerIndex: PlayerIndex): AiDecision | null {
  const player = state.players[playerIndex];
  const validMoves = getValidPawnMoves(state, playerIndex);
  if (validMoves.length === 0) return null;

  // Check for winning move
  const winningMove = findWinningMove(validMoves, player.goalRow);
  if (winningMove) {
    return {
      move: { kind: 'pawn', to: winningMove },
      message: 'Computer wins!',
    };
  }

  // Use Dijkstra for best move
  const bestMove = findBestMoveWithDijkstra(state, playerIndex);
  if (bestMove) {
    return {
      move: { kind: 'pawn', to: bestMove },
      message: 'Computer moved.',
    };
  }

  // Fallback
  return {
    move: { kind: 'pawn', to: validMoves[0]! },
    message: 'Computer moved.',
  };
}
