// Bot 1: Basic Strategic - Random early moves with basic fence placement
class Bot1 extends BotStrategy {
    constructor(pathfinder, moveCount, previousPosition) {
        super(pathfinder);
        this.moveCount = moveCount;
        this.previousPosition = previousPosition;
    }
    
    makeMove(game, player) {
        const validMoves = game.getValidMoves(player);
        if (validMoves.length === 0) return null;

        // FIRST PRIORITY: Check if we can win in one move
        const winningMove = this.pathfinder.findWinningMove(game, player, validMoves);
        if (winningMove) {
            return { type: 'move', position: winningMove, message: `Computer wins! Moved to ${winningMove.toChessNotation()}` };
        }

        // SECOND PRIORITY: Random movement in early game
        if (this.moveCount <= AI_CONFIG.BOT1_RANDOM_MOVES && Math.random() < AI_CONFIG.BOT1_RANDOM_CHANCE) {
            const randomMove = this.findRandomMoveAvoidingBacktrack(game, player);
            if (randomMove) {
                return { type: 'move', position: randomMove, message: `Computer moved to ${randomMove.toChessNotation()}` };
            }
        }

        // THIRD PRIORITY: Try high-impact fence (increases opponent path by threshold)
        const opponent = game.players.find(p => p !== player);
        if (player.fencesRemaining > 0) {
            const highImpactFence = this.findHighImpactFence(game, opponent);
            if (highImpactFence) {
                return { type: 'fence', fence: highImpactFence, message: `Computer placed a fence` };
            }
        }

        // FOURTH PRIORITY: Try strategic fence when opponent is close
        if (player.fencesRemaining > 0 && opponent.position.row >= AI_CONFIG.BOT1_STRATEGIC_ROW_THRESHOLD) {
            const strategicFence = this.findStrategicFence(game, opponent);
            if (strategicFence) {
                return { type: 'fence', fence: strategicFence, message: `Computer placed a fence` };
            }
            
            // FIFTH PRIORITY: Try side fence for lateral blocking (only when strategic fence conditions are met)
            const sideFence = this.findSideFence(game, opponent);
            if (sideFence) {
                return { type: 'fence', fence: sideFence, message: `Computer placed a fence` };
            }
        }

        // SIXTH PRIORITY: Use Dijkstra to find best move
        const bestMove = this.pathfinder.findBestMoveWithDijkstra(game, player);
        if (bestMove) {
            return { type: 'move', position: bestMove, message: `Computer moved to ${bestMove.toChessNotation()}` };
        }

        // FALLBACK: Take any valid move
        return { type: 'move', position: validMoves[0], message: `Computer moved to ${validMoves[0].toChessNotation()}` };
    }
    
    // Find a random move that avoids going back to the previous position unnecessarily
    findRandomMoveAvoidingBacktrack(game, player) {
        const validMoves = game.getValidMoves(player);
        
        if (validMoves.length === 0) return null;
        
        // If we have a previous position, try to avoid moving back to it
        if (this.previousPosition) {
            const nonBacktrackMoves = validMoves.filter(move => 
                !move.equals(this.previousPosition)
            );
            
            // If we have other options, use them. Otherwise, allow backtracking
            const availableMoves = nonBacktrackMoves.length > 0 ? nonBacktrackMoves : validMoves;
            
            // Choose a random move from available options
            const randomIndex = Math.floor(Math.random() * availableMoves.length);
            return availableMoves[randomIndex];
        }
        
        // No previous position to avoid, just pick any random move
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        return validMoves[randomIndex];
    }
    
    // Find fence that increases opponent path by threshold or more
    findHighImpactFence(game, opponent) {
        const currentDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
        // Get all valid fence placements
        const validFences = this.getValidFencePlacements(game);
        
        // Shuffle fences to add randomness when multiple high-impact fences exist
        for (let i = validFences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validFences[i], validFences[j]] = [validFences[j], validFences[i]];
        }
        
        for (const fence of validFences) {
            // Test this fence
            game.fences.push(fence);
            const newDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
            game.fences.pop(); // Remove test fence
            
            // If this fence increases path by threshold or more, place it
            if (newDistance - currentDistance >= AI_CONFIG.HIGH_IMPACT_THRESHOLD) {
                return fence;
            }
        }
        
        return null;
    }
    
    // Find strategic fence placement to increase opponent's path
    findStrategicFence(game, opponent) {
        // Try multiple positions in front of the opponent
        const directBlockingFences = this.getDirectBlockingFences(opponent);
        
        for (const fence of directBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence increases opponent's path
                const currentDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
                
                game.fences.push(fence);
                const newDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
                game.fences.pop(); // Remove test fence
                
                // If the fence meaningfully increases the path, place it
                if (newDistance > currentDistance) {
                    return fence;
                }
            }
        }
        
        return null;
    }
    
    // Find side fence placement that increases opponent's path
    findSideFence(game, opponent) {
        const sideBlockingFences = this.getSideBlockingFences(opponent);
        
        // Shuffle the fences to add randomness
        for (let i = sideBlockingFences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sideBlockingFences[i], sideBlockingFences[j]] = [sideBlockingFences[j], sideBlockingFences[i]];
        }
        
        for (const fence of sideBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence increases opponent's path
                const currentDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
                
                game.fences.push(fence);
                const newDistance = this.pathfinder.dijkstraDistance(game, opponent.position, opponent.goalRow);
                game.fences.pop(); // Remove test fence
                
                // If the fence increases the path, place it
                if (newDistance > currentDistance) {
                    return fence;
                }
            }
        }
        
        return null;
    }
}

