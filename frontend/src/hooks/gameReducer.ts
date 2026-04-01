import { makeAiMove } from '@/ai/aiCoordinator';
import { createAiContext, type AiContext, type AiDecision } from '@/ai/aiTypes';
import { applyMove, checkWin, createInitialState } from '@/engine/gameEngine';
import type { GameState, Move } from '@/engine/gameTypes';
import { saveSettings } from '@/lib/settingsStorage';
import type { Settings } from '@/lib/schemas/settingsSchemas';

export interface FullState {
  game: GameState;
  score: { player: number; computer: number };
  message: { text: string; kind: 'info' | 'success' | 'error' } | null;
  aiContext: AiContext;
  settings: Settings;
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'NEW_GAME' }
  | { type: 'APPLY_MOVE'; move: Move }
  | { type: 'APPLY_AI_MOVE'; decision: AiDecision; nextAiContext: AiContext }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'RESET_SCORE' }
  | { type: 'SHOW_MESSAGE'; text: string; kind: 'info' | 'success' | 'error' }
  | { type: 'CLEAR_MESSAGE' };

export function createInitialFullState(settings: Settings): FullState {
  return {
    game: createInitialState(),
    score: { player: 0, computer: 0 },
    message: { text: 'Click "Start Game" to begin!', kind: 'info' },
    aiContext: createAiContext(settings.difficulty),
    settings,
  };
}

export function gameReducer(state: FullState, action: GameAction): FullState {
  switch (action.type) {
    case 'START_GAME': {
      const freshGame = createInitialState();
      return {
        ...state,
        game: { ...freshGame, status: 'playing' },
        aiContext: createAiContext(state.settings.difficulty),
        message: { text: 'Game started! Your move.', kind: 'info' },
      };
    }

    case 'NEW_GAME': {
      const freshGame = createInitialState();
      return {
        ...state,
        game: { ...freshGame, status: 'playing' },
        aiContext: createAiContext(state.settings.difficulty),
        message: { text: 'New game started! Your move.', kind: 'info' },
      };
    }

    case 'APPLY_MOVE': {
      if (state.game.status !== 'playing' || state.game.currentPlayerIndex !== 0) {
        return state;
      }
      const result = applyMove(state.game, action.move);
      if (!result.valid) {
        return { ...state, message: { text: 'Invalid move!', kind: 'error' } };
      }

      let newScore = state.score;
      let message = state.message;

      const winner = checkWin(result.nextState);
      if (winner !== null) {
        if (winner === 0) {
          newScore = { ...newScore, player: newScore.player + 1 };
          message = { text: 'You win! Congratulations!', kind: 'success' };
        } else {
          newScore = { ...newScore, computer: newScore.computer + 1 };
          message = { text: 'Computer wins! Better luck next time.', kind: 'error' };
        }
      } else {
        if (action.move.kind === 'pawn') {
          message = { text: 'You moved. Computer is thinking...', kind: 'info' };
        } else {
          message = { text: 'Fence placed. Computer is thinking...', kind: 'info' };
        }
      }

      return { ...state, game: result.nextState, score: newScore, message };
    }

    case 'APPLY_AI_MOVE': {
      const { decision, nextAiContext } = action;
      const result = applyMove(state.game, decision.move);
      if (!result.valid) {
        return { ...state, aiContext: nextAiContext };
      }

      let newScore = state.score;
      let message: FullState['message'] = { text: decision.message, kind: 'info' };

      const winner = checkWin(result.nextState);
      if (winner !== null) {
        if (winner === 0) {
          newScore = { ...newScore, player: newScore.player + 1 };
          message = { text: 'You win! Congratulations!', kind: 'success' };
        } else {
          newScore = { ...newScore, computer: newScore.computer + 1 };
          message = { text: 'Computer wins! Better luck next time.', kind: 'error' };
        }
      }

      return {
        ...state,
        game: result.nextState,
        score: newScore,
        message,
        aiContext: nextAiContext,
      };
    }

    case 'UPDATE_SETTINGS': {
      const newSettings = { ...state.settings, ...action.patch };
      saveSettings(newSettings);
      // If difficulty changed, reset AI context
      const newAiContext =
        action.patch.difficulty && action.patch.difficulty !== state.settings.difficulty
          ? createAiContext(action.patch.difficulty)
          : state.aiContext;
      return { ...state, settings: newSettings, aiContext: newAiContext };
    }

    case 'RESET_SCORE': {
      return { ...state, score: { player: 0, computer: 0 } };
    }

    case 'SHOW_MESSAGE': {
      return { ...state, message: { text: action.text, kind: action.kind } };
    }

    case 'CLEAR_MESSAGE': {
      return { ...state, message: null };
    }

    default:
      return state;
  }
}

// Export makeAiMove for use in useAi hook
export { makeAiMove };
