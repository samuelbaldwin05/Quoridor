interface BoardCellProps {
  row: number;
  col: number;
  occupant: 0 | 1 | null;
  isValidMove: boolean;
  /** Tapped once in confirm mode: proposed, not played. A second tap commits it. */
  isPending: boolean;
  isHumanTurn: boolean;
  clickMoveEnabled: boolean;
  onClick: () => void;
}

export function BoardCell({
  row,
  col,
  occupant,
  isValidMove,
  isPending,
  isHumanTurn,
  clickMoveEnabled,
  onClick,
}: BoardCellProps) {
  const classes = [
    'cell',
    occupant === 0 ? 'player1' : '',
    occupant === 1 ? 'player2' : '',
    isValidMove && isHumanTurn ? 'valid-move' : '',
    isPending && isHumanTurn ? 'pending-move' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Board cell (r, c) lives at grid-row r*2+1, grid-column c*2+1 (1-indexed, odd tracks)
  const gridStyle: React.CSSProperties = {
    gridRow: row * 2 + 1,
    gridColumn: col * 2 + 1,
  };

  // Only an actionable cell (a valid move on the human's turn, with click moves
  // enabled) responds to keyboard activation — a cell focused despite tabIndex=-1
  // must not be able to trigger an invalid move.
  const keyboardActionable = clickMoveEnabled && isValidMove && isHumanTurn;

  return (
    <div
      className={classes}
      style={gridStyle}
      data-row={row}
      data-col={col}
      onClick={clickMoveEnabled ? onClick : undefined}
      role="button"
      tabIndex={isValidMove && isHumanTurn ? 0 : -1}
      onKeyDown={
        keyboardActionable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={`Cell ${row},${col}${occupant !== null ? ` (player ${occupant + 1})` : ''}${isValidMove ? ' - valid move' : ''}${isPending ? ' - selected, activate again to move here' : ''}`}
    />
  );
}
