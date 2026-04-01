interface ScoreboardProps {
  playerScore: number;
  computerScore: number;
}

export function Scoreboard({ playerScore, computerScore }: ScoreboardProps) {
  return (
    <div className="panel fence-info flex flex-center flex-gap-sm" id="scoreboard">
      <span className="score-label player2-color">Player</span>
      <span className="score-number">{playerScore}</span>
      <span className="score-separator">-</span>
      <span className="score-number">{computerScore}</span>
      <span className="score-label player1-color">Computer</span>
    </div>
  );
}
