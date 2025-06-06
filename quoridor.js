// Quoridor Game - JavaScript Implementation

// Audio Manager for handling sound effects
class AudioManager {
    constructor() {
        this.sounds = {
            start: new Audio('SoundEffects/start.mp3'),
            click: new Audio('SoundEffects/click.mp3'),
            clack: new Audio('SoundEffects/clack.mp3'),
            win1: new Audio('SoundEffects/win1.mp3'),
            lose: new Audio('SoundEffects/lose.mp3')
        };
        
        // Set default volume levels
        Object.values(this.sounds).forEach(audio => {
            audio.volume = 0.7; // Set to 70% volume
        });
        
        this.enabled = true; // Allow users to disable sounds if needed
    }
    
    play(soundName) {
        if (!this.enabled || !this.sounds[soundName]) return;
        
        try {
            // Reset the audio to beginning and play
            this.sounds[soundName].currentTime = 0;
            this.sounds[soundName].play().catch(error => {
                // Handle autoplay restrictions gracefully
                console.log('Audio play prevented:', error);
            });
        } catch (error) {
            console.log('Audio error:', error);
        }
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    setVolume(volume) {
        // Volume should be between 0 and 1
        const normalizedVolume = Math.max(0, Math.min(1, volume));
        Object.values(this.sounds).forEach(audio => {
            audio.volume = normalizedVolume;
        });
    }
}

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
        this.gameStarted = false; // Track if game has started
        this.fencePlacementMode = 'active'; // Set fence placement mode to 'active' for human players
        this.ai = new QuoridorAI(); // Initialize AI with default settings
        this.audioManager = new AudioManager(); // Initialize audio manager
        
        // Development mode tracking
        this.moveNumber = 1;
        this.lastAiMoveTime = 0;
        this.aiMoveTimes = []; // Track all AI move times for averaging
        this.devModeEnabled = false;
        this.keyboardEnabled = true; // Track keyboard controls setting
        this.clickMoveEnabled = true; // Track click-to-move setting
        
        // Initialize players
        this.players = [
            new Player(1, new Position(8, 4), 0, "Human"),
            new Player(2, new Position(0, 4), 8, "Computer")
        ];
        
        this.initializeBoard();
        this.setupEventListeners();
        this.updateUI();
        
        // Show start button and don't show valid moves until game is started
        this.showStartButton();
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
                        cell.addEventListener('mouseenter', () => this.showFencePreview(cell));
                        cell.addEventListener('mouseleave', () => this.hideFencePreview());
                    } else if (row % 2 === 0 && col % 2 === 1) {
                        // Vertical fence slot (between columns)
                        cell.dataset.fenceType = 'vertical';
                        cell.dataset.row = row / 2;
                        cell.dataset.col = (col - 1) / 2;
                        cell.addEventListener('click', () => this.handleFenceClick(cell));
                        cell.addEventListener('mouseenter', () => this.showFencePreview(cell));
                        cell.addEventListener('mouseleave', () => this.hideFencePreview());
                    }
                    // Corner intersections don't get click handlers
                }
                
                board.appendChild(cell);
            }
        }
        
        this.updateBoardDisplay();
    }

    setupEventListeners() {
        // Game control buttons
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('new-game').addEventListener('click', () => this.newGame());
        document.getElementById('show-rules').addEventListener('click', () => {
            document.getElementById('rules-modal').style.display = 'flex';
        });
        document.getElementById('close-rules').addEventListener('click', () => {
            document.getElementById('rules-modal').style.display = 'none';
        });
        document.getElementById('close-rules-btn').addEventListener('click', () => {
            document.getElementById('rules-modal').style.display = 'none';
        });
        document.getElementById('close-rules-bottom').addEventListener('click', () => {
            document.getElementById('rules-modal').style.display = 'none';
        });

        // Direction buttons
        document.getElementById('move-up').addEventListener('click', () => this.makeMove('up'));
        document.getElementById('move-down').addEventListener('click', () => this.makeMove('down'));
        document.getElementById('move-left').addEventListener('click', () => this.makeMove('left'));
        document.getElementById('move-right').addEventListener('click', () => this.makeMove('right'));

        // Settings event listeners
        document.getElementById('ai-select').addEventListener('change', (e) => {
            this.ai.setOpponent(e.target.value);
            this.showMessage(`AI opponent set to: ${e.target.value}`, 'info');
        });

        // Keyboard controls toggle
        document.getElementById('keyboard-toggle').addEventListener('change', (e) => {
            this.toggleKeyboardControls(e.target.checked);
        });

        // Click-to-move toggle
        document.getElementById('click-move-toggle').addEventListener('change', (e) => {
            this.toggleClickMoveControls(e.target.checked);
        });

        // Sound controls
        document.getElementById('sound-toggle').addEventListener('change', (e) => {
            this.audioManager.setEnabled(e.target.checked);
            this.showMessage(`Sound effects ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
        });

        document.getElementById('volume-slider').addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100; // Convert to 0-1 range
            this.audioManager.setVolume(volume);
            document.getElementById('volume-display').textContent = `${e.target.value}%`;
        });

        // Development mode toggle
        document.getElementById('dev-toggle').addEventListener('click', () => {
            this.devModeEnabled = !this.devModeEnabled;
            const devStats = document.getElementById('dev-stats');
            
            if (this.devModeEnabled) {
                devStats.style.display = 'block';
                this.updateDevStats();
                this.showMessage('Development mode enabled', 'info');
            } else {
                devStats.style.display = 'none';
                this.showMessage('Development mode disabled', 'info');
            }
        });

        // Keyboard controls for movement (single event listener)
        document.addEventListener('keydown', (e) => {
            if (!this.keyboardEnabled || this.gameOver || !this.gameStarted || this.getCurrentPlayer().name !== "Human") return;
            
            // Don't process keys if user is typing in an input/select element
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
            
            let direction = null;
            
            switch(e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    direction = 'up';
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    direction = 'down';
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    direction = 'left';
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    direction = 'right';
                    break;
            }
            
            if (direction) {
                e.preventDefault();
                this.makeMove(direction);
                
                // Visual feedback - briefly highlight the corresponding button
                const buttonId = `move-${direction}`;
                const button = document.getElementById(buttonId);
                if (button) {
                    button.style.transform = 'scale(0.95)';
                    button.style.background = '#CD853F';
                    setTimeout(() => {
                        button.style.transform = '';
                        button.style.background = '';
                    }, 150);
                }
            }
        });
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    switchPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        
        // Automatically enable fence placement mode for human player
        if (this.getCurrentPlayer().name === "Human" && this.getCurrentPlayer().fencesRemaining > 0) {
            this.fencePlacementMode = 'active';
        } else {
        this.fencePlacementMode = null;
        }
        
        // Clear any existing fence previews when switching players
        this.hideFencePreview();
        
        this.updateUI();
        
        // Show valid moves for human player when it becomes their turn
        this.showValidMovesForHuman();
        
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

    isValidFencePlacement(fence) {
        // Check bounds - fences must span exactly 2 movement squares
        if (fence.orientation === 'horizontal') {
            // Horizontal fence: check if it can span 2 columns
            if (fence.row < 0 || fence.row >= this.size - 1) {
                console.log(`Horizontal fence bounds error: row=${fence.row}, valid range: 0-${this.size-2}`);
                return false;
            }
            if (fence.col < 0 || fence.col >= this.size - 1) {
                console.log(`Horizontal fence bounds error: col=${fence.col}, valid range: 0-${this.size-2}`);
                return false;
            }
        } else {
            // Vertical fence: check if it can span 2 rows  
            if (fence.row < 0 || fence.row >= this.size - 1) {
                console.log(`Vertical fence bounds error: row=${fence.row}, valid range: 0-${this.size-2}`);
                return false;
            }
            if (fence.col < 0 || fence.col >= this.size - 1) {
                console.log(`Vertical fence bounds error: col=${fence.col}, valid range: 0-${this.size-2}`);
                return false;
            }
        }

        // Check if fence already exists
        if (this.fences.some(f => f.equals(fence))) {
            console.log(`Fence already exists at row=${fence.row}, col=${fence.col}, orientation=${fence.orientation}`);
            return false;
        }

        // Check for fence post overlaps
        if (this.wouldFencePostOverlap(fence)) {
            console.log(`Fence post would overlap with existing fence post`);
            return false;
        }

        // Check intersections
        for (const existingFence of this.fences) {
            if (this.fencesIntersect(fence, existingFence)) {
                console.log(`Fence intersection detected with existing fence at row=${existingFence.row}, col=${existingFence.col}, orientation=${existingFence.orientation}`);
                return false;
            }
        }

        // Check if fence would block any player's path
        const tempFences = [...this.fences, fence];
        for (const player of this.players) {
            if (!this.hasPathToGoal(player, tempFences)) {
                console.log(`Fence would block ${player.name}'s path to goal`);
                return false;
            }
        }

        return true;
    }

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
            const hFence = fence1.orientation === 'horizontal' ? fence1 : fence2;
            const vFence = fence1.orientation === 'vertical' ? fence1 : fence2;
            
            // A horizontal fence at (row, col) spans columns col to col+1 at row
            // A vertical fence at (row, col) spans rows row to row+1 at col
            
            // They intersect (cross illegally) if and only if:
            // 1. The vertical fence's column is strictly within the horizontal fence's column span
            // 2. AND the horizontal fence's row is strictly within the vertical fence's row span
            
            // For integer coordinates:
            // hFence spans columns [hFence.col, hFence.col+1] at row hFence.row
            // vFence spans rows [vFence.row, vFence.row+1] at column vFence.col
            
            // They cross if vFence.col is between hFence.col and hFence.col+1 (exclusive)
            // AND hFence.row is between vFence.row and vFence.row+1 (exclusive)
            
            // Since all coordinates are integers, "strictly between" means never true
            // So perpendicular fences with integer coordinates can never truly cross
            // They can only meet at endpoints (which should be allowed)
            
            return false; // Allow all perpendicular fence combinations
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
        if (this.gameOver || !this.gameStarted || this.getCurrentPlayer().name !== "Human") return;

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
        
        // Find the best valid move that matches this direction preference
        let targetMove = null;
        
        // Check for single step move first
        const singleStepPos = new Position(
            player.position.row + dir.row,
            player.position.col + dir.col
        );
        
        targetMove = validMoves.find(pos => pos.equals(singleStepPos));
        
        // If no single step move, check for straight jump move
        if (!targetMove) {
            const jumpPos = new Position(
                player.position.row + dir.row * 2,
                player.position.col + dir.col * 2
            );
            targetMove = validMoves.find(pos => pos.equals(jumpPos));
        }
        
        // If no straight moves, check for diagonal jumps in the requested direction
        if (!targetMove) {
            // Look for diagonal moves that are in the general direction requested
            for (const move of validMoves) {
                const deltaRow = move.row - player.position.row;
                const deltaCol = move.col - player.position.col;
                
                // Check if this move has a component in the requested direction
                if ((dir.row !== 0 && Math.sign(deltaRow) === Math.sign(dir.row)) ||
                    (dir.col !== 0 && Math.sign(deltaCol) === Math.sign(dir.col))) {
                    // This move is in the requested direction (or diagonal from it)
                    targetMove = move;
                    break;
                }
            }
        }

        if (targetMove) {
            // Play movement sound
            this.audioManager.play('click');
            
            player.position = targetMove;
            this.showMessage(`Human moved to ${targetMove.toChessNotation()}`, 'success');
            this.updateBoardDisplay();
            
            if (this.checkWinCondition()) return;
            this.moveNumber++;
            this.updateDevStats();
            this.switchPlayer();
        } else {
            this.showMessage('Invalid move!', 'error');
        }
    }

    toggleFenceMode() {
        // This method is no longer needed since fence mode is always active for human player
        // Keeping it empty in case it's referenced elsewhere
            return;
    }

    handleCellClick(row, col) {
        // Only allow click-to-move if enabled and it's human's turn
        if (!this.clickMoveEnabled || this.gameOver || !this.gameStarted || this.getCurrentPlayer().name !== "Human") {
            return;
        }

        const player = this.getCurrentPlayer();
        const targetPos = new Position(row, col);
        
        // Check if this is a valid move
        if (this.isValidMove(player, targetPos)) {
            // Play movement sound
            this.audioManager.play('click');
            
            player.position = targetPos;
            this.showMessage(`Human moved to ${targetPos.toChessNotation()}`, 'success');
            this.updateBoardDisplay();
            
            if (this.checkWinCondition()) return;
            this.moveNumber++;
            this.updateDevStats();
            this.switchPlayer();
        } else {
            // Provide helpful feedback for invalid clicks
            const validMoves = this.getValidMoves(player);
            if (validMoves.length === 0) {
                this.showMessage('No valid moves available!', 'error');
            } else {
                this.showMessage('Invalid move! Click on a highlighted green square.', 'error');
            }
        }
    }

    handleFenceClick(fenceSlot) {
        if (!this.fencePlacementMode || this.gameOver || !this.gameStarted || this.getCurrentPlayer().name !== "Human") return;

        const fenceType = fenceSlot.dataset.fenceType;
        const row = parseInt(fenceSlot.dataset.row);
        const col = parseInt(fenceSlot.dataset.col);

        // Auto-detect fence orientation based on the slot type
        const orientation = fenceType;

        const fence = new Fence(row, col, orientation);
        
        if (this.isValidFencePlacement(fence)) {
            // Play fence placement sound
            this.audioManager.play('clack');
            
            this.fences.push(fence);
            this.getCurrentPlayer().fencesRemaining--;
            
            this.showMessage(`${orientation.charAt(0).toUpperCase() + orientation.slice(1)} fence placed`, 'success');
            this.updateBoardDisplay();
            
            if (this.checkWinCondition()) return;
            this.moveNumber++;
            this.updateDevStats();
            this.switchPlayer();
        } else {
            this.showMessage('Invalid fence placement!', 'error');
        }
    }

    makeComputerMove() {
        if (this.gameOver || this.getCurrentPlayer().name !== "Computer") return;

        const player = this.getCurrentPlayer();
        
        // Track AI move timing for dev mode
        const startTime = performance.now();
        
        // Use the AI module to make a move
        const aiDecision = this.ai.makeMove(this, player);
        
        // Calculate move time and add to tracking array
        this.lastAiMoveTime = Math.round(performance.now() - startTime);
        this.aiMoveTimes.push(this.lastAiMoveTime);
        
        if (aiDecision) {
            if (aiDecision.type === 'fence') {
                // Play fence placement sound for AI
                this.audioManager.play('clack');
                
                // AI decided to place a fence
                this.fences.push(aiDecision.fence);
                player.fencesRemaining--;
                this.showMessage(aiDecision.message, 'info');
                this.updateBoardDisplay();
                
                if (this.checkWinCondition()) return;
                this.moveNumber++;
                this.updateDevStats();
                this.switchPlayer();
            } else if (aiDecision.type === 'move') {
                // Play movement sound for AI
                this.audioManager.play('click');
                
                // AI decided to move
                player.position = aiDecision.position;
                this.showMessage(aiDecision.message, 'info');
                this.updateBoardDisplay();
                
                if (this.checkWinCondition()) return;
                this.moveNumber++;
                this.updateDevStats();
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
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * 17 + middlePostCol];
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
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * 17 + middlePostCol];
                if (middlePostElement) {
                    middlePostElement.classList.add('fence-post');
                }
            }
        });
    }

    updateUI() {
        // Update fence counts
        document.getElementById('player1-fences').textContent = this.players[0].fencesRemaining;
        document.getElementById('player2-fences').textContent = this.players[1].fencesRemaining;
        
        // Enable/disable controls based on current player and game state
        const currentPlayer = this.getCurrentPlayer();
        const isHumanTurn = currentPlayer.name === "Human" && !this.gameOver && this.gameStarted;
        document.querySelectorAll('.direction-btn').forEach(btn => {
            btn.disabled = !isHumanTurn;
        });
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
        // Play appropriate sound based on who won
        if (this.winner.name === "Human") {
            this.audioManager.play('win1');
        } else {
            this.audioManager.play('lose');
        }
        
        const celebration = document.createElement('div');
        celebration.className = 'winner-celebration';
        
        const message = document.createElement('div');
        message.className = 'winner-message';
        message.innerHTML = `
            <h2>🎉 ${this.winner.name} Wins! 🎉</h2>
            <p>${this.winner.name} reached ${this.winner.goalRow === 0 ? 'the top' : 'the bottom'} row!</p>
            <button class="action-btn" id="play-again-btn">Play Again</button>
        `;
        
        celebration.appendChild(message);
        document.body.appendChild(celebration);
        
        // Add event listener to the play again button
        const playAgainBtn = document.getElementById('play-again-btn');
        playAgainBtn.addEventListener('click', () => {
            this.newGame();
            celebration.remove();
        });
        
        this.showMessage(`🎉 ${this.winner.name} wins the game! 🎉`, 'success');
    }

    showMessage(text, type = 'info') {
        const messageDisplay = document.getElementById('message');
        messageDisplay.textContent = text;
        messageDisplay.className = 'message-display'; // Always use the same styling
        
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
        this.gameStarted = true; // Set to true since this is called after initial start
        this.winner = null;
        
        // Reset dev mode tracking
        this.moveNumber = 1;
        this.lastAiMoveTime = 0;
        this.aiMoveTimes = []; // Reset AI move times tracking
        
        // Automatically enable fence placement mode for human player at start
        this.fencePlacementMode = 'active';
        
        // Reset players
        this.players[0].position = new Position(8, 4);
        this.players[0].fencesRemaining = 10;
        this.players[1].position = new Position(0, 4);
        this.players[1].fencesRemaining = 10;
        
        // Ensure proper button visibility (game controls should be visible)
        document.getElementById('start-game').style.display = 'none';
        document.getElementById('game-controls').style.display = 'flex';
        
        // Update display
        this.updateBoardDisplay();
        this.updateUI();
        
        // Show valid moves for human player immediately after new game
        this.showValidMovesForHuman();
        
        // Update dev stats if in dev mode
        this.updateDevStats();
        
        this.showMessage('New game started! Make your move.', 'info');
    }

    clearValidMoves() {
        document.querySelectorAll('.valid-move').forEach(cell => {
            cell.classList.remove('valid-move');
            cell.style.cursor = 'default';
            cell.removeAttribute('title');
        });
    }

    showValidMovesForHuman() {
        // Clear any existing valid move indicators first
        this.clearValidMoves();
        
        // Only show valid moves if game has started and it's human's turn
        const humanPlayer = this.players[0]; // Human is always player 1
        if (this.gameStarted && !this.gameOver && this.getCurrentPlayer().name === "Human") {
            const validMoves = this.getValidMoves(humanPlayer);
            validMoves.forEach(move => {
                const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
                if (cell && !cell.classList.contains('player1') && !cell.classList.contains('player2')) {
                    cell.classList.add('valid-move');
                    
                    // Add visual feedback for click-to-move when enabled
                    if (this.clickMoveEnabled) {
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

    showFencePreview(fenceSlot) {
        // Only show preview during human's turn and when game is started and not over
        if (this.getCurrentPlayer().name !== "Human" || this.gameOver || !this.gameStarted) {
            return;
        }
        
        const fenceType = fenceSlot.dataset.fenceType;
        const row = parseInt(fenceSlot.dataset.row);
        const col = parseInt(fenceSlot.dataset.col);
        const orientation = fenceType;

        const fence = new Fence(row, col, orientation);
        
        // Check if this would be a valid fence placement
        const isValid = this.isValidFencePlacement(fence) && 
                       this.getCurrentPlayer().fencesRemaining > 0;
        
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
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * 17 + middlePostCol];
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
                const middlePostElement = document.querySelector(`.board`).children[middlePostRow * 17 + middlePostCol];
                if (middlePostElement) {
                    middlePostElement.classList.add('fence-post-preview');
                }
            }
        } else {
            // Show only the hovered slot in red for invalid placements
            fenceSlot.classList.add('fence-preview-invalid');
        }
    }

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

    showStartButton() {
        // Show start button and hide game controls initially
        document.getElementById('start-game').style.display = 'block';
        document.getElementById('game-controls').style.display = 'none';
        
        // Disable movement controls until game starts
        document.querySelectorAll('.direction-btn').forEach(btn => {
            btn.disabled = true;
        });
    }

    startGame() {
        // Play game start sound
        this.audioManager.play('start');
        
        this.gameStarted = true;
        
        // Hide start button and show game controls
        document.getElementById('start-game').style.display = 'none';
        document.getElementById('game-controls').style.display = 'flex';
        
        // Enable controls and show valid moves
        this.updateUI();
        
        // Show valid moves for human player immediately when game starts
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
            this.showValidMovesForHuman();
            this.updateDevStats(); // Update dev stats after game starts
        }, 0);
        
        this.showMessage('Game started! Make your move.', 'info');
    }

    showRules() {
        document.getElementById('rules-modal').style.display = 'flex';
    }

    hideRules() {
        document.getElementById('rules-modal').style.display = 'none';
    }

    toggleDevMode() {
        this.devModeEnabled = !this.devModeEnabled;
        const devStats = document.getElementById('dev-stats');
        const devBtn = document.getElementById('dev-mode-btn');
        
        if (this.devModeEnabled) {
            devStats.style.display = 'block';
            devBtn.style.background = '#4CAF50';
            devBtn.textContent = 'Dev Mode ON';
            this.showMessage('Development mode enabled', 'info');
        } else {
            devStats.style.display = 'none';
            devBtn.style.background = '#666';
            devBtn.textContent = 'Development Mode';
            this.showMessage('Development mode disabled', 'info');
        }
        
        // Update stats if game is active
        if (this.gameStarted) {
            this.updateDevStats();
        }
    }

    updateDevStats() {
        if (!this.devModeEnabled) return;
        
        // Calculate shortest paths using AI's dijkstra method
        const humanPath = this.ai.dijkstraDistance(this, this.players[0].position, this.players[0].goalRow);
        const aiPath = this.ai.dijkstraDistance(this, this.players[1].position, this.players[1].goalRow);
        const advantage = humanPath - aiPath;
        
        // Calculate average AI move time
        const avgAiTime = this.aiMoveTimes.length > 0 
            ? Math.round(this.aiMoveTimes.reduce((sum, time) => sum + time, 0) / this.aiMoveTimes.length)
            : 0;
        
        // Get current bot name
        const botName = this.ai.botType === 'bot1' ? 'Bot 1' : 'Bot 2';
        
        // Update stats display
        document.getElementById('stat-bot-name').textContent = botName;
        document.getElementById('stat-move-number').textContent = this.moveNumber;
        document.getElementById('stat-ai-time').textContent = avgAiTime + 'ms';
        document.getElementById('stat-human-path').textContent = humanPath === Infinity ? '∞' : humanPath;
        document.getElementById('stat-ai-path').textContent = aiPath === Infinity ? '∞' : aiPath;
        document.getElementById('stat-advantage').textContent = advantage === Infinity ? '∞' : (advantage > 0 ? '+' + advantage : advantage);
    }

    // Switch AI bot and restart game if in progress
    switchBot(botType) {
        this.ai = new QuoridorAI(botType);
        
        // Show message about bot change
        const botName = botType === 'bot1' ? 'Bot 1 - Basic Strategic' : 'Bot 2 - Advantage Focused';
        this.showMessage(`Switched to ${botName}`, 'info');
        
        // Update dev stats immediately to show new bot name
        this.updateDevStats();
        
        // If game is in progress, restart it
        if (this.gameStarted) {
            setTimeout(() => {
                this.newGame();
            }, 1000);
        }
    }

    toggleKeyboardControls(enabled) {
        this.keyboardEnabled = enabled;
        const status = enabled ? 'enabled' : 'disabled';
        this.showMessage(`Keyboard controls ${status}`, 'info');
    }

    toggleClickMoveControls(enabled) {
        this.clickMoveEnabled = enabled;
        const status = enabled ? 'enabled' : 'disabled';
        this.showMessage(`Click-to-move ${status}`, 'info');
        
        // Update visual feedback for valid moves when setting changes
        if (this.gameStarted && this.getCurrentPlayer().name === "Human") {
            this.showValidMovesForHuman();
        }
    }
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new QuoridorGame();
}); 