interface FenceCounterProps {
  playerFences: number;
  computerFences: number;
}

export function FenceCounter({ playerFences, computerFences }: FenceCounterProps) {
  return (
    <div className="fence-counter flex flex-between">
      <span className="fence-count player2-color">
        &#9646; <strong>{playerFences}</strong> fences
      </span>
      <span className="fence-count player1-color">
        &#9646; <strong>{computerFences}</strong> fences
      </span>
    </div>
  );
}
