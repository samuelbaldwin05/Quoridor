import { useState } from 'react';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import type { Position, Wall } from '@/engine/gameTypes';
import type { FullState, GameAction } from './gameReducer';

export function useBoardInteraction(
  state: FullState,
  dispatch: React.Dispatch<GameAction>,
) {
  const [wallPreview, setWallPreview] = useState<Wall | null>(null);

  const isHumanTurn =
    state.game.status === 'playing' && state.game.currentPlayerIndex === 0;

  const validPawnMoves: Position[] = isHumanTurn
    ? getValidPawnMoves(state.game, 0)
    : [];

  const handleCellClick = (pos: Position) => {
    if (!isHumanTurn || !state.settings.clickMoveEnabled) return;
    dispatch({ type: 'APPLY_MOVE', move: { kind: 'pawn', to: pos } });
  };

  const handleWallHover = (wall: Wall | null) => {
    if (!isHumanTurn) {
      setWallPreview(null);
      return;
    }
    setWallPreview(wall);
  };

  const handleWallClick = (wall: Wall) => {
    if (!isHumanTurn) return;
    if (state.game.players[0].wallsRemaining <= 0) return;
    if (!isValidWallPlacement(state.game, wall)) return;
    dispatch({ type: 'APPLY_MOVE', move: { kind: 'wall', wall } });
    setWallPreview(null);
  };

  return {
    wallPreview,
    validPawnMoves,
    handleCellClick,
    handleWallHover,
    handleWallClick,
  };
}
