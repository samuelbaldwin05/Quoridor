// AI Module for Quoridor Game
// Contains different AI difficulty levels

class QuoridorAI {
    constructor(difficulty = 'easy') {
        this.difficulty = difficulty;
        this.humanMoveHistory = []; // Track human moves for analysis
        this.bestHumanMove = null; // Track the best move the human could make
        this.moveCount = 0; // Track number of moves made by AI
    }

    // Main method to make a move based on difficulty
    makeMove(game, player) {
        // Update tracking for human player
        this.updateHumanTracking(game, player);
        
        // Increment move count for this AI
        this.moveCount++;
        
        switch (this.difficulty) {
            case 'easy':
                return this.makeEasyMove(game, player);
            case 'medium':
                return this.makeMediumMove(game, player);
            case 'hard':
                return this.makeHardMove(game, player);
            default:
                return this.makeEasyMove(game, player);
        }
    }

    // Track human player's best possible moves
    updateHumanTracking(game, aiPlayer) {
        const humanPlayer = game.players.find(p => p !== aiPlayer);
        if (!humanPlayer) return;

        // Calculate best move for human using Dijkstra
        this.bestHumanMove = this.findBestMoveWithDijkstra(game, humanPlayer);
        
        // Track human move history
        this.humanMoveHistory.push({
            position: { ...humanPlayer.position },
            distanceToGoal: this.dijkstraDistance(game, humanPlayer.position, humanPlayer.goalRow),
            timestamp: Date.now()
        });

        // Keep only last 10 moves
        if (this.humanMoveHistory.length > 10) {
            this.humanMoveHistory.shift();
        }
    }

    // Easy AI - Updated with Dijkstra pathfinding and improved strategies
    makeEasyMove(game, player) {
        const opponent = game.players.find(p => p !== player);
        
        // Check if opponent moved closer to goal
        const opponentDistanceToGoal = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
        // Check if opponent is actually close to their goal row (not just close in path)
        const opponentRowDistanceToGoal = Math.abs(opponent.position.row - opponent.goalRow);
        
        const validMoves = game.getValidMoves(player);
        
        if (validMoves.length > 0) {
            // First priority: Check if any fence can increase opponent's path by 3+ moves
            if (player.fencesRemaining > 0) {
                const highImpactFence = this.findHighImpactFence(game, opponent);
                if (highImpactFence) {
                    return {
                        type: 'fence',
                        fence: highImpactFence,
                        message: `Computer placed a strategic ${highImpactFence.orientation} fence`
                    };
                }
            }
            
            // Second priority: Only place fence if opponent is within 3 tiles AND close to their actual goal row
            const shouldPlaceFence = player.fencesRemaining > 0 && 
                                   opponentDistanceToGoal <= 3 && 
                                   opponentRowDistanceToGoal <= 4; // Must be close to goal row too
            
            if (shouldPlaceFence) {
                const strategicFence = this.findStrategicFence(game, opponent);
                if (strategicFence) {
                    return {
                        type: 'fence',
                        fence: strategicFence,
                        message: `Computer placed a blocking ${strategicFence.orientation} fence`
                    };
                }
                // If can't place direct fence, try side fence
                const sideFence = this.findSideFence(game, opponent);
                if (sideFence) {
                    return {
                        type: 'fence',
                        fence: sideFence,
                        message: `Computer placed a side ${sideFence.orientation} fence`
                    };
                }
                // Fall through to movement if fence placement fails
            }
            
            // 50% chance to deviate from optimal move for first 4 moves only
            if (this.moveCount <= 4 && Math.random() < 0.5) {
                const lateralMove = this.findLateralMove(validMoves, player);
                if (lateralMove) {
                    return {
                        type: 'move',
                        position: lateralMove,
                        message: `Computer moved to ${lateralMove.toChessNotation()}`
                    };
                }
            }
            
            // Use Dijkstra to find best move (now includes jumping)
            const bestMove = this.findBestMoveWithDijkstra(game, player);
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
        
        return null; // No valid moves
    }

    // Find a lateral move (left or right) for variation
    findLateralMove(validMoves, player) {
        const lateralMoves = validMoves.filter(move => 
            move.row === player.position.row && // Same row (lateral movement)
            move.col !== player.position.col    // Different column
        );
        
        if (lateralMoves.length > 0) {
            // Randomly choose between available lateral moves
            const randomIndex = Math.floor(Math.random() * lateralMoves.length);
            return lateralMoves[randomIndex];
        }
        
        return null;
    }

    // Dijkstra's algorithm to find shortest path distance (now includes jumping)
    dijkstraDistance(game, startPos, goalRow) {
        const distances = {};
        const visited = new Set();
        const queue = [];

        // Initialize distances
        for (let row = 0; row < game.size; row++) {
            for (let col = 0; col < game.size; col++) {
                const key = `${row},${col}`;
                distances[key] = Infinity;
            }
        }

        const startKey = `${startPos.row},${startPos.col}`;
        distances[startKey] = 0;
        queue.push({ position: startPos, distance: 0 });

        while (queue.length > 0) {
            // Find minimum distance node
            queue.sort((a, b) => a.distance - b.distance);
            const current = queue.shift();
            const currentKey = `${current.position.row},${current.position.col}`;

            if (visited.has(currentKey)) continue;
            visited.add(currentKey);

            // Check if we reached the goal
            if (current.position.row === goalRow) {
                return current.distance;
            }

            // Check all possible moves from current position (including jumping)
            const tempPlayer = { position: current.position, goalRow: goalRow };
            const possibleMoves = game.getValidMoves(tempPlayer);

            for (const move of possibleMoves) {
                const moveKey = `${move.row},${move.col}`;
                if (!visited.has(moveKey)) {
                    const newDistance = current.distance + 1;
                    if (newDistance < distances[moveKey]) {
                        distances[moveKey] = newDistance;
                        queue.push({ position: move, distance: newDistance });
                    }
                }
            }
        }

        return Infinity; // No path found
    }

    // Find best move using Dijkstra's algorithm (now properly considers jumping)
    findBestMoveWithDijkstra(game, player) {
        const validMoves = game.getValidMoves(player);
        let bestMove = null;
        let shortestDistance = Infinity;

        for (const move of validMoves) {
            const distance = this.dijkstraDistance(game, move, player.goalRow);
            if (distance < shortestDistance) {
                shortestDistance = distance;
                bestMove = move;
            }
        }

        return bestMove;
    }

    // Find strategic fence placement to block opponent
    findStrategicFence(game, opponent) {
        // Calculate current distance before testing any fences
        const currentDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
        // Try multiple positions in front of the opponent
        const directBlockingFences = this.getDirectBlockingFences(opponent);
        
        for (const fence of directBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence actually blocks the opponent's path
                game.fences.push(fence);
                const newDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                game.fences.pop(); // Remove test fence
                
                // If the fence increases the opponent's path, use it
                if (newDistance > currentDistance) {
                    return fence;
                }
            }
        }
        
        return null;
    }

    // Find side fence placement (fixed logic)
    findSideFence(game, opponent) {
        const sideBlockingFences = this.getSideBlockingFences(opponent);
        
        // Shuffle the fences to add randomness
        for (let i = sideBlockingFences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sideBlockingFences[i], sideBlockingFences[j]] = [sideBlockingFences[j], sideBlockingFences[i]];
        }
        
        for (const fence of sideBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence actually increases opponent's path
                const currentDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                game.fences.push(fence);
                const newDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                game.fences.pop(); // Remove test fence
                
                if (newDistance > currentDistance) {
                    return fence;
                }
            }
        }
        return null;
    }

    // Get multiple fence positions directly in front of opponent
    getDirectBlockingFences(opponent) {
        const fences = [];
        const goalDirection = opponent.goalRow < opponent.position.row ? -1 : 1;
        
        // Place horizontal fence in front of opponent
        if (goalDirection === -1) {
            // Opponent going up, place fence above them
            const fenceRow = opponent.position.row - 1;
            
            // Try fence directly in front
            const fenceCol1 = Math.max(0, Math.min(7, opponent.position.col - 1));
            fences.push(new Fence(fenceRow, fenceCol1, 'horizontal'));
            
            // Try fence one tile to the right (still in front)
            const fenceCol2 = Math.max(0, Math.min(7, opponent.position.col));
            fences.push(new Fence(fenceRow, fenceCol2, 'horizontal'));
            
        } else {
            // Opponent going down, place fence below them  
            const fenceRow = opponent.position.row;
            
            // Try fence directly in front
            const fenceCol1 = Math.max(0, Math.min(7, opponent.position.col - 1));
            fences.push(new Fence(fenceRow, fenceCol1, 'horizontal'));
            
            // Try fence one tile to the right (still in front)
            const fenceCol2 = Math.max(0, Math.min(7, opponent.position.col));
            fences.push(new Fence(fenceRow, fenceCol2, 'horizontal'));
        }
        
        return fences;
    }

    // Get vertical fences to place next to opponent
    getSideBlockingFences(opponent) {
        const fences = [];
        
        // Try to place vertical fence directly next to opponent (left and right)
        // Left side
        if (opponent.position.col > 0) {
            fences.push(new Fence(opponent.position.row, opponent.position.col - 1, 'vertical'));
        }
        // Right side  
        if (opponent.position.col < 8) {
            fences.push(new Fence(opponent.position.row, opponent.position.col, 'vertical'));
        }
        
        // Try to place vertical fence one row above and next to opponent
        if (opponent.position.row > 0) {
            // Left side, one above
            if (opponent.position.col > 0) {
                fences.push(new Fence(opponent.position.row - 1, opponent.position.col - 1, 'vertical'));
            }
            // Right side, one above
            if (opponent.position.col < 8) {
                fences.push(new Fence(opponent.position.row - 1, opponent.position.col, 'vertical'));
            }
        }
        
        return fences;
    }

    // Find fence that increases opponent's path by 3 or more moves
    findHighImpactFence(game, opponent) {
        // Get current shortest path distance
        const currentDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
        // Get all valid fence placements
        const validFences = this.getValidFencePlacements(game);
        
        // Shuffle fences to add randomness when multiple high-impact fences exist
        for (let i = validFences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validFences[i], validFences[j]] = [validFences[j], validFences[i]];
        }
        
        let bestFence = null;
        let maxImpact = 0;
        
        for (const fence of validFences) {
            // Test this fence
            game.fences.push(fence);
            const newDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
            game.fences.pop(); // Remove test fence
            
            // Calculate impact (increase in path length)
            const impact = newDistance - currentDistance;
            
            // If this fence increases path by 3 or more, consider it
            if (impact >= 3 && impact > maxImpact) {
                maxImpact = impact;
                bestFence = fence;
            }
        }
        
        return bestFence;
    }

    // Medium AI - Placeholder for future implementation
    makeMediumMove(game, player) {
        // TODO: Implement medium difficulty AI
        // For now, use easy AI
        return this.makeEasyMove(game, player);
    }

    // Hard AI - Placeholder for future implementation
    makeHardMove(game, player) {
        // TODO: Implement hard difficulty AI
        // Could use minimax, A* pathfinding, or other advanced algorithms
        // For now, use easy AI
        return this.makeEasyMove(game, player);
    }

    // Helper method to estimate how much a fence increases opponent's path length
    estimatePathIncrease(opponent, fence) {
        // Simple heuristic: fences closer to opponent's goal are more valuable
        const distanceToOpponentGoal = Math.abs(fence.row - opponent.goalRow);
        const maxDistance = 8; // Board size - 1
        
        // Normalize and invert so closer fences have higher value
        return (maxDistance - distanceToOpponentGoal) / maxDistance;
    }

    // Helper method to get all valid fence placements
    getValidFencePlacements(game) {
        const validFences = [];
        
        for (let row = 0; row < game.size - 1; row++) {
            for (let col = 0; col < game.size - 1; col++) {
                for (const orientation of ['horizontal', 'vertical']) {
                    const fence = new Fence(row, col, orientation);
                    if (game.isValidFencePlacement(fence)) {
                        validFences.push(fence);
                    }
                }
            }
        }
        
        return validFences;
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
        switch (this.difficulty) {
            case 'easy': return 'Easy';
            case 'medium': return 'Medium';
            case 'hard': return 'Hard';
            default: return 'Easy';
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuoridorAI;
} 