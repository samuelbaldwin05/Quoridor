// AI Module for Quoridor Game
// Contains different AI bots

class QuoridorAI {
    constructor(botType = 'bot2') {
        this.botType = botType;
        this.humanMoveHistory = []; // Track human moves for analysis
        this.bestHumanMove = null; // Track the best move the human could make
        this.moveCount = 0; // Track number of moves made by AI
        this.previousPosition = null; // Track AI's previous position to avoid unnecessary backtracking
    }

    // Main method to make a move - routes to appropriate bot
    makeMove(game, player) {
        // Track AI's previous position before making a move
        this.previousPosition = { ...player.position };
        
        // Update tracking for human player
        this.updateHumanTracking(game, player);
        
        // Increment move count for this AI
        this.moveCount++;
        
        // Route to appropriate bot logic
        if (this.botType === 'bot1') {
            return this.makeBot1Move(game, player);
        } else {
            return this.makeBot2Move(game, player);
        }
    }

    // Bot 1: Basic Strategic AI - focuses on maximizing human path length
    makeBot1Move(game, player) {
        const opponent = game.players.find(p => p !== player);
        
        // 50% chance for random move in first 3 turns (but avoid going back to previous position)
        if (this.moveCount <= 3 && Math.random() < 0.5) {
            const randomMove = this.findRandomMoveAvoidingBacktrack(game, player);
            if (randomMove) {
                return {
                    type: 'move',
                    position: randomMove,
                    message: `Computer moved to ${randomMove.toChessNotation()}`
                };
            }
        }
        
        // Check if opponent moved closer to goal
        const opponentDistanceToGoal = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
        // Check if opponent is actually close to their goal row (not just close in path)
        const opponentRowDistanceToGoal = Math.abs(opponent.position.row - opponent.goalRow);
        
        const validMoves = game.getValidMoves(player);
        
        if (validMoves.length > 0) {
            // First priority: Check if any fence can increase opponent's path by 3+ moves
            if (player.fencesRemaining > 0) {
                const highImpactFence = this.findBot1HighImpactFence(game, opponent);
                if (highImpactFence) {
                    return {
                        type: 'fence',
                        fence: highImpactFence,
                        message: `Computer placed a fence`
                    };
                }
            }
            
            // Second priority: Only place fence if opponent is within 3 tiles AND close to their actual goal row
            const shouldPlaceFence = player.fencesRemaining > 0 && 
                                   opponentDistanceToGoal <= 3 && 
                                   opponentRowDistanceToGoal <= 4; // Must be close to goal row too
            
            if (shouldPlaceFence) {
                const strategicFence = this.findBot1StrategicFence(game, opponent);
                if (strategicFence) {
                    return {
                        type: 'fence',
                        fence: strategicFence,
                        message: `Computer placed a fence`
                    };
                }
                // If can't place direct fence, try side fence
                const sideFence = this.findBot1SideFence(game, opponent);
                if (sideFence) {
                    return {
                        type: 'fence',
                        fence: sideFence,
                        message: `Computer placed a fence`
                    };
                }
                // Fall through to movement if fence placement fails
            }
            
            // 40% chance to deviate from optimal move for first 3 moves only
            if (this.moveCount <= 3 && Math.random() < 0.4) {
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

    // Bot 2: Advantage-focused AI (current implementation)
    makeBot2Move(game, player) {
        return this.makeSimpleMove(game, player);
    }

    // Simplified AI - Basic strategic logic without complex forward thinking
    makeSimpleMove(game, player) {
        const opponent = game.players.find(p => p !== player);
        
        // 50% chance for random move in first 3 turns (but avoid going back to previous position)
        if (this.moveCount <= 3 && Math.random() < 0.5) {
            const randomMove = this.findRandomMoveAvoidingBacktrack(game, player);
            if (randomMove) {
                return {
                    type: 'move',
                    position: randomMove,
                    message: `Computer moved to ${randomMove.toChessNotation()}`
                };
            }
        }
        
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
                        message: `Computer placed a fence`
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
                        message: `Computer placed a fence`
                    };
                }
                // If can't place direct fence, try side fence
                const sideFence = this.findSideFence(game, opponent);
                if (sideFence) {
                    return {
                        type: 'fence',
                        fence: sideFence,
                        message: `Computer placed a fence`
                    };
                }
                // Fall through to movement if fence placement fails
            }
            
            // 40% chance to deviate from optimal move for first 3 moves only
            if (this.moveCount <= 3 && Math.random() < 0.4) {
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

    // Find fence that increases computer's advantage by 3 or more
    findHighImpactFence(game, opponent) {
        const aiPlayer = game.players.find(p => p !== opponent);
        
        // Get current advantage (human path - computer path)
        const currentHumanDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        const currentAiDistance = this.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
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
            const newHumanDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
            const newAiDistance = this.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
            const newAdvantage = newHumanDistance - newAiDistance;
            game.fences.pop(); // Remove test fence
            
            // Calculate advantage increase
            const advantageIncrease = newAdvantage - currentAdvantage;
            
            // If this fence increases advantage by 3 or more, consider it
            if (advantageIncrease >= 3 && advantageIncrease > maxAdvantageIncrease) {
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
        const currentHumanDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        const currentAiDistance = this.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
        const currentAdvantage = currentHumanDistance - currentAiDistance;
        
        // Try multiple positions in front of the opponent
        const directBlockingFences = this.getDirectBlockingFences(opponent);
        
        let bestFence = null;
        let bestAdvantageIncrease = 0;
        
        for (const fence of directBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence improves computer's advantage
                game.fences.push(fence);
                const newHumanDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                const newAiDistance = this.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
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
        const currentHumanDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        const currentAiDistance = this.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
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
                const newHumanDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                const newAiDistance = this.dijkstraDistance(game, aiPlayer.position, aiPlayer.goalRow);
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

    // Bot 1: Find fence that increases human path by 3+ moves (old logic)
    findBot1HighImpactFence(game, opponent) {
        const currentDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
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
            const newDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
            game.fences.pop(); // Remove test fence
            
            // If this fence increases path by 3 or more, place it
            if (newDistance - currentDistance >= 3) {
                return fence;
            }
        }
        
        return null;
    }

    // Bot 1: Find strategic fence placement (old logic)
    findBot1StrategicFence(game, opponent) {
        // Try multiple positions in front of the opponent
        const directBlockingFences = this.getDirectBlockingFences(opponent);
        
        for (const fence of directBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence increases opponent's path
                const currentDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                
                game.fences.push(fence);
                const newDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                game.fences.pop(); // Remove test fence
                
                // If the fence meaningfully increases the path, place it
                if (newDistance > currentDistance) {
                    return fence;
                }
            }
        }
        
        return null;
    }

    // Bot 1: Find side fence placement (old logic)
    findBot1SideFence(game, opponent) {
        const sideBlockingFences = this.getSideBlockingFences(opponent);
        
        // Shuffle the fences to add randomness
        for (let i = sideBlockingFences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sideBlockingFences[i], sideBlockingFences[j]] = [sideBlockingFences[j], sideBlockingFences[i]];
        }
        
        for (const fence of sideBlockingFences) {
            if (game.isValidFencePlacement(fence)) {
                // Test if this fence increases opponent's path
                const currentDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
                
                game.fences.push(fence);
                const newDistance = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
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

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuoridorAI;
} 