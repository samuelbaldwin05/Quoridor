import { useEffect, useState } from 'react';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import { wallsEqual } from '@/engine/wallUtils';
import type { Position, Wall } from '@/engine/gameTypes';
import type { FullState, GameAction } from './gameReducer';

export function useBoardInteraction(
  state: FullState,
  dispatch: React.Dispatch<GameAction>,
  confirmWallPlacement = false,
) {
  const [wallPreview, setWallPreview] = useState<Wall | null>(null);

  const isPassAndPlay = state.settings.gameMode === 'pass-and-play';
  const currentIdx = state.game.currentPlayerIndex;

  // Human controls: player 0 always; player 1 only in pass-and-play
  const isHumanTurn = state.game.status === 'playing' && (currentIdx === 0 || isPassAndPlay);

  // Wall preview must never persist across turn boundaries: a stale preview from
  // the previous turn would otherwise reappear as a "ghost fence" the moment it
  // becomes the player's turn again, before any tap.
  useEffect(() => {
    if (!isHumanTurn) setWallPreview(null);
  }, [isHumanTurn]);

  const validPawnMoves: Position[] = isHumanTurn ? getValidPawnMoves(state.game, currentIdx) : [];

  const handleCellClick = (pos: Position) => {
    if (!isHumanTurn || !state.settings.clickMoveEnabled) return;
    setWallPreview(null); // pawn move clears any pending wall preview
    dispatch({ type: 'APPLY_MOVE', move: { kind: 'pawn', to: pos } });
  };

  const handleWallHover = (wall: Wall | null) => {
    // In confirm mode, hover does not set previews — only explicit clicks do.
    if (confirmWallPlacement) return;
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

    if (confirmWallPlacement) {
      // First click on a new slot → preview. Second click on the same slot → commit.
      if (!wallPreview || !wallsEqual(wallPreview, wall)) {
        setWallPreview(wall);
        return;
      }
    }

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
