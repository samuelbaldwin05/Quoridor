import { NavSidebar } from '@/components/NavSidebar';

export function RulesPage() {
  return (
    <div className="game-layout">
      <NavSidebar activePage="rules" />

      <div className="rules-page">
        <div className="rules-page-content">
          <h1 className="rules-page-title">Quoridor Rules</h1>

          <div className="rules-section">
            <h3>Objective</h3>
            <p>
              Be the first player to reach the <strong>opposite side</strong> of the board —
              that means any square on the far row. You start at the bottom and win by reaching
              the top row. Your opponent starts at the top and wins by reaching the bottom row.
            </p>
            <p>
              On each turn, you can either <strong>move your pawn</strong> one square or{' '}
              <strong>place a fence</strong> to block your opponent.
            </p>
          </div>

          <div className="rules-section">
            <h3>Movement</h3>
            <ul>
              <li>Move one square horizontally or vertically</li>
              <li>
                If the opponent is directly in your path, <strong>jump over</strong> them
              </li>
              <li>
                If you can't jump straight (wall or edge behind them), jump{' '}
                <strong>diagonally</strong> instead
              </li>
              <li>Click on a highlighted square to move, or use WASD keys</li>
            </ul>
          </div>

          <div className="rules-section">
            <h3>Fence Placement</h3>
            <ul>
              <li>Each player starts with <strong>10 fences</strong></li>
              <li>Hover between squares to preview fence placement</li>
              <li><strong>Valid placement:</strong> fence preview appears highlighted</li>
              <li><strong>Invalid placement:</strong> preview appears red</li>
              <li>You cannot place a fence that completely traps your opponent — they must always have a path to their goal</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
