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
    case 'bot0':
      return 'Bot 0 - Movement Only (retired)';
    case 'bot1':
      return 'Easy - Basic Strategic';
    case 'bot2':
      return 'Medium - Advantage Focused';
    case 'extreme':
      return 'Hard - PPO Neural Net';
    case 'mcts':
      return 'Extreme - MCTS Engine';
  }
}

function getMoveCount(ctx: AiContext): number {
  if (ctx.difficulty === 'bot1') return ctx.bot1.moveCount;
  if (ctx.difficulty === 'bot2') return ctx.bot2.moveCount;
  if (ctx.difficulty === 'mcts') return ctx.mcts.moveCount;
  return 0;
}

// Where the last engine move came from and how much search went into it. The source matters:
// a silent fall back from the server to the in-browser engine changes the bot's strength, and
// without this the only symptom is that it plays slightly worse.
function EngineStatsRows({ ctx }: { ctx: AiContext }) {
  if (ctx.difficulty !== 'mcts' || ctx.mcts.lastStats === null) return null;
  const stats = ctx.mcts.lastStats;
  const rate = stats.elapsedMs > 0 ? Math.round((stats.iterations * 1000) / stats.elapsedMs) : null;

  return (
    <>
      <div className="stat-item flex-between">
        <span className="stat-label">Engine:</span>
        <span>
          {stats.source}
          {stats.cached ? ' (cached)' : ''}
        </span>
      </div>
      <div className="stat-item flex-between">
        <span className="stat-label">Iterations:</span>
        <span>
          {stats.iterations}
          {stats.targetIterations > 0 ? ` / ${stats.targetIterations}` : ''}
        </span>
      </div>
      <div className="stat-item flex-between">
        <span className="stat-label">Search:</span>
        <span>
          {stats.elapsedMs}ms{rate !== null ? ` (${rate}/s)` : ''}
          {stats.threads > 1 ? `, ${stats.threads}t` : ''}
        </span>
      </div>
      <div className="stat-item flex-between">
        <span className="stat-label">Build:</span>
        <span>{stats.engineCommit}</span>
      </div>
    </>
  );
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
      <EngineStatsRows ctx={aiContext} />
    </div>
  );
}
