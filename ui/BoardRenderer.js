// Board Renderer - Handles all board-related DOM manipulation
class BoardRenderer {
    constructor(game) {
        this.game = game; // Reference to game instance for accessing state
    }
    
    // Initialize the board DOM structure
    initializeBoard(onCellClick, onFenceClick, onFencePreview, onFencePreviewHide) {
        const board = document.getElementById('board');
        board.innerHTML = '';
        
        // Create grid (9 cells + 8 fence slots in each direction)
        for (let row = 0; row < GAME_CONFIG.GRID_SIZE; row++) {
            for (let col = 0; col < GAME_CONFIG.GRID_SIZE; col++) {
                const cell = document.createElement('div');
                
                if (row % 2 === 0 && col % 2 === 0) {
                    // Player cell (movement squares)
                    cell.className = 'cell flex-center';
                    cell.dataset.row = row / 2;
                    cell.dataset.col = col / 2;
                    cell.addEventListener('click', () => onCellClick(row / 2, col / 2));
                } else {
                    // Fence slot
                    cell.className = 'fence-slot';
                    if (row % 2 === 1 && col % 2 === 0) {
                        // Horizontal fence slot (between rows)
                        cell.dataset.fenceType = 'horizontal';
                        cell.dataset.row = (row - 1) / 2;
                        cell.dataset.col = col / 2;
                        cell.addEventListener('click', () => onFenceClick(cell));
                        cell.addEventListener('mouseenter', () => onFencePreview(cell));
                        cell.addEventListener('mouseleave', () => onFencePreviewHide());
                    } else if (row % 2 === 0 && col % 2 === 1) {
                        // Vertical fence slot (between columns)
                        cell.dataset.fenceType = 'vertical';
                        cell.dataset.row = row / 2;
                        cell.dataset.col = (col - 1) / 2;
                        cell.addEventListener('click', () => onFenceClick(cell));
                        cell.addEventListener('mouseenter', () => onFencePreview(cell));
                        cell.addEventListener('mouseleave', () => onFencePreviewHide());
                    }
                    // Corner intersections don't get click handlers
                }
                
                board.appendChild(cell);
            }
        }
        
        this.updateBoardDisplay();
    }
    
    // Update the board display with current game state
    updateBoardDisplay() {
        // Clear all player and fence classes
        document.querySelectorAll('.cell').forEach(cell => {
            cell.className = 'cell flex-center';
            cell.textContent = '';
        });
        
        document.querySelectorAll('.fence-slot').forEach(slot => {
            slot.className = 'fence-slot';
        });

        // Place players
        this.game.players.forEach(player => {
            const cell = document.querySelector(`[data-row="${player.position.row}"][data-col="${player.position.col}"]`);
            if (cell) {
                cell.classList.add(`player${player.id}`);
                cell.textContent = player.id;
            }
        });

        // Place fences with improved visualization
        this.game.fences.forEach(fence => {
            if (fence.orientation === 'horizontal') {
                // Horizontal fence spans 2 columns with a post in the middle
                for (let c = fence.col; c <= fence.col + 1; c++) {
                    const fenceSlot = document.querySelector(`[data-fence-type="horizontal"][data-row="${fence.row}"][data-col="${c}"]`);
                    if (fenceSlot) {
                        fenceSlot.classList.add('horizontal-fence');
                    }
                }
                // Add fence post in the middle of the horizontal fence
                const middlePostRow = fence.row * 2 + 1; // Convert to grid coordinates
                const middlePostCol = fence.col * 2 + 1; // Middle of the fence span
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * GAME_CONFIG.GRID_SIZE + middlePostCol];
                if (middlePostElement) {
                    middlePostElement.classList.add('fence-post');
                }
            } else {
                // Vertical fence spans 2 rows with a post in the middle
                for (let r = fence.row; r <= fence.row + 1; r++) {
                    const fenceSlot = document.querySelector(`[data-fence-type="vertical"][data-row="${r}"][data-col="${fence.col}"]`);
                    if (fenceSlot) {
                        fenceSlot.classList.add('vertical-fence');
                    }
                }
                // Add fence post in the middle of the vertical fence
                const middlePostRow = fence.row * 2 + 1; // Middle of the fence span
                const middlePostCol = fence.col * 2 + 1; // Convert to grid coordinates
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * GAME_CONFIG.GRID_SIZE + middlePostCol];
                if (middlePostElement) {
                    middlePostElement.classList.add('fence-post');
                }
            }
        });
        
        // Note: updateUI is called by the game after updateBoardDisplay
    }
    
    // Clear valid move indicators
    clearValidMoves() {
        document.querySelectorAll('.valid-move').forEach(cell => {
            cell.classList.remove('valid-move');
            cell.style.cursor = 'default';
            cell.removeAttribute('title');
        });
    }
    
    // Show valid moves for human player
    showValidMovesForHuman() {
        // Clear any existing valid move indicators first
        this.clearValidMoves();
        
        // Only show valid moves if game has started and it's human's turn
        const humanPlayer = this.game.players[0]; // Human is always player 1
        if (this.game.gameStarted && !this.game.gameOver && this.game.getCurrentPlayer().name === "Human") {
            const validMoves = this.game.getValidMoves(humanPlayer);
            validMoves.forEach(move => {
                const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
                if (cell && !cell.classList.contains('player1') && !cell.classList.contains('player2')) {
                    cell.classList.add('valid-move');
                    
                    // Add visual feedback for click-to-move when enabled
                    if (this.game.clickMoveEnabled) {
                        cell.style.cursor = 'pointer';
                        cell.title = `Click to move to ${move.toChessNotation()}`;
                    } else {
                        cell.style.cursor = 'default';
                        cell.title = `Use arrow keys or WASD to move to ${move.toChessNotation()}`;
                    }
                }
            });
        }
    }
    
    // Show fence placement preview
    showFencePreview(fenceSlot) {
        // Only show preview during human's turn and when game is started and not over
        if (this.game.getCurrentPlayer().name !== "Human" || this.game.gameOver || !this.game.gameStarted) {
            return;
        }
        
        const fenceType = fenceSlot.dataset.fenceType;
        const row = parseInt(fenceSlot.dataset.row);
        const col = parseInt(fenceSlot.dataset.col);
        const orientation = fenceType;

        const fence = new Fence(row, col, orientation);
        
        // Check if this would be a valid fence placement
        const isValid = this.game.isValidFencePlacement(fence) && 
                       this.game.getCurrentPlayer().fencesRemaining > 0;
        
        // Remove any existing previews first
        this.hideFencePreview();

        if (isValid) {
            // Show complete fence preview in green for valid placements
            if (orientation === 'horizontal') {
                // Horizontal fence spans 2 columns with a post in the middle
                for (let c = col; c <= col + 1; c++) {
                    const previewSlot = document.querySelector(`[data-fence-type="horizontal"][data-row="${row}"][data-col="${c}"]`);
                    if (previewSlot) {
                        previewSlot.classList.add('fence-preview-valid');
                    }
                }
                // Add fence post preview in the middle of the horizontal fence
                const middlePostRow = row * 2 + 1; // Convert to grid coordinates
                const middlePostCol = col * 2 + 1; // Middle of the fence span
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * GAME_CONFIG.GRID_SIZE + middlePostCol];
                if (middlePostElement) {
                    middlePostElement.classList.add('fence-post-preview');
                }
            } else {
                // Vertical fence spans 2 rows with a post in the middle
                for (let r = row; r <= row + 1; r++) {
                    const previewSlot = document.querySelector(`[data-fence-type="vertical"][data-row="${r}"][data-col="${col}"]`);
                    if (previewSlot) {
                        previewSlot.classList.add('fence-preview-valid');
                    }
                }
                // Add fence post preview in the middle of the vertical fence
                const middlePostRow = row * 2 + 1; // Middle of the fence span
                const middlePostCol = col * 2 + 1; // Convert to grid coordinates
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * GAME_CONFIG.GRID_SIZE + middlePostCol];
                if (middlePostElement) {
                    middlePostElement.classList.add('fence-post-preview');
                }
            }
        } else {
            // Show only the hovered slot in red for invalid placements
            fenceSlot.classList.add('fence-preview-invalid');
        }
    }
    
    // Hide fence preview
    hideFencePreview() {
        // Remove all fence preview classes
        document.querySelectorAll('.fence-preview-valid').forEach(element => {
            element.classList.remove('fence-preview-valid');
        });
        document.querySelectorAll('.fence-preview-invalid').forEach(element => {
            element.classList.remove('fence-preview-invalid');
        });
        document.querySelectorAll('.fence-post-preview').forEach(element => {
            element.classList.remove('fence-post-preview');
        });
    }
    
    // Show debug overlay
    showDebugOverlay() {
        // Remove any existing debug overlays first
        this.hideDebugOverlay();
        
        if (!this.game.gameStarted) return;
        
        const humanPlayer = this.game.players.find(p => p.name === "Human");
        const aiPlayer = this.game.players.find(p => p.name === "Computer");
        
        // Use AI's pathfinding methods directly (no duplication!)
        const humanPathData = this.game.ai.getShortestPathFromPosition(this.game, humanPlayer);
        const aiPathData = this.game.ai.getShortestPathFromPosition(this.game, aiPlayer);
        
        for (let row = 0; row < this.game.size; row++) {
            for (let col = 0; col < this.game.size; col++) {
                const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                if (!cell) continue;
                
                const position = new Position(row, col);
                
                // Check if this position is on either player's optimal path
                const isOnHumanPath = humanPathData.path.some(p => p.row === row && p.col === col);
                const isOnAiPath = aiPathData.path.some(p => p.row === row && p.col === col);
                
                // Use AI's methods for all calculations (no duplication!)
                const fenceDistance = this.game.ai.calculateFenceDistance(this.game, position);
                const fenceProximityPenalty = this.game.ai.calculateFenceProximityPenalty(this.game, position);
                const opposingPlayerPenalty = this.game.calculateOpposingPlayerPenaltyUsingAI(position);
                const totalPenalty = fenceProximityPenalty + opposingPlayerPenalty;
                const squareValue = 1 + totalPenalty;
                
                // Format: fence_distance/square_value (show 'x' if no fences, no decimals for fence distance, 2 decimals for square value)
                const fenceDistanceDisplay = fenceDistance === Infinity ? 'x' : Math.round(fenceDistance).toString();
                const distanceDisplay = `${fenceDistanceDisplay}/${squareValue.toFixed(2)}`;
                
                // Create path indicators with individual spans for coloring
                let pathIndicators = '';
                if (isOnHumanPath && isOnAiPath) {
                    pathIndicators = '<span class="human-path">O</span><span class="ai-path">X</span>';
                } else if (isOnHumanPath) {
                    pathIndicators = '<span class="human-path">O</span>';
                } else if (isOnAiPath) {
                    pathIndicators = '<span class="ai-path">X</span>';
                }
                
                // Create debug info element
                const debugInfo = document.createElement('div');
                debugInfo.className = 'debug-info flex-column flex-between flex-center';
                debugInfo.innerHTML = `
                    <div class="position">(${row}, ${col})</div>
                    <div class="distance">${distanceDisplay}</div>
                    <div class="paths">${pathIndicators}</div>
                `;
                
                cell.appendChild(debugInfo);
            }
        }
    }
    
    // Hide debug overlay
    hideDebugOverlay() {
        const debugInfos = document.querySelectorAll('.debug-info');
        debugInfos.forEach(info => info.remove());
    }
}

