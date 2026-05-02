export const BOARD_SIZE = 9;
export const INITIAL_WALL_COUNT = 10;
export const PLAYER_STARTS = [
  { row: 8, col: 4, goalRow: 0 }, // player 0 (human)
  { row: 0, col: 4, goalRow: 8 }, // player 1 (computer)
] as const;

export const AI_MOVE_DELAY_MS = 1000;
export const MESSAGE_TIMEOUT_MS = 3000;

export const AI_CONFIG = {
  BOT2_OPENING_CHANCE: 0.75,
  BOT1_RANDOM_CHANCE: 0.5,
  BOT2_OPENING_MOVES: 1,
  BOT1_RANDOM_MOVES: 3,
  HIGH_IMPACT_THRESHOLD: 3,
  OPPONENT_DISTANCE_THRESHOLD: 3,
  OPPONENT_ROW_THRESHOLD: 4,
  BOT1_STRATEGIC_ROW_THRESHOLD: 6,
  FENCE_PROXIMITY_PENALTIES: {
    ADJACENT: 0.1,
    NEAR: 0.05,
    MEDIUM: 0.03,
    FAR: 0.01,
    NONE: 0,
  },
  OPPOSING_PLAYER_PENALTY: 0.1,
} as const;
