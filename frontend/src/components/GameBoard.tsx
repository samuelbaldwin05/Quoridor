import { isValidWallPlacement } from '@/engine/moveValidation';
import { wallsEqual } from '@/engine/wallUtils';
import type { GameState, Position, Wall } from '@/engine/gameTypes';
import { BoardCell } from './BoardCell';
import { WallSlot } from './WallSlot';

const COL_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const ROW_LABELS = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];

interface GameBoardProps {
  gameState: GameState;
  validPawnMoves: Position[];
  wallPreview: Wall | null;
  isHumanTurn: boolean;
  clickMoveEnabled: boolean;
  flipped?: boolean;
  onCellClick: (pos: Position) => void;
  onWallHover: (wall: Wall | null) => void;
  onWallClick: (wall: Wall) => void;
}

export function GameBoard({
  gameState,
  validPawnMoves,
  wallPreview,
  isHumanTurn,
  clickMoveEnabled,
  flipped = false,
  onCellClick,
  onWallHover,
  onWallClick,
}: GameBoardProps) {
  const elements: React.ReactElement[] = [];

  // 9x9 board cells — flow naturally in the CSS grid
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const occupant =
        gameState.players[0].position.row === row && gameState.players[0].position.col === col
          ? (0 as const)
          : gameState.players[1].position.row === row && gameState.players[1].position.col === col
            ? (1 as const)
            : null;

      const isValidMove = validPawnMoves.some((p) => p.row === row && p.col === col);

      elements.push(
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
    }
  }

  // Wall slots — absolutely positioned overlays, one per valid wall position.
  // Each covers the full 2-cell span including the groove intersection.
  for (const orientation of ['h', 'v'] as const) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const wall: Wall = { row, col, orientation };

        const isPlaced = gameState.walls.some((w) => wallsEqual(w, wall));

        let previewState: 'valid' | 'invalid' | null = null;
        if (!isPlaced && wallPreview && wallsEqual(wallPreview, wall)) {
          previewState = isValidWallPlacement(gameState, wall) ? 'valid' : 'invalid';
        }

        elements.push(
          <WallSlot
            key={`${orientation}-${row}-${col}`}
            wall={wall}
            isPlaced={isPlaced}
            previewState={previewState}
            onMouseEnter={() => onWallHover(wall)}
            onMouseLeave={() => onWallHover(null)}
            onClick={() => onWallClick(wall)}
          />,
        );
      }
    }
  }

  const colLabels = flipped ? [...COL_LABELS].reverse() : COL_LABELS;
  const rowLabels = flipped ? [...ROW_LABELS].reverse() : ROW_LABELS;

  return (
    <div className="board-with-axes">
      {/* Left axis — row numbers */}
      <div className="board-axis-y">
        {rowLabels.map((r) => (
          <span key={r} className="board-axis-label">
            {r}
          </span>
        ))}
      </div>

      <div className="board-axis-main">
        <div className={`board${flipped ? ' board-flipped' : ''}`}>{elements}</div>

        {/* Bottom axis — column letters */}
        <div className="board-axis-x">
          {colLabels.map((c) => (
            <span key={c} className="board-axis-label">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
