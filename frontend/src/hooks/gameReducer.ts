import { makeAiMove } from '@/ai/aiCoordinator';
import { createAiContext, type AiContext, type AiDecision } from '@/ai/aiTypes';
import { applyMove, checkWin, createInitialState } from '@/engine/gameEngine';
import type { GameState, Move, PlayerIndex, StoredMove } from '@/engine/gameTypes';
import { saveGame } from '@/lib/gameStorage';
import { saveSettings } from '@/lib/settingsStorage';
import type { Settings } from '@/lib/schemas/settingsSchemas';

// Labels shifted down a tier when 'bot0' was retired from selection. The ids are storage keys,
// so they did not move; 'bot0' stays here to label games played before the change.
const DIFFICULTY_LABELS: Record<Settings['difficulty'], string> = {
  bot0: 'Beginner Bot (retired)',
  bot1: 'Easy Bot',
  bot2: 'Medium Bot',
  extreme: 'Hard Bot',
  mcts: 'Extreme Bot',
};

function getOpponentLabel(settings: Settings): string {
  if (settings.gameMode === 'pass-and-play') return 'Pass & Play';
  return DIFFICULTY_LABELS[settings.difficulty];
}

export interface FullState {
  game: GameState;
  score: { player: number; computer: number };
  message: { text: string; kind: 'info' | 'success' | 'error' } | null;
  aiContext: AiContext;
  settings: Settings;
  moveHistory: StoredMove[];
  lastSavedGameId: string | null;
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'NEW_GAME' }
  | { type: 'APPLY_MOVE'; move: Move }
  | { type: 'APPLY_AI_MOVE'; decision: AiDecision; nextAiContext: AiContext }
  | { type: 'APPLY_ONLINE_MOVE'; move: Move; playerIndex: PlayerIndex }
  | { type: 'RESIGN' }
  | { type: 'RESIGN_ONLINE'; winner: PlayerIndex }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'RESET_SCORE' }
  | { type: 'RESET_TO_IDLE' }
  | { type: 'SHOW_MESSAGE'; text: string; kind: 'info' | 'success' | 'error' }
  | { type: 'CLEAR_MESSAGE' };

export function createInitialFullState(settings: Settings): FullState {
  return {
    game: createInitialState(),
    score: { player: 0, computer: 0 },
    message: { text: 'Click "Start Game" to begin!', kind: 'info' },
    aiContext: createAiContext(settings.difficulty),
    settings,
    moveHistory: [],
    lastSavedGameId: null,
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
        moveHistory: [],
        lastSavedGameId: null,
      };
    }

    case 'NEW_GAME': {
      const freshGame = createInitialState();
      return {
        ...state,
        game: { ...freshGame, status: 'playing' },
        aiContext: createAiContext(state.settings.difficulty),
        message: { text: 'New game started! Your move.', kind: 'info' },
        moveHistory: [],
        lastSavedGameId: null,
      };
    }

    case 'APPLY_MOVE': {
      if (state.game.status !== 'playing') return state;
      const isPassAndPlay = state.settings.gameMode === 'pass-and-play';
      if (!isPassAndPlay && state.game.currentPlayerIndex !== 0) return state;

      const result = applyMove(state.game, action.move);
      if (!result.valid) {
        return { ...state, message: { text: 'Invalid move!', kind: 'error' } };
      }

      const storedMove: StoredMove = {
        move: action.move,
        playerIndex: state.game.currentPlayerIndex,
        timestamp: Date.now(),
      };
      const newHistory = [...state.moveHistory, storedMove];

      let newScore = state.score;
      let message = state.message;
      let lastSavedGameId = state.lastSavedGameId;

      const winner = checkWin(result.nextState);
      if (winner !== null) {
        if (winner === 0) {
          newScore = { ...newScore, player: newScore.player + 1 };
          message = { text: 'You win! Congratulations!', kind: 'success' };
        } else {
          newScore = { ...newScore, computer: newScore.computer + 1 };
          message = { text: 'Computer wins! Better luck next time.', kind: 'error' };
        }
        lastSavedGameId = saveGame(newHistory, winner, getOpponentLabel(state.settings));
      } else {
        message = null;
      }

      return {
        ...state,
        game: result.nextState,
        score: newScore,
        message,
        moveHistory: newHistory,
        lastSavedGameId,
      };
    }

    case 'APPLY_AI_MOVE': {
      const { decision, nextAiContext } = action;
      const result = applyMove(state.game, decision.move);
      if (!result.valid) {
        return { ...state, aiContext: nextAiContext };
      }

      const storedMove: StoredMove = {
        move: decision.move,
        playerIndex: 1,
        timestamp: Date.now(),
      };
      const newHistory = [...state.moveHistory, storedMove];

      let newScore = state.score;
      let message: FullState['message'] = null;
      let lastSavedGameId = state.lastSavedGameId;

      const winner = checkWin(result.nextState);
      if (winner !== null) {
        if (winner === 0) {
          newScore = { ...newScore, player: newScore.player + 1 };
          message = { text: 'You win! Congratulations!', kind: 'success' };
        } else {
          newScore = { ...newScore, computer: newScore.computer + 1 };
          message = { text: 'Computer wins! Better luck next time.', kind: 'error' };
        }
        lastSavedGameId = saveGame(newHistory, winner, getOpponentLabel(state.settings));
      }

      return {
        ...state,
        game: result.nextState,
        score: newScore,
        message,
        aiContext: nextAiContext,
        moveHistory: newHistory,
        lastSavedGameId,
      };
    }

    case 'APPLY_ONLINE_MOVE': {
      // No turn gating — applies any player's move for online multiplayer.
      // Does not save locally or update score (handled server-side).
      if (state.game.status !== 'playing') return state;
      const result = applyMove(state.game, action.move);
      if (!result.valid) return state;

      const storedMove: StoredMove = {
        move: action.move,
        playerIndex: action.playerIndex,
        timestamp: Date.now(),
      };

      const winner = checkWin(result.nextState);
      const nextGame: GameState =
        winner !== null ? { ...result.nextState, status: 'finished', winner } : result.nextState;

      return { ...state, game: nextGame, moveHistory: [...state.moveHistory, storedMove] };
    }

    case 'RESIGN_ONLINE': {
      if (state.game.status !== 'playing') return state;
      return {
        ...state,
        game: { ...state.game, status: 'finished', winner: action.winner },
      };
    }

    case 'RESIGN': {
      if (state.game.status !== 'playing') return state;
      const finishedGame: GameState = {
        ...state.game,
        status: 'finished',
        winner: 1,
      };
      const newScore = { ...state.score, computer: state.score.computer + 1 };
      const lastSavedGameId = saveGame(state.moveHistory, 1, getOpponentLabel(state.settings));
      return {
        ...state,
        game: finishedGame,
        score: newScore,
        message: { text: 'You resigned. Better luck next time!', kind: 'error' },
        lastSavedGameId,
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

    case 'RESET_TO_IDLE': {
      return { ...state, game: createInitialState() };
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
