// Game Engine - Pure game logic with no DOM dependencies
class GameEngine {
    constructor() {
        this.size = GAME_CONFIG.BOARD_SIZE;
        this.players = [];
        this.currentPlayerIndex = 0;
        this.fences = [];
        this.gameOver = false;
        this.gameStarted = false;
        
        // Initialize players
        this.players = [
            new Player(1, new Position(GAME_CONFIG.PLAYER1_START_ROW, GAME_CONFIG.PLAYER1_START_COL), GAME_CONFIG.PLAYER1_GOAL_ROW, "Human"),
            new Player(2, new Position(GAME_CONFIG.PLAYER2_START_ROW, GAME_CONFIG.PLAYER2_START_COL), GAME_CONFIG.PLAYER2_GOAL_ROW, "Computer")
        ];
    }
    
    // Get current player
    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }
    
    // Switch to next player
    switchPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
    
    // Check if position is valid on the board
    isValidPosition(pos) {
        return pos.row >= 0 && pos.row < this.size && pos.col >= 0 && pos.col < this.size;
    }
    
    // Check if a position is occupied by any player
    isPositionOccupied(pos) {
        return this.players.some(player => player.position.equals(pos));
    }
    
    // Check if movement is blocked by fences
    isMovementBlocked(fromPos, toPos) {
        return this.fences.some(fence => fence.blocksMovement(fromPos, toPos));
    }
    
    // Check if movement is blocked by specific set of fences
    isMovementBlockedByFences(fromPos, toPos, fences) {
        return fences.some(fence => fence.blocksMovement(fromPos, toPos));
    }
    
    // Get all valid moves for a player
    getValidMoves(player) {
        const validMoves = [];
        const directions = [
            { row: -1, col: 0 }, // up
            { row: 1, col: 0 },  // down
            { row: 0, col: -1 }, // left
            { row: 0, col: 1 }   // right
        ];

        for (const dir of directions) {
            const newPos = new Position(
                player.position.row + dir.row,
                player.position.col + dir.col
            );

            if (!this.isValidPosition(newPos)) continue;
            if (this.isMovementBlocked(player.position, newPos)) continue;

            if (this.isPositionOccupied(newPos)) {
                // There's another player in this position - try to jump straight over
                const jumpPos = new Position(
                    newPos.row + dir.row,
                    newPos.col + dir.col
                );

                // Check if we can jump straight over
                if (this.isValidPosition(jumpPos) && 
                    !this.isMovementBlocked(newPos, jumpPos) &&
                    !this.isPositionOccupied(jumpPos)) {
                    validMoves.push(jumpPos);
                } else {
                    // Straight jump is blocked - check for diagonal jumps
                    // When moving vertically (up/down), check left and right diagonal jumps
                    // When moving horizontally (left/right), check up and down diagonal jumps
                    
                    const diagonalDirections = [];
                    if (dir.row !== 0) {
                        // Moving vertically, so check left and right diagonals
                        diagonalDirections.push({ row: 0, col: -1 }); // left
                        diagonalDirections.push({ row: 0, col: 1 });  // right
                    } else {
                        // Moving horizontally, so check up and down diagonals
                        diagonalDirections.push({ row: -1, col: 0 }); // up
                        diagonalDirections.push({ row: 1, col: 0 });  // down
                    }
                    
                    for (const diagDir of diagonalDirections) {
                        const diagJumpPos = new Position(
                            newPos.row + diagDir.row,
                            newPos.col + diagDir.col
                        );
                        
                        // Check if diagonal jump is valid
                        if (this.isValidPosition(diagJumpPos) &&
                            !this.isMovementBlocked(newPos, diagJumpPos) &&
                            !this.isPositionOccupied(diagJumpPos)) {
                            validMoves.push(diagJumpPos);
                        }
                    }
                }
            } else {
                // Normal move - no player blocking
                validMoves.push(newPos);
            }
        }

        return validMoves;
    }
    
    // Check if a move is valid for a player
    isValidMove(player, targetPos) {
        const validMoves = this.getValidMoves(player);
        return validMoves.some(move => move.equals(targetPos));
    }
    
    // Try to move a player to a position (returns success boolean)
    tryMove(player, targetPos) {
        if (this.gameOver || !this.gameStarted) return false;
        
        if (this.isValidMove(player, targetPos)) {
            player.position = targetPos;
            return true;
        }
        return false;
    }
    
    // Check if fence placement is valid
    isValidFencePlacement(fence) {
        // Check bounds - fences must span exactly 2 movement squares
        if (fence.orientation === 'horizontal') {
            // Horizontal fence: check if it can span 2 columns
            if (fence.row < 0 || fence.row >= this.size - 1) {
                return false;
            }
            if (fence.col < 0 || fence.col >= this.size - 1) {
                return false;
            }
        } else {
            // Vertical fence: check if it can span 2 rows  
            if (fence.row < 0 || fence.row >= this.size - 1) {
                return false;
            }
            if (fence.col < 0 || fence.col >= this.size - 1) {
                return false;
            }
        }

        // Check if fence already exists
        if (this.fences.some(f => f.equals(fence))) {
            return false;
        }

        // Check for fence post overlaps
        if (this.wouldFencePostOverlap(fence)) {
            return false;
        }

        // Check intersections
        for (const existingFence of this.fences) {
            if (this.fencesIntersect(fence, existingFence)) {
                return false;
            }
        }

        // Check if fence would block any player's path
        const tempFences = [...this.fences, fence];
        for (const player of this.players) {
            if (!this.hasPathToGoal(player, tempFences)) {
                return false;
            }
        }

        return true;
    }
    
    // Try to place a fence (returns success boolean)
    tryPlaceFence(fence) {
        if (this.gameOver || !this.gameStarted) return false;
        
        if (this.isValidFencePlacement(fence)) {
            this.fences.push(fence);
            return true;
        }
        return false;
    }
    
    // Check if two fences intersect
    fencesIntersect(fence1, fence2) {
        if (fence1.orientation === fence2.orientation) {
            // Same orientation fences overlap if they're on the same row/col and their spans overlap
            if (fence1.orientation === 'horizontal') {
                return fence1.row === fence2.row &&
                       !(fence1.col + 1 < fence2.col || fence2.col + 1 < fence1.col);
            } else {
                return fence1.col === fence2.col &&
                       !(fence1.row + 1 < fence2.row || fence2.row + 1 < fence1.row);
            }
        } else {
            // Different orientations: check if they actually cross through each other
            // For integer coordinates, perpendicular fences can never truly cross
            // They can only meet at endpoints (which should be allowed)
            return false; // Allow all perpendicular fence combinations
        }
    }
    
    // Check if a player has a path to their goal with given fences
    hasPathToGoal(player, fences) {
        const visited = new Set();
        const queue = [player.position];
        visited.add(`${player.position.row},${player.position.col}`);

        while (queue.length > 0) {
            const currentPos = queue.shift();

            if (currentPos.row === player.goalRow) {
                return true;
            }

            const directions = [
                { row: -1, col: 0 }, { row: 1, col: 0 },
                { row: 0, col: -1 }, { row: 0, col: 1 }
            ];

            for (const dir of directions) {
                const newPos = new Position(
                    currentPos.row + dir.row,
                    currentPos.col + dir.col
                );

                const posKey = `${newPos.row},${newPos.col}`;
                
                if (this.isValidPosition(newPos) && 
                    !visited.has(posKey) &&
                    !this.isMovementBlockedByFences(currentPos, newPos, fences)) {
                    visited.add(posKey);
                    queue.push(newPos);
                }
            }
        }

        return false;
    }
    
    // Check if fence post would overlap with existing fence
    wouldFencePostOverlap(fence) {
        // Calculate where this fence's post would be located in grid coordinates
        const newFencePostRow = fence.row * 2 + 1;
        const newFencePostCol = fence.col * 2 + 1;
        
        // Check if any existing fence has a post at the same location
        for (const existingFence of this.fences) {
            const existingFencePostRow = existingFence.row * 2 + 1;
            const existingFencePostCol = existingFence.col * 2 + 1;
            
            // If the post positions match, there would be an overlap
            if (newFencePostRow === existingFencePostRow && newFencePostCol === existingFencePostCol) {
                return true;
            }
        }
        
        return false;
    }
    
    // Check win condition and return winner if game is over
    checkWinCondition() {
        for (const player of this.players) {
            if (player.hasWon()) {
                this.gameOver = true;
                return player; // Return winner
            }
        }
        return null; // No winner yet
    }
    
    // Reset game to initial state
    reset() {
        this.fences = [];
        this.currentPlayerIndex = 0;
        this.gameOver = false;
        this.gameStarted = true;
        
        // Reset players
        this.players[0].position = new Position(GAME_CONFIG.PLAYER1_START_ROW, GAME_CONFIG.PLAYER1_START_COL);
        this.players[0].fencesRemaining = GAME_CONFIG.INITIAL_FENCE_COUNT;
        this.players[1].position = new Position(GAME_CONFIG.PLAYER2_START_ROW, GAME_CONFIG.PLAYER2_START_COL);
        this.players[1].fencesRemaining = GAME_CONFIG.INITIAL_FENCE_COUNT;
    }
    
    // Start the game
    start() {
        this.gameStarted = true;
    }
}

