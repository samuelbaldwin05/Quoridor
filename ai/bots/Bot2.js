// Bot 2: Advantage-focused AI - Most sophisticated bot
class Bot2 extends BotStrategy {
    constructor(pathfinder, moveCount, bot2OpeningPattern, bot2OpeningStep) {
        super(pathfinder);
        this.moveCount = moveCount;
        // Store references to shared state (will be updated by QuoridorAI)
        this._bot2OpeningPattern = bot2OpeningPattern;
        this._bot2OpeningStep = bot2OpeningStep;
    }
    
    get bot2OpeningPattern() {
        return this._bot2OpeningPattern;
    }
    
    set bot2OpeningPattern(value) {
        this._bot2OpeningPattern = value;
    }
    
    get bot2OpeningStep() {
        return this._bot2OpeningStep;
    }
    
    set bot2OpeningStep(value) {
        this._bot2OpeningStep = value;
    }
    
    makeMove(game, player) {
        const opponent = game.players.find(p => p !== player);
        const validMoves = game.getValidMoves(player);
        
        if (validMoves.length === 0) return null;
        
        // Bot 2 specific opening strategy - FIRST PRIORITY
        if (this.moveCount <= AI_CONFIG.BOT2_OPENING_MOVES && Math.random() < AI_CONFIG.BOT2_OPENING_CHANCE) {
            const openingMove = this.findBot2OpeningMove(game, player);
            if (openingMove) {
                return {
                    type: 'move',
                    position: openingMove,
                    message: `Computer moved to ${openingMove.toChessNotation()}`
                };
            }
        }
        
        // SECOND PRIORITY: Check if we can win in one move
        const winningMove = this.pathfinder.findWinningMove(game, player, validMoves);
        if (winningMove) {
            return {
                type: 'move',
                position: winningMove,
                message: `Computer wins! Moved to ${winningMove.toChessNotation()}`
            };
        }
        
        // Check if opponent moved closer to goal
        const opponentDistanceToGoal = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
        // Check if opponent is actually close to their goal row (not just close in path)
        const opponentRowDistanceToGoal = Math.abs(opponent.position.row - opponent.goalRow);
        
        // Third priority: Check if any fence can increase opponent's path by threshold
            if (player.fencesRemaining > 0) {
                const highImpactFence = this.findHighImpactFence(game, opponent);
                if (highImpactFence) {
                    return {
                        type: 'fence',
                        fence: highImpactFence,
                        message: `Computer placed a fence`
                    };
                }
            }
            
            // Fourth priority: Only place fence if opponent is within threshold AND close to their actual goal row
            const shouldPlaceFence = player.fencesRemaining > 0 && 
                                   opponentDistanceToGoal <= AI_CONFIG.OPPONENT_DISTANCE_THRESHOLD && 
                                   opponentRowDistanceToGoal <= AI_CONFIG.OPPONENT_ROW_THRESHOLD;
            
            if (shouldPlaceFence) {
                const strategicFence = this.findStrategicFence(game, opponent);
                if (strategicFence) {
                    return {
                        type: 'fence',
                        fence: strategicFence,
                        message: `Computer placed a fence`
                    };
                }
                // If can't place direct fence, fall through to movement
            }
            
            // Use Dijkstra to find best move (now includes jumping)
            const bestMove = this.pathfinder.findBestMoveWithDijkstra(game, player);
            if (bestMove) {
                return {
                    type: 'move',
                    position: bestMove,
                    message: `Computer moved to ${bestMove.toChessNotation()}`
                };
            } else {
                // Fallback to any valid move
                const fallbackMove = validMoves[0];
                return {
                    type: 'move',
                    position: fallbackMove,
                    message: `Computer moved to ${fallbackMove.toChessNotation()}`
                };
            }
    }
    
    // Bot 2 specific opening move patterns
    findBot2OpeningMove(game, player) {
        if (!this.bot2OpeningPattern) {
            // Initialize opening pattern for Bot 2 with weighted selection
            const patterns = [
                { moves: ['left', 'left'], weight: 2 },
                { moves: ['down', 'left'], weight: 2 },
                { moves: ['down', 'right'], weight: 2 },
                { moves: ['right', 'right'], weight: 2 },
                { moves: ['left', 'down', 'left'], weight: 2 },
                { moves: ['right', 'down', 'right'], weight: 2 },
                { moves: ['left', 'left', 'left'], weight: 1 },
                { moves: ['right', 'right', 'right'], weight: 1 }
            ];
            
            // Calculate total weight
            const totalWeight = patterns.reduce((sum, pattern) => sum + pattern.weight, 0);
            
            // Generate random number and select pattern based on weight
            let random = Math.random() * totalWeight;
            let selectedPattern = null;
            
            for (const pattern of patterns) {
                random -= pattern.weight;
                if (random <= 0) {
                    selectedPattern = pattern.moves;
                    break;
                }
            }
            
            // Fallback to first pattern if something goes wrong
            this.bot2OpeningPattern = selectedPattern || patterns[0].moves;
            this.bot2OpeningStep = 0;
        }
        
        // Check if we've completed the opening pattern
        if (this.bot2OpeningStep >= this.bot2OpeningPattern.length) {
            return null; // No more opening moves
        }
        
        const direction = this.bot2OpeningPattern[this.bot2OpeningStep];
        const validMoves = game.getValidMoves(player);
        
        // Convert direction to position change
        const directions = {
            'left': { row: 0, col: -1 },
            'right': { row: 0, col: 1 },
            'down': { row: 1, col: 0 }
        };
        
        const dir = directions[direction];
        const targetPos = new Position(
            player.position.row + dir.row,
            player.position.col + dir.col
        );
        
        // Check if the desired move is valid
        const desiredMove = validMoves.find(move => move.equals(targetPos));
        
        if (desiredMove) {
            this.bot2OpeningStep++;
            return desiredMove;
        } else {
            // Desired move not possible, abandon opening and use best move
            this.bot2OpeningPattern = null; // Reset pattern
            return this.pathfinder.findBestMoveWithDijkstra(game, player);
        }
    }
    
    // Find fence that increases computer's advantage by 3 or more
    findHighImpactFence(game, opponent) {
        const aiPlayer = game.players.find(p => p !== opponent);
        
        // Get current advantage (human path - computer path)
        const currentHumanDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
        const currentAiDistance = this.pathfinder.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
        const currentAdvantage = currentHumanDistance - currentAiDistance;
        
        // Get all valid fence placements
        const validFences = this.getValidFencePlacements(game);
        
        // Shuffle fences to add randomness when multiple high-impact fences exist
        for (let i = validFences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validFences[i], validFences[j]] = [validFences[j], validFences[i]];
        }
        
        let bestFence = null;
        let maxAdvantageIncrease = 0;
        
        for (const fence of validFences) {
            // Test this fence
            game.fences.push(fence);
            const newHumanDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
            const newAiDistance = this.pathfinder.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
            const newAdvantage = newHumanDistance - newAiDistance;
            game.fences.pop(); // Remove test fence
            
            // Calculate advantage increase
            const advantageIncrease = newAdvantage - currentAdvantage;
            
            // If this fence increases advantage by threshold or more, consider it
            if (advantageIncrease >= AI_CONFIG.HIGH_IMPACT_THRESHOLD && advantageIncrease > maxAdvantageIncrease) {
                maxAdvantageIncrease = advantageIncrease;
                bestFence = fence;
            }
        }
        
        return bestFence;
    }
    
    // Find strategic fence placement to maximize computer advantage
    findStrategicFence(game, opponent) {
        const aiPlayer = game.players.find(p => p !== opponent);
        
        // Calculate current advantage before testing any fences
        const currentHumanDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
        const currentAiDistance = this.pathfinder.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
        const currentAdvantage = currentHumanDistance - currentAiDistance;
        
        // Try multiple positions in front of the opponent
        const directBlockingFences = this.getDirectBlockingFences(opponent);
        
        let bestFence = null;
        let bestAdvantageIncrease = 0;
        
        for (const fence of directBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence improves computer's advantage
                game.fences.push(fence);
                const newHumanDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
                const newAiDistance = this.pathfinder.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
                const newAdvantage = newHumanDistance - newAiDistance;
                game.fences.pop(); // Remove test fence
                
                // Calculate advantage increase
                const advantageIncrease = newAdvantage - currentAdvantage;
                
                // If the fence improves advantage, consider it
                if (advantageIncrease > bestAdvantageIncrease) {
                    bestAdvantageIncrease = advantageIncrease;
                    bestFence = fence;
                }
            }
        }
        
        return bestFence;
    }
    
    // Find side fence placement that maximizes computer advantage
    findSideFence(game, opponent) {
        const aiPlayer = game.players.find(p => p !== opponent);
        const sideBlockingFences = this.getSideBlockingFences(opponent);
        
        // Calculate current advantage
        const currentHumanDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
        const currentAiDistance = this.pathfinder.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
        const currentAdvantage = currentHumanDistance - currentAiDistance;
        
        // Shuffle the fences to add randomness
        for (let i = sideBlockingFences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sideBlockingFences[i], sideBlockingFences[j]] = [sideBlockingFences[j], sideBlockingFences[i]];
        }
        
        let bestFence = null;
        let bestAdvantageIncrease = 0;
        
        for (const fence of sideBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence improves computer's advantage
                game.fences.push(fence);
                const newHumanDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
                const newAiDistance = this.pathfinder.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
                const newAdvantage = newHumanDistance - newAiDistance;
                game.fences.pop(); // Remove test fence
                
                // Calculate advantage increase
                const advantageIncrease = newAdvantage - currentAdvantage;
                
                // If the fence improves advantage, consider it
                if (advantageIncrease > bestAdvantageIncrease) {
                    bestAdvantageIncrease = advantageIncrease;
                    bestFence = fence;
                }
            }
        }
        
        return bestFence;
    }
}

