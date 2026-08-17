import { useState } from 'react';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import { wallsEqual } from '@/engine/wallUtils';
import type { Position, Wall } from '@/engine/gameTypes';
import type { FullState, GameAction } from './gameReducer';

/**
 * A tap waiting on its confirming second tap, tagged with the move it was made on.
 * Wall and pawn intentions share one slot: you are proposing one move, so tapping a
 * square drops a pending wall and vice versa.
 */
type PendingIntent =
  | { kind: 'wall'; wall: Wall; atMove: number }
  | { kind: 'pawn'; to: Position; atMove: number };

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function useBoardInteraction(
  state: FullState,
  dispatch: React.Dispatch<GameAction>,
  confirmMoves = false,
) {
  const [pending, setPending] = useState<PendingIntent | null>(null);

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
  const expired = confirmMoves && pending?.atMove !== moveCount;
  const active = pending && !expired ? pending : null;
  const activeWall = active?.kind === 'wall' ? active.wall : null;
  const activePawnMove = active?.kind === 'pawn' ? active.to : null;

  // Derived so a stale preview never bleeds into the opponent's turn either.
  const visibleWallPreview = isHumanTurn ? activeWall : null;
  const pendingPawnMove = isHumanTurn ? activePawnMove : null;

  const previewWall = (wall: Wall | null) =>
    setPending(wall ? { kind: 'wall', wall, atMove: moveCount } : null);

  const validPawnMoves: Position[] = isHumanTurn ? getValidPawnMoves(state.game, currentIdx) : [];

  const handleCellClick = (pos: Position) => {
    if (!isHumanTurn || !state.settings.clickMoveEnabled) return;

    // Confirm mode covers pawn moves for the same reason it covers walls: on a phone the
    // wall grooves sit between the squares, so a tap aimed at one that lands slightly off
    // used to play a pawn move on the spot, with no way back. First tap proposes.
    if (confirmMoves) {
      if (!validPawnMoves.some((p) => samePosition(p, pos))) return;
      if (!activePawnMove || !samePosition(activePawnMove, pos)) {
        setPending({ kind: 'pawn', to: pos, atMove: moveCount });
        return;
      }
    }

    setPending(null);
    dispatch({ type: 'APPLY_MOVE', move: { kind: 'pawn', to: pos } });
  };

  const handleWallHover = (wall: Wall | null) => {
    if (confirmMoves) return;
    previewWall(isHumanTurn ? wall : null);
  };

  const handleWallClick = (wall: Wall) => {
    if (!isHumanTurn) return;
    if (state.game.players[currentIdx].wallsRemaining <= 0) return;
    if (!isValidWallPlacement(state.game, wall)) return;

    // In confirm mode, first click previews, second click on same slot commits.
    if (confirmMoves) {
      if (!activeWall || !wallsEqual(activeWall, wall)) {
        previewWall(wall);
        return;
      }
    }

    setPending(null);
    dispatch({ type: 'APPLY_MOVE', move: { kind: 'wall', wall } });
  };

  return {
    wallPreview: visibleWallPreview,
    pendingPawnMove,
    validPawnMoves,
    handleCellClick,
    handleWallHover,
    handleWallClick,
  };
}
