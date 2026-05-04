interface WinLoseModalProps {
  isOpen: boolean;
  winner: 0 | 1 | null;
  savedGameId: string | null;
  onPlayAgain: () => void;
  onAnalyze: (gameId: string) => void;
  onClose: () => void;
}

export function WinLoseModal({
  isOpen,
  winner,
  savedGameId,
  onPlayAgain,
  onAnalyze,
  onClose,
}: WinLoseModalProps) {
  if (!isOpen || winner === null) return null;

  const didWin = winner === 0;

  return (
    <div className="win-lose-overlay flex-center" onClick={onClose}>
      <div className="win-lose-modal" onClick={(e) => e.stopPropagation()}>
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
