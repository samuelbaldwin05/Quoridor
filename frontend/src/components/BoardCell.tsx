interface BoardCellProps {
  row: number;
  col: number;
  occupant: 0 | 1 | null;
  isValidMove: boolean;
  isHumanTurn: boolean;
  clickMoveEnabled: boolean;
  onClick: () => void;
}

export function BoardCell({
  row,
  col,
  occupant,
  isValidMove,
  isHumanTurn,
  clickMoveEnabled,
  onClick,
}: BoardCellProps) {
  const classes = [
    'cell',
    occupant === 0 ? 'player1' : '',
    occupant === 1 ? 'player2' : '',
    isValidMove && isHumanTurn ? 'valid-move' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-row={row}
      data-col={col}
      onClick={clickMoveEnabled ? onClick : undefined}
      role="button"
      tabIndex={isValidMove && isHumanTurn ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      aria-label={`Cell ${row},${col}${occupant !== null ? ` (player ${occupant + 1})` : ''}${isValidMove ? ' - valid move' : ''}`}
    />
  );
}
