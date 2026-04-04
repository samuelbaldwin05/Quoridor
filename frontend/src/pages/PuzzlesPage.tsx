import { useState, useMemo } from 'react';
import { NavSidebar } from '@/components/NavSidebar';
import { GameBoard } from '@/components/GameBoard';
import { FencePanel } from '@/components/FencePanel';
import { GameCard } from '@/components/GameCard';
import { applyMove } from '@/engine/gameEngine';
import { getValidPawnMoves } from '@/engine/moveValidation';
import type { GameState, Move, Position, Wall } from '@/engine/gameTypes';

interface Puzzle {
  id: number;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  objective: string;
  initialState: GameState;
  solutions: Move[];  // any of these is correct
}

// ── Wall helper ───────────────────────────────────────────────────────────────
function w(row: number, col: number, orientation: 'h' | 'v'): Wall {
  return { row, col, orientation };
}

// ── Puzzle bank ───────────────────────────────────────────────────────────────
const PUZZLES: Puzzle[] = [
  {
    id: 1,
    title: 'Leapfrog',
    description:
      'Your opponent stands between you and glory. A well-timed jump clears the path in one move.',
    difficulty: 'easy',
    objective: 'White to move and win in 1',
    solutions: [{ kind: 'pawn', to: { row: 0, col: 4 } }],
    initialState: {
      players: [
        { position: { row: 2, col: 4 }, wallsRemaining: 6, goalRow: 0 },
        { position: { row: 1, col: 4 }, wallsRemaining: 6, goalRow: 8 },
      ],
      walls: [
        w(3, 2, 'h'), w(3, 5, 'h'),
        w(5, 3, 'v'), w(5, 5, 'v'),
      ],
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
    },
  },
  {
    id: 2,
    title: 'Find the Angle',
    description:
      "Your opponent sits on the goal line and a wall blocks the obvious diagonal. There's still a way through — look right.",
    difficulty: 'easy',
    objective: 'White to move and win in 1',
    // solution: diagonal-right jump from (1,4) over (0,4) → lands at (0,5)
    solutions: [{ kind: 'pawn', to: { row: 0, col: 5 } }],
    initialState: {
      players: [
        { position: { row: 1, col: 4 }, wallsRemaining: 5, goalRow: 0 },
        { position: { row: 0, col: 4 }, wallsRemaining: 7, goalRow: 8 },
      ],
      walls: [
        w(0, 3, 'v'),   // blocks left diagonal (0,4)→(0,3)
        w(2, 3, 'h'),   // visual complexity
        w(2, 5, 'h'),   // visual complexity
        w(4, 2, 'v'),
      ],
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
    },
  },
  {
    id: 3,
    title: 'Corner Squeeze',
    description:
      'Cornered on the right edge with a wall cutting off the natural escape. The other diagonal is still open.',
    difficulty: 'medium',
    objective: 'White to move and win in 1',
    // solution: diagonal-left jump from (1,7) over (0,7) → lands at (0,6)
    solutions: [{ kind: 'pawn', to: { row: 0, col: 6 } }],
    initialState: {
      players: [
        { position: { row: 1, col: 7 }, wallsRemaining: 4, goalRow: 0 },
        { position: { row: 0, col: 7 }, wallsRemaining: 5, goalRow: 8 },
      ],
      walls: [
        w(0, 7, 'v'),   // blocks right diagonal (0,7)→(0,8)
        w(2, 5, 'h'),
        w(3, 6, 'v'),
        w(4, 5, 'h'),
        w(1, 5, 'v'),
      ],
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
    },
  },
  {
    id: 4,
    title: 'Red Herring',
    description:
      "A wall on the left looks like it seals you in — but it only blocks a step, not a jump. Find the move the wall doesn't stop.",
    difficulty: 'medium',
    objective: 'White to move and win in 1',
    // solution: diagonal-left jump from (1,1) over (0,1) → lands at (0,0)
    // trick: wall at (1,0,v) blocks lateral step (1,1)→(1,0), looks like left is sealed
    //        wall at (0,1,v) blocks right diagonal (0,1)→(0,2)
    //        but (0,1)→(0,0) is NOT blocked by (1,0,v)
    solutions: [{ kind: 'pawn', to: { row: 0, col: 0 } }],
    initialState: {
      players: [
        { position: { row: 1, col: 1 }, wallsRemaining: 5, goalRow: 0 },
        { position: { row: 0, col: 1 }, wallsRemaining: 4, goalRow: 8 },
      ],
      walls: [
        w(0, 1, 'v'),   // blocks right diagonal jump (0,1)→(0,2)
        w(1, 0, 'v'),   // red herring: blocks lateral step left but NOT the jump landing
        w(2, 1, 'h'),
        w(3, 2, 'v'),
        w(4, 0, 'h'),
      ],
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
    },
  },
  {
    id: 5,
    title: 'The Labyrinth',
    description:
      'Walls on the left block every obvious escape — both the step and the jump. But the right side tells a different story. Search carefully.',
    difficulty: 'hard',
    objective: 'White to move and win in 1',
    // solution: diagonal-right jump from (1,4) over (0,4) → (0,5)
    // trick: wall (0,3,v) blocks left jump diagonal (0,4)→(0,3)
    //        wall (1,3,v) blocks lateral step left (1,4)→(1,3) [looks like left is completely shut]
    //        wall (1,5,h) blocks retreat to row 2 via col 5/6 (confusing)
    //        right diagonal (0,4)→(0,5) is still open
    solutions: [{ kind: 'pawn', to: { row: 0, col: 5 } }],
    initialState: {
      players: [
        { position: { row: 1, col: 4 }, wallsRemaining: 3, goalRow: 0 },
        { position: { row: 0, col: 4 }, wallsRemaining: 4, goalRow: 8 },
      ],
      walls: [
        w(0, 3, 'v'),   // blocks left diagonal jump (0,4)→(0,3)
        w(1, 3, 'v'),   // red herring: blocks lateral step (1,4)→(1,3)
        w(2, 3, 'h'),   // visual noise
        w(1, 5, 'h'),   // blocks (2,5)→(1,5) — visual noise
        w(3, 4, 'v'),   // visual noise
        w(4, 3, 'v'),   // visual noise
      ],
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
    },
  },
];

type PuzzleStatus = 'idle' | 'correct' | 'incorrect';

const DIFFICULTY_COLORS: Record<Puzzle['difficulty'], string> = {
  easy: '#2ecc71',
  medium: '#f39c12',
  hard: '#e74c3c',
};

export function PuzzlesPage() {
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [puzzleState, setPuzzleState] = useState<GameState>(PUZZLES[0]!.initialState);
  const [status, setStatus] = useState<PuzzleStatus>('idle');
  const [wallPreview, setWallPreview] = useState<Wall | null>(null);

  const currentPuzzle = PUZZLES[puzzleIndex]!;

  const validPawnMoves = useMemo(
    () =>
      status === 'idle' && puzzleState.status === 'playing'
        ? getValidPawnMoves(puzzleState, 0)
        : [],
    [puzzleState, status],
  );

  function checkSolution(move: Move): boolean {
    return currentPuzzle.solutions.some((sol) => {
      if (sol.kind !== move.kind) return false;
      if (sol.kind === 'pawn' && move.kind === 'pawn') {
        return sol.to.row === move.to.row && sol.to.col === move.to.col;
      }
      if (sol.kind === 'wall' && move.kind === 'wall') {
        return (
          sol.wall.row === move.wall.row &&
          sol.wall.col === move.wall.col &&
          sol.wall.orientation === move.wall.orientation
        );
      }
      return false;
    });
  }

  function handleCellClick(pos: Position) {
    if (status !== 'idle') return;
    const move: Move = { kind: 'pawn', to: pos };
    const result = applyMove(puzzleState, move);
    if (!result.valid) return;
    setPuzzleState(result.nextState);
    setStatus(checkSolution(move) ? 'correct' : 'incorrect');
  }

  function handleWallHover(wall: Wall | null) {
    if (status !== 'idle') {
      setWallPreview(null);
      return;
    }
    setWallPreview(wall);
  }

  function handleWallClick(wall: Wall) {
    if (status !== 'idle') return;
    const move: Move = { kind: 'wall', wall };
    const result = applyMove(puzzleState, move);
    if (!result.valid) return;
    setPuzzleState(result.nextState);
    setWallPreview(null);
    setStatus(checkSolution(move) ? 'correct' : 'incorrect');
  }

  function handleReset() {
    setPuzzleState(currentPuzzle.initialState);
    setStatus('idle');
    setWallPreview(null);
  }

  function goToPuzzle(index: number) {
    const next = PUZZLES[index];
    if (!next) return;
    setPuzzleIndex(index);
    setPuzzleState(next.initialState);
    setStatus('idle');
    setWallPreview(null);
  }

  const diffColor = DIFFICULTY_COLORS[currentPuzzle.difficulty];

  return (
    <div className="game-layout">
      <NavSidebar activePage="puzzles" />

      <div className="main-content">
        <div className="board-section">
          <GameCard
            opponentLabel="Puzzle"
            gameStatus={puzzleState.status}
            onShowSettings={() => {}}
            onResign={() => {}}
          >
            <div className="board-wrapper">
              <GameBoard
                gameState={puzzleState}
                validPawnMoves={validPawnMoves}
                wallPreview={status === 'idle' ? wallPreview : null}
                isHumanTurn={status === 'idle' && puzzleState.currentPlayerIndex === 0}
                clickMoveEnabled={true}
                onCellClick={handleCellClick}
                onWallHover={handleWallHover}
                onWallClick={handleWallClick}
              />
              <FencePanel
                playerFences={puzzleState.players[0].wallsRemaining}
                computerFences={puzzleState.players[1].wallsRemaining}
              />
            </div>
          </GameCard>

          {/* Puzzle right panel */}
          <div className="right-panel puzzle-panel">
            <div className="puzzle-panel-body">
              {/* Header with nav */}
              <div className="puzzle-nav-row">
                <button
                  className="btn puzzle-nav-btn"
                  onClick={() => goToPuzzle(puzzleIndex - 1)}
                  disabled={puzzleIndex === 0}
                  aria-label="Previous puzzle"
                >
                  ←
                </button>
                <span className="puzzle-counter">
                  {puzzleIndex + 1} / {PUZZLES.length}
                </span>
                <button
                  className="btn puzzle-nav-btn"
                  onClick={() => goToPuzzle(puzzleIndex + 1)}
                  disabled={puzzleIndex === PUZZLES.length - 1}
                  aria-label="Next puzzle"
                >
                  →
                </button>
              </div>

              <div className="puzzle-difficulty-badge" style={{ color: diffColor, borderColor: diffColor }}>
                {currentPuzzle.difficulty.toUpperCase()}
              </div>

              <p className="play-panel-heading">Puzzle #{currentPuzzle.id}</p>
              <h3 className="puzzle-title">{currentPuzzle.title}</h3>
              <p className="puzzle-description">{currentPuzzle.description}</p>

              <div className="puzzle-hint">
                <span className="puzzle-hint-label">Objective:</span>{' '}
                {currentPuzzle.objective}
              </div>
            </div>

            <div className="puzzle-panel-footer">
              {status === 'idle' && (
                <p className="puzzle-waiting">Make your move on the board.</p>
              )}
              {status === 'correct' && (
                <div className="puzzle-result puzzle-correct">
                  <span className="puzzle-result-icon">✓</span>
                  <span>Correct! Well done.</span>
                </div>
              )}
              {status === 'incorrect' && (
                <div className="puzzle-result puzzle-incorrect">
                  <span className="puzzle-result-icon">✗</span>
                  <span>Not quite. Try again!</span>
                </div>
              )}

              <button className="btn play-panel-play-btn" onClick={handleReset}>
                Reset
              </button>

              {status === 'correct' && puzzleIndex < PUZZLES.length - 1 && (
                <button
                  className="btn btn-primary play-panel-play-btn"
                  onClick={() => goToPuzzle(puzzleIndex + 1)}
                >
                  Next Puzzle →
                </button>
              )}
              {status === 'correct' && puzzleIndex === PUZZLES.length - 1 && (
                <p className="puzzle-waiting" style={{ color: '#2ecc71', opacity: 1 }}>
                  🎉 All puzzles complete!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
