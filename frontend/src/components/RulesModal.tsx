interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RulesModal({ isOpen, onClose }: RulesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal flex-center" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <h2>Quoridor Rules</h2>
        </div>

        <div className="modal-body">
          <div className="rules-section">
            <h3>Objective</h3>
            <p>Be the first player to reach the opposite side of the board.</p>
            <ul>
              <li>
                <strong>Player:</strong> Start at the bottom, reach the top row
              </li>
              <li>
                <strong>Computer:</strong> Starts at the top, reach the bottom row
              </li>
            </ul>
            <p>
              On your turn, you can either <strong>move your pawn</strong> or{' '}
              <strong>place a fence</strong> to block your opponent.
            </p>
          </div>

          <div className="rules-section">
            <h3>Movement</h3>
            <ul>
              <li>Move one square horizontally or vertically</li>
              <li>
                If another pawn blocks your path, you can <strong>jump over</strong> them
              </li>
              <li>
                If you can't jump straight, you can jump <strong>diagonally</strong>
              </li>
              <li>Use the arrow buttons, WASD, or click on the board to move</li>
            </ul>
          </div>

          <div className="rules-section">
            <h3>Fence Placement</h3>
            <ul>
              <li>
                Each player starts with <strong>10 fences</strong>
              </li>
              <li>Hover over fence slots to see placement preview</li>
              <li>
                <span style={{ color: '#cda932' }}>Brown preview</span> = valid placement
              </li>
              <li>
                <span style={{ color: '#DC143C' }}>Red preview</span> = invalid placement
              </li>
              <li>Click on fence slots to place fences</li>
              <li>You cannot completely block an opponent's path to their goal</li>
            </ul>
          </div>

          <div className="rules-section">
            <h3>Winning</h3>
            <p>The first player to reach any square on their target row wins!</p>
          </div>

          <button className="btn action-btn" onClick={onClose}>
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
