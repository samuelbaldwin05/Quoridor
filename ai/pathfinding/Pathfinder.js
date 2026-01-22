// Pathfinder - Handles all pathfinding logic using Dijkstra's algorithm
class Pathfinder {
    constructor() {
        // Pathfinder is stateless, so no constructor needed
    }
    
    // Dijkstra's algorithm to find shortest path distance (includes jumping and fence proximity penalties)
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
                    // Calculate base distance (1 for each move)
                    const baseMoveDistance = 1;
                    
                    // Calculate fence proximity penalty for the target square
                    const fencePenalty = this.calculateFenceProximityPenalty(game, move);
                    
                    // Calculate opposing player penalty for the target square
                    // Find the current player based on goalRow
                    const currentPlayer = game.players.find(p => p.goalRow === goalRow);
                    const opposingPlayerPenalty = this.calculateOpposingPlayerPenalty(game, move, currentPlayer);
                    
                    // Total distance includes base move + fence penalty + opposing player penalty
                    const totalPenalty = fencePenalty + opposingPlayerPenalty;
                    const totalMoveDistance = baseMoveDistance + totalPenalty;
                    const newDistance = current.distance + totalMoveDistance;
                    
                    if (newDistance < distances[moveKey]) {
                        distances[moveKey] = newDistance;
                        queue.push({ position: move, distance: newDistance });
                    }
                }
            }
        }

        return Infinity; // No path found
    }
    
    // Get shortest path from current position (returns path and distances)
    getShortestPathFromPosition(game, player) {
        const distances = {};
        const previous = {};
        const visited = new Set();
        const queue = [];

        // Initialize distances
        for (let row = 0; row < game.size; row++) {
            for (let col = 0; col < game.size; col++) {
                const key = `${row},${col}`;
                distances[key] = Infinity;
                previous[key] = null;
            }
        }

        const startKey = `${player.position.row},${player.position.col}`;
        distances[startKey] = 0;
        queue.push({ position: player.position, distance: 0 });

        while (queue.length > 0) {
            // Find minimum distance node
            queue.sort((a, b) => a.distance - b.distance);
            const current = queue.shift();
            const currentKey = `${current.position.row},${current.position.col}`;

            if (visited.has(currentKey)) continue;
            visited.add(currentKey);

            // Check if we reached the goal
            if (current.position.row === player.goalRow) {
                // Reconstruct path
                const path = [];
                let currentPos = currentKey;
                while (currentPos !== null) {
                    const [row, col] = currentPos.split(',').map(Number);
                    path.unshift(new Position(row, col));
                    currentPos = previous[currentPos];
                }
                return { path, distances };
            }

            // Create a temporary player object for this position to get valid moves
            const tempPlayer = {
                position: current.position,
                goalRow: player.goalRow,
                name: player.name,
                id: player.id,
                fencesRemaining: player.fencesRemaining
            };
            
            // Check all possible moves from current position
            const possibleMoves = game.getValidMoves(tempPlayer);
            for (const move of possibleMoves) {
                const moveKey = `${move.row},${move.col}`;
                if (!visited.has(moveKey)) {
                    // Calculate base distance (1 for each move)
                    const baseMoveDistance = 1;
                    
                    // Calculate fence proximity penalty for the target square
                    const fencePenalty = this.calculateFenceProximityPenalty(game, move);
                    
                    // Calculate opposing player penalty for the target square
                    const opposingPlayerPenalty = this.calculateOpposingPlayerPenalty(game, move, player);
                    
                    // Total distance includes base move + fence penalty + opposing player penalty
                    const totalPenalty = fencePenalty + opposingPlayerPenalty;
                    const totalMoveDistance = baseMoveDistance + totalPenalty;
                    const newDistance = current.distance + totalMoveDistance;
                    
                    if (newDistance < distances[moveKey]) {
                        distances[moveKey] = newDistance;
                        previous[moveKey] = currentKey;
                        queue.push({ position: move, distance: newDistance });
                    }
                }
            }
        }

        return { path: [], distances }; // No path found
    }
    
    // Find best move using Dijkstra's algorithm (properly considers jumping)
    findBestMoveWithDijkstra(game, player) {
        const validMoves = game.getValidMoves(player);
        if (validMoves.length === 0) return null;

        // Calculate the optimal path from current position to goal
        const pathData = this.getShortestPathFromPosition(game, player);
        
        if (pathData.path.length <= 1) {
            // No path found or already at goal, fallback to shortest distance move
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

        // The optimal path includes the current position as the first element
        // The second element (index 1) is the next move we should make
        const nextOptimalPosition = pathData.path[1];
        
        // Find the valid move that matches the next optimal position
        const bestMove = validMoves.find(move => 
            move.row === nextOptimalPosition.row && move.col === nextOptimalPosition.col
        );
        
        return bestMove || validMoves[0]; // Fallback to any valid move if something goes wrong
    }
    
    // Check if any valid move can win the game in one turn
    findWinningMove(game, player, validMoves) {
        for (const move of validMoves) {
            // Check if this move reaches the goal row
            if (move.row === player.goalRow) {
                return move;
            }
        }
        return null; // No winning move found
    }
    
    // Calculate penalty for being close to fences
    calculateFenceProximityPenalty(game, position) {
        if (game.fences.length === 0) {
            return 0; // No penalty if no fences exist
        }
        
        // Calculate minimum distance to any fence
        let minDistance = Infinity;
        for (const fence of game.fences) {
            const distance = this.getDistanceToFence(position, fence);
            minDistance = Math.min(minDistance, distance);
        }
        
        // Apply penalty based on distance to nearest fence
        if (minDistance === 0) {
            return AI_CONFIG.FENCE_PROXIMITY_PENALTIES.ADJACENT;
        } else if (minDistance === 1) {
            return AI_CONFIG.FENCE_PROXIMITY_PENALTIES.NEAR;
        } else if (minDistance === 2) {
            return AI_CONFIG.FENCE_PROXIMITY_PENALTIES.MEDIUM;
        } else if (minDistance === 3) {
            return AI_CONFIG.FENCE_PROXIMITY_PENALTIES.FAR;
        } else {
            return AI_CONFIG.FENCE_PROXIMITY_PENALTIES.NONE;
        }
    }
    
    // Calculate penalty for being adjacent to opposing player (to avoid being jumped over)
    calculateOpposingPlayerPenalty(game, position, currentPlayer) {
        // Find the opposing player
        const opposingPlayer = game.players.find(p => p !== currentPlayer);
        
        if (!opposingPlayer) return 0;
        
        // Check if this position is adjacent to the opposing player
        const rowDiff = Math.abs(position.row - opposingPlayer.position.row);
        const colDiff = Math.abs(position.col - opposingPlayer.position.col);
        
        // Adjacent means within 1 square (including diagonals)
        if (rowDiff <= 1 && colDiff <= 1 && !(rowDiff === 0 && colDiff === 0)) {
            return AI_CONFIG.OPPOSING_PLAYER_PENALTY;
        }
        
        return 0;
    }
    
    // Calculate the minimum distance from a position to any fence (public method for debug overlay)
    calculateFenceDistance(game, position) {
        if (game.fences.length === 0) return Infinity;
        
        let minDistance = Infinity;
        for (const fence of game.fences) {
            const distance = this.getDistanceToFence(position, fence);
            minDistance = Math.min(minDistance, distance);
        }
        return minDistance === Infinity ? Infinity : minDistance;
    }
    
    // Helper: Calculate the minimum distance from a position to a fence
    getDistanceToFence(position, fence) {
        let minDistance = Infinity;
        
        // Get all squares that the fence affects
        const fenceSquares = this.getFenceAffectedSquares(fence);
        
        // Calculate distance to each affected square
        for (const square of fenceSquares) {
            const distance = Math.abs(position.row - square.row) + Math.abs(position.col - square.col);
            minDistance = Math.min(minDistance, distance);
        }
        
        return minDistance;
    }
    
    // Helper: Get all squares that a fence directly affects (blocks movement between)
    getFenceAffectedSquares(fence) {
        const squares = [];
        
        if (fence.orientation === 'horizontal') {
            // Horizontal fence affects the squares above and below it
            squares.push({ row: fence.row, col: fence.col });
            squares.push({ row: fence.row, col: fence.col + 1 });
            squares.push({ row: fence.row + 1, col: fence.col });
            squares.push({ row: fence.row + 1, col: fence.col + 1 });
        } else {
            // Vertical fence affects the squares to the left and right of it
            squares.push({ row: fence.row, col: fence.col });
            squares.push({ row: fence.row + 1, col: fence.col });
            squares.push({ row: fence.row, col: fence.col + 1 });
            squares.push({ row: fence.row + 1, col: fence.col + 1 });
        }
        
        return squares;
    }
    
    // Helper: Check if a position is directly adjacent to any fence
    isAdjacentToAnyFence(game, position) {
        for (const fence of game.fences) {
            if (this.getDistanceToFence(position, fence) === 1) {
                return true;
            }
        }
        return false;
    }
    
    // Helper: Check if a position is adjacent to any square that is adjacent to a fence
    isAdjacentToFenceAdjacentSquare(game, position) {
        // Get all adjacent squares to this position
        const adjacentSquares = [
            { row: position.row - 1, col: position.col },     // Up
            { row: position.row + 1, col: position.col },     // Down
            { row: position.row, col: position.col - 1 },     // Left
            { row: position.row, col: position.col + 1 }      // Right
        ];
        
        // Check if any adjacent square is directly adjacent to a fence
        for (const square of adjacentSquares) {
            // Make sure the square is within bounds
            if (square.row >= 0 && square.row < game.size && 
                square.col >= 0 && square.col < game.size) {
                
                if (this.isAdjacentToAnyFence(game, square)) {
                    return true;
                }
            }
        }
        
        return false;
    }
}

