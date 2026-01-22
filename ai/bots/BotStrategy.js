// Base class for AI bot strategies
class BotStrategy {
    constructor(pathfinder) {
        this.pathfinder = pathfinder;
    }
    
    // Abstract method - must be implemented by subclasses
    makeMove(game, player) {
        throw new Error('makeMove() must be implemented by subclass');
    }
    
    // Helper: Get all valid fence placements
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
    
    // Helper: Get multiple fence positions directly in front of opponent
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
    
    // Helper: Get vertical fences to place next to opponent
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
}

