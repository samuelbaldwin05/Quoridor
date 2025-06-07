// AI Module for Quoridor Game
// Contains different AI bots

class QuoridorAI {
    constructor(botType = 'bot2') {
        this.botType = botType;
        this.humanMoveHistory = []; // Track human moves for analysis
        this.bestHumanMove = null; // Track the best move the human could make
        this.moveCount = 0; // Track number of moves made by AI
        this.previousPosition = null; // Track AI's previous position to avoid unnecessary backtracking
        this.bot2OpeningPattern = null; // Track Bot 2's opening pattern
        this.bot2OpeningStep = 0; // Track Bot 2's opening step
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
    }

    // Reset AI state for new game
    resetGameState() {
        this.moveCount = 0;
        this.humanMoveHistory = [];
        this.bestHumanMove = null;
        this.previousPosition = null;
        this.bot2OpeningPattern = null;
        this.bot2OpeningStep = 0;
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
        if (this.botType === 'bot0') {
            return this.makeBot0Move(game, player);
        } else if (this.botType === 'bot1') {
            return this.makeBot1Move(game, player);
        } else {
            return this.makeBot2Move(game, player);
        }
    }

    // Bot 0: Movement-Only AI - uses shortest path but cannot place fences
    makeBot0Move(game, player) {
        const validMoves = game.getValidMoves(player);
        
        if (validMoves.length > 0) {
            // FIRST PRIORITY: Check if we can win in one move
            const winningMove = this.findWinningMove(game, player, validMoves);
            if (winningMove) {
                return {
                    type: 'move',
                    position: winningMove,
                    message: `Computer wins! Moved to ${winningMove.toChessNotation()}`
                };
            }
            
            // Always use Dijkstra to find the shortest path move
            const bestMove = this.findBestMoveWithDijkstra(game, player);
            if (bestMove) {
                return {
                    type: 'move',
                    position: bestMove,
                    message: `Computer moved to ${bestMove.toChessNotation()}`
                };
            } else {
                // Fallback to any valid move if Dijkstra fails
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

    // Bot 1: Basic Strategic - Random early moves with basic fence placement
    makeBot1Move(game, player) {
        const validMoves = game.getValidMoves(player);
        if (validMoves.length === 0) return null;

        // FIRST PRIORITY: Check if we can win in one move
        const winningMove = this.findWinningMove(game, player, validMoves);
        if (winningMove) {
            return { type: 'move', position: winningMove };
        }

        // SECOND PRIORITY: Random movement in early game (50% chance in first 3 moves)
        if (this.moveCount <= 3 && Math.random() < 0.5) {
            const randomMove = this.findRandomMoveAvoidingBacktrack(game, player);
            if (randomMove) {
                return { type: 'move', position: randomMove };
            }
        }

        // THIRD PRIORITY: Try high-impact fence (increases opponent path by 3+)
        const opponent = game.players.find(p => p !== player);
        if (player.fencesRemaining > 0) {
            const highImpactFence = this.findBot1HighImpactFence(game, opponent);
            if (highImpactFence) {
                return { type: 'fence', fence: highImpactFence };
            }
        }

        // FOURTH PRIORITY: Try strategic fence when opponent is close
        if (player.fencesRemaining > 0 && opponent.position.row >= 6) {
            const strategicFence = this.findBot1StrategicFence(game, opponent);
            if (strategicFence) {
                return { type: 'fence', fence: strategicFence };
            }
        }

        // FIFTH PRIORITY: Try side fence for lateral blocking
        if (player.fencesRemaining > 0) {
            const sideFence = this.findBot1SideFence(game, opponent);
            if (sideFence) {
                return { type: 'fence', fence: sideFence };
            }
        }

        // SIXTH PRIORITY: Use Dijkstra to find best move
        const bestMove = this.findBestMoveWithDijkstra(game, player);
        if (bestMove) {
            return { type: 'move', position: bestMove };
        }

        // FALLBACK: Take any valid move
        return { type: 'move', position: validMoves[0] };
    }

    // Bot 2: Advantage-focused AI (current implementation)
    makeBot2Move(game, player) {
        return this.makeSimpleMove(game, player);
    }

    // Simplified AI - Basic strategic logic without complex forward thinking
    makeSimpleMove(game, player) {
        const opponent = game.players.find(p => p !== player);
        
        // Bot 2 specific opening strategy (first 2 moves) - FIRST PRIORITY
        if (this.moveCount <= 1 && Math.random() < 0.75) {
            const openingMove = this.findBot2OpeningMove(game, player);
            if (openingMove) {
                return {
                    type: 'move',
                    position: openingMove,
                    message: `Computer moved to ${openingMove.toChessNotation()}`
                };
            }
        }
        
        const validMoves = game.getValidMoves(player);
        
        if (validMoves.length > 0) {
            // SECOND PRIORITY: Check if we can win in one move
            const winningMove = this.findWinningMove(game, player, validMoves);
            if (winningMove) {
                return {
                    type: 'move',
                    position: winningMove,
                    message: `Computer wins! Moved to ${winningMove.toChessNotation()}`
                };
            }
        }
        
        // Check if opponent moved closer to goal
        const opponentDistanceToGoal = this.dijkstraDistance(game, opponent.position, opponent.goalRow);
        
        // Check if opponent is actually close to their goal row (not just close in path)
        const opponentRowDistanceToGoal = Math.abs(opponent.position.row - opponent.goalRow);
        
        if (validMoves.length > 0) {
            // Third priority: Check if any fence can increase opponent's path by 3+ moves
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
            
            // Fourth priority: Only place fence if opponent is within 3 tiles AND close to their actual goal row
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

    // Bot 2 specific opening move patterns
    findBot2OpeningMove(game, player) {
        if (!this.bot2OpeningPattern) {
            // Initialize opening pattern for Bot 2 with weighted selection
            const patterns = [
                { moves: ['left', 'left'], weight: 2 },                          // 1. left left (normal weight)
                { moves: ['down', 'left'], weight: 2 },                          // 2. left down (normal weight)
                { moves: ['down', 'right'], weight: 2 },                         // 3. right down (normal weight)
                { moves: ['right', 'right'], weight: 2 },                        // 4. right right (normal weight)
                { moves: ['left', 'down', 'left'], weight: 2 },          // 5. left down left down (normal weight)
                { moves: ['right', 'down', 'right'], weight: 2 },        // 6. right down right down (normal weight)
                { moves: ['left', 'left', 'left'], weight: 1 },                  // 7. left left left (half weight)
                { moves: ['right', 'right', 'right'], weight: 1 }                // 8. right right right (half weight)
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
            return this.findBestMoveWithDijkstra(game, player);
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

    // Dijkstra's algorithm to find shortest path distance (now includes jumping and fence proximity penalties)
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
        // Distance 0 (adjacent to fence) = 0.10 penalty
        // Distance 1 (next to adjacent) = 0.05 penalty
        // Distance 2 = 0.03 penalty
        // Distance 3 = 0.01 penalty
        // Distance 4+ = 0 penalty
        if (minDistance === 0) {
            return 0.10;
        } else if (minDistance === 1) {
            return 0.05;
        } else if (minDistance === 2) {
            return 0.03;
        } else if (minDistance === 3) {
            return 0.01;
        } else {
            return 0;
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
            return 0.1; // 0.1 penalty for being adjacent to opposing player
        }
        
        return 0;
    }

    // Check if a position is directly adjacent to any fence
    isAdjacentToAnyFence(game, position) {
        for (const fence of game.fences) {
            if (this.getDistanceToFence(position, fence) === 1) {
                return true;
            }
        }
        return false;
    }

    // Check if a position is adjacent to any square that is adjacent to a fence
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

    // Calculate the minimum distance from a position to a fence
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

    // Get all squares that a fence directly affects (blocks movement between)
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

    // Find best move using Dijkstra's algorithm (now properly considers jumping)
    findBestMoveWithDijkstra(game, player) {
        const validMoves = game.getValidMoves(player);
        if (validMoves.length === 0) return null;

        // Calculate the optimal path from current position to goal (same as debug overlay)
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

    // Get shortest path from current position (same logic as debug overlay)
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
        switch (this.botType) {
            case 'bot0': return 'Bot 0 - Movement Only';
            case 'bot1': return 'Bot 1 - Basic Strategic';
            case 'bot2': return 'Bot 2 - Advantage Focused';
            default: return 'Bot 2 - Advantage Focused';
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
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuoridorAI;
} 