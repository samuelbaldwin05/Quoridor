import { useReducer } from 'react';
import { loadSettings } from '@/lib/settingsStorage';
import { getValidPawnMoves } from '@/engine/moveValidation';
import {
  createInitialFullState,
  gameReducer,
  type FullState,
  type GameAction,
} from './gameReducer';

export function useGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialFullState(loadSettings()),
  );

  const isHumanTurn = state.game.status === 'playing' && state.game.currentPlayerIndex === 0;

  const validPawnMoves = isHumanTurn ? getValidPawnMoves(state.game, 0) : [];

  const currentPlayer = state.game.players[state.game.currentPlayerIndex];

  return {
    state,
    dispatch: dispatch as React.Dispatch<GameAction>,
    isHumanTurn,
    validPawnMoves,
    currentPlayer,
    // Convenience accessors
    gameState: state.game as FullState['game'],
  };
}
