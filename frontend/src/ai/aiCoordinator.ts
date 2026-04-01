import type { AiContext, AiDecision } from './aiTypes';
import { makeBot0Move } from './bots/bot0';
import { makeBot1Move } from './bots/bot1';
import { makeBot2Move } from './bots/bot2';
import type { GameState } from '@/engine/gameTypes';

// AI always plays as player index 1
const AI_PLAYER_INDEX = 1 as const;

export function makeAiMove(
  state: GameState,
  context: AiContext,
): { decision: AiDecision | null; nextContext: AiContext } {
  if (context.difficulty === 'bot0') {
    const decision = makeBot0Move(state, AI_PLAYER_INDEX);
    return { decision, nextContext: context };
  } else if (context.difficulty === 'bot1') {
    const decision = makeBot1Move(state, AI_PLAYER_INDEX, context.bot1);
    const nextContext: AiContext = {
      difficulty: 'bot1',
      bot1: {
        moveCount: context.bot1.moveCount + 1,
        previousPosition: { ...state.players[AI_PLAYER_INDEX].position },
      },
    };
    return { decision, nextContext };
  } else {
    const { decision, nextCtx } = makeBot2Move(state, AI_PLAYER_INDEX, context.bot2);
    const nextContext: AiContext = {
      difficulty: 'bot2',
      bot2: {
        ...nextCtx,
        moveCount: context.bot2.moveCount + 1,
      },
    };
    return { decision, nextContext };
  }
}
