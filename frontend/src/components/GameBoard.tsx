import { isValidWallPlacement } from '@/engine/moveValidation';
import type { GameState, Orientation, Position, Wall } from '@/engine/gameTypes';
import { BoardCell } from './BoardCell';
import { WallPost } from './WallPost';
import { WallSlot } from './WallSlot';

interface GameBoardProps {
  gameState: GameState;
  validPawnMoves: Position[];
  wallPreview: Wall | null;
  isHumanTurn: boolean;
  clickMoveEnabled: boolean;
  onCellClick: (pos: Position) => void;
  onWallHover: (wall: Wall | null) => void;
  onWallClick: (wall: Wall) => void;
}

function wallMatchesSlot(wall: Wall, fenceRow: number, fenceCol: number): boolean {
  if (wall.orientation === 'h') {
    // Horizontal fence at anchor (row, col) occupies h-slots at (row, col) and (row, col+1)
    return wall.row === fenceRow && (wall.col === fenceCol || wall.col + 1 === fenceCol);
  } else {
    // Vertical fence at anchor (row, col) occupies v-slots at (row, col) and (row+1, col)
    return wall.col === fenceCol && (wall.row === fenceRow || wall.row + 1 === fenceRow);
  }
}

/**
 * Given a hovered wall slot position (fenceRow, fenceCol) and orientation,
 * returns the canonical Wall anchor that would be placed.
 * For h: gridRow = fenceRow * 2 + 1 in 17x17, fenceCol = gridCol / 2
 *   The anchor col is the lower of the two cell cols (fenceCol itself or fenceCol-1)
 *   Canonical anchor: the one with lower col that spans to fenceCol
 * We use fenceRow and min(fenceCol) = fenceCol if fenceCol <= 6, else fenceCol-1
 */
function getWallForSlot(
  fenceRow: number,
  fenceCol: number,
  orientation: Orientation,
): Wall {
  if (orientation === 'h') {
    // anchor col = fenceCol if fenceCol+1 <= 8 else fenceCol-1
    const anchorCol = fenceCol <= 6 ? fenceCol : fenceCol - 1;
    return { row: fenceRow, col: anchorCol, orientation: 'h' };
  } else {
    const anchorRow = fenceRow <= 6 ? fenceRow : fenceRow - 1;
    return { row: anchorRow, col: fenceCol, orientation: 'v' };
  }
}

export function GameBoard({
  gameState,
  validPawnMoves,
  wallPreview,
  isHumanTurn,
  clickMoveEnabled,
  onCellClick,
  onWallHover,
  onWallClick,
}: GameBoardProps) {
  const cells: React.ReactElement[] = [];

  for (let gridRow = 0; gridRow < 17; gridRow++) {
    for (let gridCol = 0; gridCol < 17; gridCol++) {
      const isEvenRow = gridRow % 2 === 0;
      const isEvenCol = gridCol % 2 === 0;

      if (isEvenRow && isEvenCol) {
        // Board cell: position (gridRow/2, gridCol/2)
        const row = gridRow / 2;
        const col = gridCol / 2;

        const occupant =
          gameState.players[0].position.row === row &&
          gameState.players[0].position.col === col
            ? (0 as const)
            : gameState.players[1].position.row === row &&
                gameState.players[1].position.col === col
              ? (1 as const)
              : null;

        const isValidMove = validPawnMoves.some((p) => p.row === row && p.col === col);

        cells.push(
          <BoardCell
            key={`cell-${row}-${col}`}
            row={row}
            col={col}
            occupant={occupant}
            isValidMove={isValidMove}
            isHumanTurn={isHumanTurn}
            clickMoveEnabled={clickMoveEnabled}
            onClick={() => onCellClick({ row, col })}
          />,
        );
      } else if (!isEvenRow && isEvenCol) {
        // Horizontal wall slot: fence row = (gridRow-1)/2, fence col = gridCol/2
        const fenceRow = (gridRow - 1) / 2;
        const fenceCol = gridCol / 2;

        // Determine if this slot is covered by a placed wall
        const isPlaced = gameState.walls.some(
          (w) => w.orientation === 'h' && wallMatchesSlot(w, fenceRow, fenceCol),
        );

        // Determine the canonical wall for this slot
        const anchorWall = getWallForSlot(fenceRow, fenceCol, 'h');

        // Preview state
        let previewState: 'valid' | 'invalid' | null = null;
        if (wallPreview && wallPreview.orientation === 'h') {
          if (wallMatchesSlot(wallPreview, fenceRow, fenceCol)) {
            previewState = isValidWallPlacement(gameState, wallPreview) ? 'valid' : 'invalid';
          }
        }

        cells.push(
          <WallSlot
            key={`hslot-${fenceRow}-${fenceCol}`}
            orientation="h"
            isPlaced={isPlaced}
            previewState={previewState}
            onMouseEnter={() => onWallHover(anchorWall)}
            onMouseLeave={() => onWallHover(null)}
            onClick={() => onWallClick(anchorWall)}
          />,
        );
      } else if (isEvenRow && !isEvenCol) {
        // Vertical wall slot: fence row = gridRow/2, fence col = (gridCol-1)/2
        const fenceRow = gridRow / 2;
        const fenceCol = (gridCol - 1) / 2;

        const isPlaced = gameState.walls.some(
          (w) => w.orientation === 'v' && wallMatchesSlot(w, fenceRow, fenceCol),
        );

        const anchorWall = getWallForSlot(fenceRow, fenceCol, 'v');

        let previewState: 'valid' | 'invalid' | null = null;
        if (wallPreview && wallPreview.orientation === 'v') {
          if (wallMatchesSlot(wallPreview, fenceRow, fenceCol)) {
            previewState = isValidWallPlacement(gameState, wallPreview) ? 'valid' : 'invalid';
          }
        }

        cells.push(
          <WallSlot
            key={`vslot-${fenceRow}-${fenceCol}`}
            orientation="v"
            isPlaced={isPlaced}
            previewState={previewState}
            onMouseEnter={() => onWallHover(anchorWall)}
            onMouseLeave={() => onWallHover(null)}
            onClick={() => onWallClick(anchorWall)}
          />,
        );
      } else {
        // Intersection post: at anchor (Math.floor(gridRow/2), Math.floor(gridCol/2))
        const anchorRow = Math.floor(gridRow / 2);
        const anchorCol = Math.floor(gridCol / 2);

        // A post is placed when a wall exists at this anchor position
        const isPlaced = gameState.walls.some(
          (w) => w.row === anchorRow && w.col === anchorCol,
        );

        // Show preview post when the preview wall anchors here
        const isPreview =
          !isPlaced &&
          wallPreview !== null &&
          wallPreview.row === anchorRow &&
          wallPreview.col === anchorCol;

        cells.push(
          <WallPost
            key={`post-${anchorRow}-${anchorCol}`}
            isPlaced={isPlaced}
            isPreview={isPreview}
          />,
        );
      }
    }
  }

  return <div className="board">{cells}</div>;
}
