interface FencePanelProps {
  playerFences: number;
  computerFences: number;
  /** When true, label colours swap so the near player shows red instead of blue */
  flipped?: boolean;
}

export function FencePanel({ playerFences, computerFences, flipped = false }: FencePanelProps) {
  const myLabelColor       = flipped ? 'var(--player2-color)' : 'var(--player1-color)';
  const opponentLabelColor = flipped ? 'var(--player1-color)' : 'var(--player2-color)';

  return (
    <div className="fence-panel">
      {/* Opponent fences — top */}
      <div className="fence-section">
        <span className="fence-section-label" style={{ color: opponentLabelColor }}>
          Fences: {computerFences}
        </span>
        <div className="fence-pieces">
          {Array.from({ length: computerFences }).map((_, i) => (
            <div key={i} className="fence-piece" />
          ))}
        </div>
      </div>

      {/* My fences — bottom (margin-top:auto pushes this to the bottom) */}
      <div className="fence-section fence-section-bottom">
        <div className="fence-pieces">
          {Array.from({ length: playerFences }).map((_, i) => (
            <div key={i} className="fence-piece" />
          ))}
        </div>
        <span className="fence-section-label" style={{ color: myLabelColor }}>
          Fences: {playerFences}
        </span>
      </div>
    </div>
  );
}
