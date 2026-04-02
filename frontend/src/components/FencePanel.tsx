interface FencePanelProps {
  playerFences: number;
  computerFences: number;
}

export function FencePanel({ playerFences, computerFences }: FencePanelProps) {
  return (
    <div className="fence-panel">
      <div className="fence-section">
        <span className="fence-section-label fence-label-computer">
          Fences: {computerFences}
        </span>
        <div className="fence-pieces">
          {Array.from({ length: computerFences }).map((_, i) => (
            <div key={i} className="fence-piece fence-piece-computer" />
          ))}
        </div>
      </div>

      <div className="fence-section fence-section-bottom">
        <div className="fence-pieces">
          {Array.from({ length: playerFences }).map((_, i) => (
            <div key={i} className="fence-piece fence-piece-player" />
          ))}
        </div>
        <span className="fence-section-label fence-label-player">
          Fences: {playerFences}
        </span>
      </div>
    </div>
  );
}
