interface WinLoseModalProps {
  isOpen: boolean;
  winner: 0 | 1 | null;
  savedGameId: string | null;
  onPlayAgain: () => void;
  onAnalyze: (gameId: string) => void;
}

export function WinLoseModal({
  isOpen,
  winner,
  savedGameId,
  onPlayAgain,
  onAnalyze,
}: WinLoseModalProps) {
  if (!isOpen || winner === null) return null;

  const didWin = winner === 0;

  return (
    <div className="modal flex-center">
      <div className="win-lose-modal">
        <h1 className={`win-lose-title ${didWin ? 'win-lose-win' : 'win-lose-lose'}`}>
          {didWin ? 'You Win!' : 'You Lose!'}
        </h1>
        <div className="win-lose-buttons">
          <button className="btn action-btn" onClick={onPlayAgain}>
            Play Again
          </button>
          <button
            className="btn action-btn win-lose-analyze-btn"
            onClick={() => savedGameId && onAnalyze(savedGameId)}
            disabled={!savedGameId}
          >
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
}
