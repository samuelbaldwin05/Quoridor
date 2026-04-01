import { dijkstraDistance } from '@/ai/pathfinder';
import type { AiContext } from '@/ai/aiTypes';
import type { GameState } from '@/engine/gameTypes';

interface DevStatsProps {
  visible: boolean;
  gameState: GameState;
  aiContext: AiContext;
}

function getDifficultyName(ctx: AiContext): string {
  switch (ctx.difficulty) {
    case 'bot0': return 'Bot 0 - Movement Only';
    case 'bot1': return 'Bot 1 - Basic Strategic';
    case 'bot2': return 'Bot 2 - Advantage Focused';
  }
}

function getMoveCount(ctx: AiContext): number {
  if (ctx.difficulty === 'bot1') return ctx.bot1.moveCount;
  if (ctx.difficulty === 'bot2') return ctx.bot2.moveCount;
  return 0;
}

export function DevStats({ visible, gameState, aiContext }: DevStatsProps) {
  if (!visible) return null;

  const humanPath =
    gameState.status === 'playing'
      ? dijkstraDistance(gameState, gameState.players[0].position, gameState.players[0].goalRow)
      : 0;

  const aiPath =
    gameState.status === 'playing'
      ? dijkstraDistance(gameState, gameState.players[1].position, gameState.players[1].goalRow)
      : 0;

  const advantage =
    gameState.status === 'playing'
      ? isFinite(humanPath) && isFinite(aiPath)
        ? humanPath - aiPath
        : 0
      : 0;

  return (
    <div className="dev-stats">
      <div className="stat-item flex-between">
        <span className="stat-label">Bot:</span>
        <span>{getDifficultyName(aiContext)}</span>
      </div>
      <div className="stat-item flex-between">
        <span className="stat-label">Move:</span>
        <span>{getMoveCount(aiContext)}</span>
      </div>
      <div className="stat-item flex-between">
        <span className="stat-label">Human Path:</span>
        <span>{isFinite(humanPath) ? humanPath.toFixed(1) : '∞'}</span>
      </div>
      <div className="stat-item flex-between">
        <span className="stat-label">AI Path:</span>
        <span>{isFinite(aiPath) ? aiPath.toFixed(1) : '∞'}</span>
      </div>
      <div className="stat-item flex-between">
        <span className="stat-label">Advantage:</span>
        <span>{isFinite(advantage) ? advantage.toFixed(1) : '∞'}</span>
      </div>
    </div>
  );
}
