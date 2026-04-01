interface FenceCounterProps {
  playerFences: number;
  computerFences: number;
}

export function FenceCounter({ playerFences, computerFences }: FenceCounterProps) {
  return (
    <div className="panel fence-info">
      <div className="fence-count-display">
        <span className="player-label player2-color">Player:</span>{' '}
        <span>{playerFences}</span> fences
      </div>
      <div className="fence-count-display">
        <span className="player-label player1-color">Computer:</span>{' '}
        <span>{computerFences}</span> fences
      </div>
    </div>
  );
}
