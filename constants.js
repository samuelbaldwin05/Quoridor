// Game Constants and Configuration
// Centralized location for all magic numbers and configuration values

const GAME_CONFIG = {
    // Board configuration
    BOARD_SIZE: 9,                    // Size of the game board (9x9 cells)
    GRID_SIZE: 17,                   // Visual grid size (9 cells + 8 fence slots = 17)
    INITIAL_FENCE_COUNT: 10,         // Starting number of fences per player
    
    // Player starting positions and goals
    PLAYER1_START_ROW: 8,
    PLAYER1_START_COL: 4,
    PLAYER1_GOAL_ROW: 0,
    PLAYER2_START_ROW: 0,
    PLAYER2_START_COL: 4,
    PLAYER2_GOAL_ROW: 8,
    
    // Timing constants
    AI_MOVE_DELAY_MS: 1000,          // Delay before AI makes a move (milliseconds)
    MESSAGE_TIMEOUT_MS: 3000,        // How long messages display (milliseconds)
    BOT_SWITCH_DELAY_MS: 1000,       // Delay when switching bots mid-game
    
    // Audio configuration
    DEFAULT_VOLUME: 0.7,             // Default sound volume (0.0 to 1.0)
    SOUND_EFFECTS_PATH: 'SoundEffects/',  // Path to sound effects directory
    SOUND_FILES: {
        START: 'start.mp3',
        CLICK: 'click.mp3',
        CLACK: 'clack.mp3',
        WIN: 'win1.mp3',
        LOSE: 'lose.mp3'
    }
};

const AI_CONFIG = {
    // Bot probabilities
    BOT2_OPENING_CHANCE: 0.75,       // Bot 2 chance to use opening strategy
    BOT1_RANDOM_CHANCE: 0.5,         // Bot 1 chance for random early moves
    
    // Move count thresholds
    BOT2_OPENING_MOVES: 1,           // Bot 2 uses opening for first N moves
    BOT1_RANDOM_MOVES: 3,            // Bot 1 uses random for first N moves
    
    // Fence placement thresholds
    HIGH_IMPACT_THRESHOLD: 3,        // Minimum path increase to consider fence "high impact"
    OPPONENT_DISTANCE_THRESHOLD: 3,   // Opponent distance to goal for strategic fence
    OPPONENT_ROW_THRESHOLD: 4,        // Opponent row distance for strategic fence
    BOT1_STRATEGIC_ROW_THRESHOLD: 6, // Bot 1 strategic fence row threshold
    
    // Pathfinding penalties
    FENCE_PROXIMITY_PENALTIES: {
        ADJACENT: 0.10,              // Distance 0 (adjacent to fence)
        NEAR: 0.05,                   // Distance 1 (next to adjacent)
        MEDIUM: 0.03,                 // Distance 2
        FAR: 0.01,                    // Distance 3
        NONE: 0                       // Distance 4+
    },
    OPPOSING_PLAYER_PENALTY: 0.1,    // Penalty for being adjacent to opposing player
    
    // History tracking
    HUMAN_MOVE_HISTORY_LIMIT: 10      // Keep only last N human moves for analysis
};

// Helper function to get full sound file path
function getSoundPath(soundName) {
    return GAME_CONFIG.SOUND_EFFECTS_PATH + GAME_CONFIG.SOUND_FILES[soundName.toUpperCase()];
}

