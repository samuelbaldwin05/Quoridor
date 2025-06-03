// Quoridor Game - JavaScript Implementation
class Position {
    constructor(row, col) {
        this.row = row;
        this.col = col;
    }

    equals(other) {
        return this.row === other.row && this.col === other.col;
    }

    toChessNotation() {
        return String.fromCharCode(97 + this.col) + (this.row + 1);
    }
}

class Fence {
    constructor(row, col, orientation) {
        this.row = row;
        this.col = col;
        this.orientation = orientation; // 'horizontal' or 'vertical'
    }

    equals(other) {
        return this.row === other.row && 
               this.col === other.col && 
               this.orientation === other.orientation;
    }

    blocksMovement(fromPos, toPos) {
        if (this.orientation === 'horizontal') {
            // Horizontal fence blocks vertical movement
            if (fromPos.col === toPos.col) {
                const minRow = Math.min(fromPos.row, toPos.row);
                const maxRow = Math.max(fromPos.row, toPos.row);
                return this.row >= minRow && this.row < maxRow &&
                       fromPos.col >= this.col && fromPos.col <= this.col + 1;
            }
        } else { // vertical
            // Vertical fence blocks horizontal movement
            if (fromPos.row === toPos.row) {
                const minCol = Math.min(fromPos.col, toPos.col);
                const maxCol = Math.max(fromPos.col, toPos.col);
                return this.col >= minCol && this.col < maxCol &&
                       fromPos.row >= this.row && fromPos.row <= this.row + 1;
            }
        }
        return false;
    }
}

class Player {
    constructor(id, startPos, goalRow, name) {
        this.id = id;
        this.position = startPos;
        this.goalRow = goalRow;
        this.fencesRemaining = 10;
        this.name = name;
    }

    hasWon() {
        return this.position.row === this.goalRow;
    }
}

class QuoridorGame {
    constructor() {
        this.size = 9;
        this.players = [];
        this.currentPlayerIndex = 0;
        this.fences = [];
        this.gameOver = false;
        this.fencePlacementMode = null;
        this.ai = new QuoridorAI('easy'); // Initialize with easy difficulty
        
        // Initialize players
        this.players = [
            new Player(1, new Position(8, 4), 0, "Human"),
            new Player(2, new Position(0, 4), 8, "Computer")
        ];
        
        this.initializeBoard();
        this.setupEventListeners();
        this.updateUI();
        this.showValidMovesForHuman();
    }

    initializeBoard() {
        const board = document.getElementById('board');
        board.innerHTML = '';
        
        // Create 17x17 grid (9 cells + 8 fence slots in each direction)
        for (let row = 0; row < 17; row++) {
            for (let col = 0; col < 17; col++) {
                const cell = document.createElement('div');
                
                if (row % 2 === 0 && col % 2 === 0) {
                    // Player cell (movement squares)
                    cell.className = 'cell';
                    cell.dataset.row = row / 2;
                    cell.dataset.col = col / 2;
                    cell.addEventListener('click', () => this.handleCellClick(row / 2, col / 2));
                } else {
                    // Fence slot
                    cell.className = 'fence-slot';
                    if (row % 2 === 1 && col % 2 === 0) {
                        // Horizontal fence slot (between rows)
                        cell.dataset.fenceType = 'horizontal';
                        cell.dataset.row = (row - 1) / 2;
                        cell.dataset.col = col / 2;
                        cell.addEventListener('click', () => this.handleFenceClick(cell));
                    } else if (row % 2 === 0 && col % 2 === 1) {
                        // Vertical fence slot (between columns)
                        cell.dataset.fenceType = 'vertical';
                        cell.dataset.row = row / 2;
                        cell.dataset.col = (col - 1) / 2;
                        cell.addEventListener('click', () => this.handleFenceClick(cell));
                    }
                    // Corner intersections don't get click handlers
                }
                
                board.appendChild(cell);
            }
        }
        
        this.updateBoardDisplay();
    }

    setupEventListeners() {
        // Movement buttons
        document.getElementById('move-up').addEventListener('click', () => this.makeMove('up'));
        document.getElementById('move-down').addEventListener('click', () => this.makeMove('down'));
        document.getElementById('move-left').addEventListener('click', () => this.makeMove('left'));
        document.getElementById('move-right').addEventListener('click', () => this.makeMove('right'));
        
        // Fence button
        document.getElementById('place-fence').addEventListener('click', () => this.toggleFenceMode());
        
        // New game button
        document.getElementById('new-game').addEventListener('click', () => this.newGame());
        
        // Difficulty selector
        document.getElementById('difficulty-select').addEventListener('change', (e) => {
            this.setDifficulty(e.target.value);
        });
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    switchPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.fencePlacementMode = null;
        this.updateUI();
        
        // If it's computer's turn, make computer move after a delay
        if (this.getCurrentPlayer().name === "Computer" && !this.gameOver) {
            setTimeout(() => this.makeComputerMove(), 1000);
        }
    }

    isValidPosition(pos) {
        return pos.row >= 0 && pos.row < this.size && pos.col >= 0 && pos.col < this.size;
    }

    isPositionOccupied(pos) {
        return this.players.some(player => player.position.equals(pos));
    }

    isMovementBlocked(fromPos, toPos) {
        return this.fences.some(fence => fence.blocksMovement(fromPos, toPos));
    }

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
                }
            } else {
                // Normal move - no player blocking
                validMoves.push(newPos);
            }
        }

        return validMoves;
    }

    isValidFencePlacement(fence) {
        // Check bounds - fences must span exactly 2 movement squares
        if (fence.orientation === 'horizontal') {
            // Horizontal fence: check if it can span 2 columns
            if (fence.row < 0 || fence.row >= this.size - 1) return false;
            if (fence.col < 0 || fence.col >= this.size - 1) return false;
        } else {
            // Vertical fence: check if it can span 2 rows  
            if (fence.row < 0 || fence.row >= this.size - 1) return false;
            if (fence.col < 0 || fence.col >= this.size - 1) return false;
        }

        // Check if fence already exists
        if (this.fences.some(f => f.equals(fence))) return false;

        // Check intersections
        for (const existingFence of this.fences) {
            if (this.fencesIntersect(fence, existingFence)) return false;
        }

        // Check if fence would block any player's path
        const tempFences = [...this.fences, fence];
        for (const player of this.players) {
            if (!this.hasPathToGoal(player, tempFences)) return false;
        }

        return true;
    }

    fencesIntersect(fence1, fence2) {
        if (fence1.orientation === fence2.orientation) {
            if (fence1.orientation === 'horizontal') {
                return fence1.row === fence2.row &&
                       !(fence1.col + 1 < fence2.col || fence2.col + 1 < fence1.col);
            } else {
                return fence1.col === fence2.col &&
                       !(fence1.row + 1 < fence2.row || fence2.row + 1 < fence1.row);
            }
        } else {
            // For perpendicular fences, they only intersect if they cross at their centers
            const hFence = fence1.orientation === 'horizontal' ? fence1 : fence2;
            const vFence = fence1.orientation === 'vertical' ? fence1 : fence2;
            
            // They intersect only if the vertical fence's column position is within 
            // the horizontal fence's span AND the horizontal fence's row position 
            // is within the vertical fence's span
            const hFenceSpansVertical = hFence.col < vFence.col && vFence.col < hFence.col + 1;
            const vFenceSpansHorizontal = vFence.row < hFence.row && hFence.row < vFence.row + 1;
            
            return hFenceSpansVertical && vFenceSpansHorizontal;
        }
    }

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

    isMovementBlockedByFences(fromPos, toPos, fences) {
        return fences.some(fence => fence.blocksMovement(fromPos, toPos));
    }

    isValidMove(player, targetPos) {
        const validMoves = this.getValidMoves(player);
        return validMoves.some(move => move.equals(targetPos));
    }

    makeMove(direction) {
        if (this.gameOver || this.getCurrentPlayer().name !== "Human") return;

        const player = this.getCurrentPlayer();
        const directions = {
            'up': { row: -1, col: 0 },
            'down': { row: 1, col: 0 },
            'left': { row: 0, col: -1 },
            'right': { row: 0, col: 1 }
        };

        const dir = directions[direction];
        
        // Get all valid moves first
        const validMoves = this.getValidMoves(player);
        
        // Find which valid move matches this direction
        let targetMove = null;
        
        // Check for single step move first
        const singleStepPos = new Position(
            player.position.row + dir.row,
            player.position.col + dir.col
        );
        
        targetMove = validMoves.find(pos => pos.equals(singleStepPos));
        
        // If no single step move, check for jump move
        if (!targetMove) {
            const jumpPos = new Position(
                player.position.row + dir.row * 2,
                player.position.col + dir.col * 2
            );
            targetMove = validMoves.find(pos => pos.equals(jumpPos));
        }

        if (targetMove) {
            player.position = targetMove;
            this.showMessage(`Human moved to ${targetMove.toChessNotation()}`, 'success');
            this.updateBoardDisplay();
            
            if (this.checkWinCondition()) return;
            this.switchPlayer();
        } else {
            this.showMessage('Invalid move!', 'error');
        }
    }

    toggleFenceMode() {
        if (this.gameOver || this.getCurrentPlayer().name !== "Human") return;
        if (this.getCurrentPlayer().fencesRemaining <= 0) {
            this.showMessage('No fences remaining!', 'error');
            return;
        }

        this.fencePlacementMode = this.fencePlacementMode ? null : 'active';
        this.updateFenceButtons();
        
        if (this.fencePlacementMode) {
            this.showMessage('Click a fence slot to place a fence', 'info');
        } else {
            this.showMessage('Fence placement cancelled', 'info');
        }
    }

    handleCellClick(row, col) {
        // Disabled click-to-move functionality - only use direction buttons
        return;
    }

    handleFenceClick(fenceSlot) {
        if (!this.fencePlacementMode || this.gameOver || this.getCurrentPlayer().name !== "Human") return;

        const fenceType = fenceSlot.dataset.fenceType;
        const row = parseInt(fenceSlot.dataset.row);
        const col = parseInt(fenceSlot.dataset.col);

        // Auto-detect fence orientation based on the slot type
        const orientation = fenceType;

        const fence = new Fence(row, col, orientation);
        
        if (this.isValidFencePlacement(fence)) {
            this.fences.push(fence);
            this.getCurrentPlayer().fencesRemaining--;
            
            this.showMessage(`${orientation.charAt(0).toUpperCase() + orientation.slice(1)} fence placed`, 'success');
            this.fencePlacementMode = null;
            this.updateFenceButtons();
            this.updateBoardDisplay();
            
            if (this.checkWinCondition()) return;
            this.switchPlayer();
        } else {
            this.showMessage('Invalid fence placement!', 'error');
        }
    }

    makeComputerMove() {
        if (this.gameOver || this.getCurrentPlayer().name !== "Computer") return;

        const player = this.getCurrentPlayer();
        
        // Use the AI module to make a move
        const aiDecision = this.ai.makeMove(this, player);
        
        if (aiDecision) {
            if (aiDecision.type === 'fence') {
                // AI decided to place a fence
                this.fences.push(aiDecision.fence);
                player.fencesRemaining--;
                this.showMessage(aiDecision.message, 'info');
                this.updateBoardDisplay();
                
                if (this.checkWinCondition()) return;
                this.switchPlayer();
            } else if (aiDecision.type === 'move') {
                // AI decided to move
                player.position = aiDecision.position;
                this.showMessage(aiDecision.message, 'info');
                this.updateBoardDisplay();
                
                if (this.checkWinCondition()) return;
                this.switchPlayer();
            }
        }
    }

    updateBoardDisplay() {
        // Clear all player and fence classes
        document.querySelectorAll('.cell').forEach(cell => {
            cell.className = 'cell';
            cell.textContent = '';
        });
        
        document.querySelectorAll('.fence-slot').forEach(slot => {
            slot.className = 'fence-slot';
        });

        // Place players
        this.players.forEach(player => {
            const cell = document.querySelector(`[data-row="${player.position.row}"][data-col="${player.position.col}"]`);
            if (cell) {
                cell.classList.add(`player${player.id}`);
                cell.textContent = player.id;
            }
        });

        // Place fences with improved visualization
        this.fences.forEach(fence => {
            if (fence.orientation === 'horizontal') {
                // Horizontal fence spans 2 columns
                for (let c = fence.col; c <= fence.col + 1; c++) {
                    const fenceSlot = document.querySelector(`[data-fence-type="horizontal"][data-row="${fence.row}"][data-col="${c}"]`);
                    if (fenceSlot) {
                        fenceSlot.classList.add('horizontal-fence');
                    }
                }
            } else {
                // Vertical fence spans 2 rows
                for (let r = fence.row; r <= fence.row + 1; r++) {
                    const fenceSlot = document.querySelector(`[data-fence-type="vertical"][data-row="${r}"][data-col="${fence.col}"]`);
                    if (fenceSlot) {
                        fenceSlot.classList.add('vertical-fence');
                    }
                }
            }
        });

        // Add fence posts at intersections where fences meet
        this.addFencePosts();
        
        // Show valid moves for human player
        this.showValidMovesForHuman();
    }

    addFencePosts() {
        // Check all intersection points (odd row, odd col in the 17x17 grid)
        for (let gridRow = 1; gridRow < 17; gridRow += 2) {
            for (let gridCol = 1; gridCol < 17; gridCol += 2) {
                const gameRow = (gridRow - 1) / 2;
                const gameCol = (gridCol - 1) / 2;
                
                // Check if there are fences meeting at this intersection
                const fencesAtIntersection = this.getFencesAtIntersection(gameRow, gameCol);
                
                // Show fence post if any fences touch this intersection
                if (fencesAtIntersection.length >= 1) {
                    // Find the intersection element in the DOM
                    const intersectionElement = document.querySelector(`.board`).children[gridRow * 17 + gridCol];
                    if (intersectionElement) {
                        intersectionElement.classList.add('fence-post');
                    }
                }
            }
        }
    }

    getFencesAtIntersection(row, col) {
        const fencesAtIntersection = [];
        
        // For each intersection point (row, col), check all 4 directions for fences
        // that touch this intersection point
        
        // Check horizontal fences that pass through this intersection
        // Horizontal fence from left (ending at this intersection)
        if (col > 0) {
            const leftHorizontalFence = this.fences.find(f => 
                f.orientation === 'horizontal' && 
                f.row === row && 
                f.col + 1 === col  // fence ends at this intersection
            );
            if (leftHorizontalFence) fencesAtIntersection.push(leftHorizontalFence);
        }
        
        // Horizontal fence to right (starting at this intersection)
        if (col < this.size - 1) {
            const rightHorizontalFence = this.fences.find(f => 
                f.orientation === 'horizontal' && 
                f.row === row && 
                f.col === col  // fence starts at this intersection
            );
            if (rightHorizontalFence) fencesAtIntersection.push(rightHorizontalFence);
        }
        
        // Check vertical fences that pass through this intersection
        // Vertical fence from above (ending at this intersection)
        if (row > 0) {
            const topVerticalFence = this.fences.find(f => 
                f.orientation === 'vertical' && 
                f.row + 1 === row && 
                f.col === col  // fence ends at this intersection
            );
            if (topVerticalFence) fencesAtIntersection.push(topVerticalFence);
        }
        
        // Vertical fence to bottom (starting at this intersection)
        if (row < this.size - 1) {
            const bottomVerticalFence = this.fences.find(f => 
                f.orientation === 'vertical' && 
                f.row === row && 
                f.col === col  // fence starts at this intersection
            );
            if (bottomVerticalFence) fencesAtIntersection.push(bottomVerticalFence);
        }
        
        return fencesAtIntersection;
    }

    updateUI() {
        // Update fence counts
        document.getElementById('player1-fences').textContent = this.players[0].fencesRemaining;
        document.getElementById('player2-fences').textContent = this.players[1].fencesRemaining;
        document.getElementById('fence-count').textContent = this.players[0].fencesRemaining;
        
        // Enable/disable controls based on current player
        const currentPlayer = this.getCurrentPlayer();
        const isHumanTurn = currentPlayer.name === "Human" && !this.gameOver;
        document.querySelectorAll('.direction-btn').forEach(btn => {
            btn.disabled = !isHumanTurn;
        });
        
        const fenceBtn = document.getElementById('place-fence');
        fenceBtn.disabled = !isHumanTurn || currentPlayer.fencesRemaining <= 0;
        
        this.updateFenceButtons();
    }

    updateFenceButtons() {
        const fenceBtn = document.getElementById('place-fence');
        fenceBtn.classList.remove('active');
        
        if (this.fencePlacementMode) {
            fenceBtn.classList.add('active');
        }
    }

    checkWinCondition() {
        for (const player of this.players) {
            if (player.hasWon()) {
                this.gameOver = true;
                this.winner = player;
                this.showWinner();
                return true;
            }
        }
        return false;
    }

    showWinner() {
        const celebration = document.createElement('div');
        celebration.className = 'winner-celebration';
        
        const message = document.createElement('div');
        message.className = 'winner-message';
        message.innerHTML = `
            <h2>🎉 ${this.winner.name} Wins! 🎉</h2>
            <p>${this.winner.name} reached ${this.winner.goalRow === 0 ? 'the top' : 'the bottom'} row!</p>
            <button class="action-btn" onclick="game.newGame(); this.parentElement.parentElement.remove();">Play Again</button>
        `;
        
        celebration.appendChild(message);
        document.body.appendChild(celebration);
        
        this.showMessage(`🎉 ${this.winner.name} wins the game! 🎉`, 'success');
    }

    showMessage(text, type = 'info') {
        const messageDisplay = document.getElementById('message');
        messageDisplay.textContent = text;
        messageDisplay.className = `message-display message-${type}`;
        
        // Clear message after 3 seconds
        setTimeout(() => {
            if (messageDisplay.textContent === text) {
                messageDisplay.textContent = 'Make your move!';
                messageDisplay.className = 'message-display';
            }
        }, 3000);
    }

    newGame() {
        // Remove any existing winner celebration
        const celebration = document.querySelector('.winner-celebration');
        if (celebration) {
            celebration.remove();
        }
        
        // Reset game state
        this.fences = [];
        this.currentPlayerIndex = 0;
        this.gameOver = false;
        this.winner = null;
        this.fencePlacementMode = null;
        
        // Reset players
        this.players[0].position = new Position(8, 4);
        this.players[0].fencesRemaining = 10;
        this.players[1].position = new Position(0, 4);
        this.players[1].fencesRemaining = 10;
        
        // Update display
        this.updateBoardDisplay();
        this.updateUI();
        this.showMessage('New game started! Make your move.', 'info');
    }

    clearValidMoves() {
        document.querySelectorAll('.valid-move').forEach(cell => {
            cell.classList.remove('valid-move');
        });
    }

    showValidMovesForHuman() {
        // Clear any existing valid move indicators first
        this.clearValidMoves();
        
        // Only show valid moves when it's the human player's turn and game is not over
        if (this.getCurrentPlayer().name === "Human" && !this.gameOver) {
            const validMoves = this.getValidMoves(this.getCurrentPlayer());
            validMoves.forEach(move => {
                const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
                if (cell && !cell.classList.contains('player1') && !cell.classList.contains('player2')) {
                    cell.classList.add('valid-move');
                }
            });
        }
    }

    setDifficulty(difficulty) {
        this.ai = new QuoridorAI(difficulty);
        this.showMessage(`AI difficulty set to ${this.ai.getDifficultyName()}`, 'info');
    }
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new QuoridorGame();
}); 