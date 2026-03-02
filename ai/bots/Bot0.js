// Bot 0: Movement-Only AI - uses shortest path but cannot place fences
class Bot0 extends BotStrategy {
    makeMove(game, player) {
        const validMoves = game.getValidMoves(player);
        
        if (validMoves.length > 0) {
            // FIRST PRIORITY: Check if we can win in one move
            const winningMove = this.pathfinder.findWinningMove(game, player, validMoves);
            if (winningMove) {
                return {
                    type: 'move',
                    position: winningMove,
                    message: `Computer wins! Moved to ${winningMove.toChessNotation()}`
                };
            }
            
            // Always use Dijkstra to find the shortest path move
            const bestMove = this.pathfinder.findBestMoveWithDijkstra(game, player);
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
}

