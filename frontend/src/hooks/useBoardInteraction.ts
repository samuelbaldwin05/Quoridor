import { useState } from 'react';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import { wallsEqual } from '@/engine/wallUtils';
import type { Position, Wall } from '@/engine/gameTypes';
import type { FullState, GameAction } from './gameReducer';

export function useBoardInteraction(
  state: FullState,
  dispatch: React.Dispatch<GameAction>,
  confirmWallPlacement = false,
) {
  // The move count the preview was drawn on rides along with it: see activeWall.
  const [wallPreview, setWallPreview] = useState<{ wall: Wall; atMove: number } | null>(null);

  const isPassAndPlay = state.settings.gameMode === 'pass-and-play';
  const currentIdx = state.game.currentPlayerIndex;
  const moveCount = state.moveHistory.length;

  // Human controls: player 0 always; player 1 only in pass-and-play
  const isHumanTurn = state.game.status === 'playing' && (currentIdx === 0 || isPassAndPlay);

  // In confirm (tap) mode a preview is committed state, not a pointer echo: nothing takes
  // it back down if the player previews a wall and then moves their pawn instead. Hiding
  // it for the opponent's turn is not enough, since it reappears on the next one, so a tap
  // preview expires with the turn it was drawn on. Hover mode keeps its preview across the
  // move: there the pointer owns it, and it is still under the cursor.
  const isExpiredTapPreview = confirmWallPlacement && wallPreview?.atMove !== moveCount;
  const activeWall = wallPreview && !isExpiredTapPreview ? wallPreview.wall : null;

  // Derived so a stale preview never bleeds into the opponent's turn either.
  const visibleWallPreview = isHumanTurn ? activeWall : null;

  const previewWall = (wall: Wall | null) =>
    setWallPreview(wall ? { wall, atMove: moveCount } : null);

  const validPawnMoves: Position[] = isHumanTurn ? getValidPawnMoves(state.game, currentIdx) : [];

  const handleCellClick = (pos: Position) => {
    if (!isHumanTurn || !state.settings.clickMoveEnabled) return;
    previewWall(null);
    dispatch({ type: 'APPLY_MOVE', move: { kind: 'pawn', to: pos } });
  };

  const handleWallHover = (wall: Wall | null) => {
    if (confirmWallPlacement) return;
    previewWall(isHumanTurn ? wall : null);
  };

  const handleWallClick = (wall: Wall) => {
    if (!isHumanTurn) return;
    if (state.game.players[currentIdx].wallsRemaining <= 0) return;
    if (!isValidWallPlacement(state.game, wall)) return;

    // In confirm mode, first click previews, second click on same slot commits.
    if (confirmWallPlacement) {
      if (!activeWall || !wallsEqual(activeWall, wall)) {
        previewWall(wall);
        return;
      }
    }

    dispatch({ type: 'APPLY_MOVE', move: { kind: 'wall', wall } });
    previewWall(null);
  };

  return {
    wallPreview: visibleWallPreview,
    validPawnMoves,
    handleCellClick,
    handleWallHover,
    handleWallClick,
  };
}
