// AI Module for Quoridor Game
// Uses Pathfinder for pathfinding and BotStrategy pattern for different AI behaviors

class QuoridorAI {
    constructor(botType = 'bot2') {
        this.botType = botType;
        this.pathfinder = new Pathfinder(); // Initialize pathfinder
        
        // State tracking
        this.humanMoveHistory = []; // Track human moves for analysis
        this.bestHumanMove = null; // Track the best move the human could make
        this.moveCount = 0; // Track number of moves made by AI
        this.previousPosition = null; // Track AI's previous position to avoid unnecessary backtracking
        this.bot2OpeningPattern = null; // Track Bot 2's opening pattern
        this.bot2OpeningStep = 0; // Track Bot 2's opening step
        this.lastMoveType = null; // Track the type of the last move made
        
        // Initialize bot strategy
        this.updateBotStrategy();
    }
    
    // Update bot strategy based on current botType
    updateBotStrategy() {
        if (this.botType === 'bot0') {
            this.strategy = new Bot0(this.pathfinder);
        } else if (this.botType === 'bot1') {
            this.strategy = new Bot1(this.pathfinder, this.moveCount, this.previousPosition);
        } else {
            this.strategy = new Bot2(this.pathfinder, this.moveCount, this.bot2OpeningPattern, this.bot2OpeningStep);
        }
    }
    
    // Update strategy state (for bots that need dynamic state)
    updateStrategyState() {
        if (this.botType === 'bot1' && this.strategy) {
            this.strategy.moveCount = this.moveCount;
            this.strategy.previousPosition = this.previousPosition;
        } else if (this.botType === 'bot2' && this.strategy) {
            this.strategy.moveCount = this.moveCount;
            this.strategy.bot2OpeningPattern = this.bot2OpeningPattern;
            this.strategy.bot2OpeningStep = this.bot2OpeningStep;
        }
    }

    // Method to change the bot type
    setOpponent(botType) {
        this.botType = botType;
        // Reset tracking when switching bots
        this.moveCount = 0;
        this.humanMoveHistory = [];
        this.bestHumanMove = null;
        this.previousPosition = null;
        this.bot2OpeningPattern = null;
        this.bot2OpeningStep = 0;
        this.lastMoveType = null;
        
        // Update strategy
        this.updateBotStrategy();
    }

    // Reset AI state for new game
    resetGameState() {
        this.moveCount = 0;
        this.humanMoveHistory = [];
        this.bestHumanMove = null;
        this.previousPosition = null;
        this.bot2OpeningPattern = null;
        this.bot2OpeningStep = 0;
        this.lastMoveType = null;
        
        // Update strategy with reset state
        this.updateBotStrategy();
    }

    // Main method to make a move - routes to appropriate bot
    makeMove(game, player) {
        // Track AI's previous position before making a move
        this.previousPosition = { ...player.position };
        
        // Update tracking for human player
        this.updateHumanTracking(game, player);
        
        // Increment move count for this AI
        this.moveCount++;
        
        // Update strategy state before making move
        this.updateStrategyState();
        
        // Delegate to strategy
        const result = this.strategy.makeMove(game, player);
        
        // Update state from strategy (for Bot2 opening pattern)
        if (this.botType === 'bot2' && this.strategy) {
            this.bot2OpeningPattern = this.strategy.bot2OpeningPattern;
            this.bot2OpeningStep = this.strategy.bot2OpeningStep;
        }
        
        // Track last move type
        if (result) {
            this.lastMoveType = result.type === 'move' ? 'Move' : 'Fence';
        }
        
        return result;
    }

    // Track human player's best possible moves
    updateHumanTracking(game, aiPlayer) {
        const humanPlayer = game.players.find(p => p !== aiPlayer);
        if (!humanPlayer) return;

        // Calculate best move for human using pathfinder
        this.bestHumanMove = this.pathfinder.findBestMoveWithDijkstra(game, humanPlayer);
        
        // Track human move history
        this.humanMoveHistory.push({
            position: { ...humanPlayer.position },
            distanceToGoal: this.pathfinder.dijkstraDistance(game, humanPlayer.position, humanPlayer.goalRow),
            timestamp: Date.now()
        });

        // Keep only last N moves
        if (this.humanMoveHistory.length > AI_CONFIG.HUMAN_MOVE_HISTORY_LIMIT) {
            this.humanMoveHistory.shift();
        }
    }

    // Get information about human player's strategy
    getHumanAnalysis() {
        if (this.humanMoveHistory.length < 2) {
            return "Insufficient data";
        }

        const recent = this.humanMoveHistory.slice(-3);
        const distances = recent.map(move => move.distanceToGoal);
        const isImproving = distances[distances.length - 1] < distances[0];
        
        return {
            isMovingTowardGoal: isImproving,
            currentDistance: distances[distances.length - 1],
            bestPossibleMove: this.bestHumanMove,
            recentMoves: recent.length
        };
    }

    // Get difficulty display name
    getDifficultyName() {
        switch (this.botType) {
            case 'bot0': return 'Bot 0 - Movement Only';
            case 'bot1': return 'Bot 1 - Basic Strategic';
            case 'bot2': return 'Bot 2 - Advantage Focused';
            default: return 'Bot 2 - Advantage Focused';
        }
    }
    
    // Delegate pathfinding methods to pathfinder (for backward compatibility)
    dijkstraDistance(game, startPos, goalRow) {
        return this.pathfinder.dijkstraDistance(game, startPos, goalRow);
    }
    
    getShortestPathFromPosition(game, player) {
        return this.pathfinder.getShortestPathFromPosition(game, player);
    }
    
    findBestMoveWithDijkstra(game, player) {
        return this.pathfinder.findBestMoveWithDijkstra(game, player);
    }
    
    findWinningMove(game, player, validMoves) {
        return this.pathfinder.findWinningMove(game, player, validMoves);
    }
    
    calculateFenceProximityPenalty(game, position) {
        return this.pathfinder.calculateFenceProximityPenalty(game, position);
    }
    
    calculateOpposingPlayerPenalty(game, position, currentPlayer) {
        return this.pathfinder.calculateOpposingPlayerPenalty(game, position, currentPlayer);
    }
    
    calculateFenceDistance(game, position) {
        return this.pathfinder.calculateFenceDistance(game, position);
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuoridorAI;
}
