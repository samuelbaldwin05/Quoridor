import type { EngineStats } from '@/ai/mcts/mctsTypes';
import type { Move, Position } from '@/engine/gameTypes';

export type BotDifficulty = 'bot0' | 'bot1' | 'bot2' | 'extreme' | 'mcts';

export interface AiDecision {
  move: Move;
  message: string;
}

export interface Bot1Context {
  moveCount: number;
  previousPosition: Position | null;
}

export interface Bot2Context {
  moveCount: number;
  openingPattern: string[] | null;
  openingStep: number;
}

/** Kept so dev stats can show what the last search actually did. */
export interface MctsContext {
  moveCount: number;
  lastStats: EngineStats | null;
}

export type AiContext =
  | { difficulty: 'bot0' }
  | { difficulty: 'bot1'; bot1: Bot1Context }
  | { difficulty: 'bot2'; bot2: Bot2Context }
  | { difficulty: 'extreme' }
  | { difficulty: 'mcts'; mcts: MctsContext };

export function createAiContext(difficulty: BotDifficulty): AiContext {
  if (difficulty === 'bot0') {
    return { difficulty: 'bot0' };
  } else if (difficulty === 'bot1') {
    return { difficulty: 'bot1', bot1: { moveCount: 0, previousPosition: null } };
  } else if (difficulty === 'bot2') {
    return {
      difficulty: 'bot2',
      bot2: { moveCount: 0, openingPattern: null, openingStep: 0 },
    };
  } else if (difficulty === 'mcts') {
    return { difficulty: 'mcts', mcts: { moveCount: 0, lastStats: null } };
  }
  return { difficulty: 'extreme' };
}
