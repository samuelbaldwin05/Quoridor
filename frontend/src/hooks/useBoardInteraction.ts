import { useState } from 'react';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import type { Position, Wall } from '@/engine/gameTypes';
import type { FullState, GameAction } from './gameReducer';

export function useBoardInteraction(state: FullState, dispatch: React.Dispatch<GameAction>) {
  const [wallPreview, setWallPreview] = useState<Wall | null>(null);

  const isPassAndPlay = state.settings.gameMode === 'pass-and-play';
  const currentIdx = state.game.currentPlayerIndex;

  // Human controls: player 0 always; player 1 only in pass-and-play
  const isHumanTurn = state.game.status === 'playing' && (currentIdx === 0 || isPassAndPlay);

  const validPawnMoves: Position[] = isHumanTurn ? getValidPawnMoves(state.game, currentIdx) : [];

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
    if (state.game.players[currentIdx].wallsRemaining <= 0) return;
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
