// Quoridor Game - JavaScript Implementation
// Note: Position, Fence, Player, and AudioManager classes are now in separate files

class QuoridorGame {
    constructor() {
        this.size = GAME_CONFIG.BOARD_SIZE;
        this.players = [];
        this.currentPlayerIndex = 0;
        this.fences = [];
        this.gameOver = false;
        this.gameStarted = false; // Track if game has started
        this.fencePlacementMode = 'active'; // Set fence placement mode to 'active' for human players
        this.ai = new QuoridorAI('bot2'); // Initialize AI with default settings
        this.audioManager = new AudioManager(); // Initialize audio manager
        
        // Development mode tracking
        this.moveNumber = 1;
        this.lastAiMoveTime = 0;
        this.aiMoveTimes = []; // Track all AI move times for averaging
        this.devModeEnabled = false;
        this.keyboardEnabled = true; // Track keyboard controls setting
        this.clickMoveEnabled = true; // Track click-to-move setting
        this.aiMoveDelayEnabled = true; // Track AI move delay setting
        
        // Scoreboard tracking
        this.scoreboardEnabled = true; // Track scoreboard visibility setting
        this.playerWins = 0; // Track human player wins
        this.computerWins = 0; // Track computer wins
        
        // Debug overlay tracking
        this.debugOverlayEnabled = false; // Track debug overlay visibility setting
        
        // Initialize players
        this.players = [
            new Player(1, new Position(GAME_CONFIG.PLAYER1_START_ROW, GAME_CONFIG.PLAYER1_START_COL), GAME_CONFIG.PLAYER1_GOAL_ROW, "Human"),
            new Player(2, new Position(GAME_CONFIG.PLAYER2_START_ROW, GAME_CONFIG.PLAYER2_START_COL), GAME_CONFIG.PLAYER2_GOAL_ROW, "Computer")
        ];
        
        // Initialize theme
        this.themeManager = new ThemeManager('modern');
        this.themeManager.initializeTheme();
        
        // Initialize UI renderers
        this.boardRenderer = new BoardRenderer(this);
        this.uiManager = new UIManager(this);
        
        this.initializeBoard();
        this.setupEventListeners();
        this.uiManager.updateUI();
        
        // Show start button and don't show valid moves until game is started
        this.uiManager.showStartButton();
    }

    initializeBoard() {
        this.boardRenderer.initializeBoard(
            (row, col) => this.handleCellClick(row, col),
            (cell) => this.handleFenceClick(cell),
            (cell) => this.boardRenderer.showFencePreview(cell),
            () => this.boardRenderer.hideFencePreview()
        );
    }

    setupEventListeners() {
        // Game control buttons
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('new-game').addEventListener('click', () => {
            this.audioManager.play('start');
            this.newGame();
        });
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
        });

        // Theme selector
        document.getElementById('theme-select').addEventListener('change', (e) => {
            this.themeManager.applyTheme(e.target.value);
        });

        // Keyboard controls toggle
        document.getElementById('keyboard-toggle').addEventListener('change', (e) => {
            this.toggleKeyboardControls(e.target.checked);
        });

        // Click-to-move toggle
        document.getElementById('click-move-toggle').addEventListener('change', (e) => {
            this.toggleClickMoveControls(e.target.checked);
        });

        // AI move delay toggle
        document.getElementById('ai-delay-toggle').addEventListener('change', (e) => {
            this.toggleAiMoveDelay(e.target.checked);
        });

        // Sound controls
        document.getElementById('sound-toggle').addEventListener('change', (e) => {
            this.audioManager.setEnabled(e.target.checked);
            this.uiManager.showMessage(`Sound effects ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
        });

        document.getElementById('volume-slider').addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100; // Convert to 0-1 range
            this.audioManager.setVolume(volume);
            document.getElementById('volume-display').textContent = `${e.target.value}%`;
        });

        // Scoreboard toggle
        document.getElementById('scoreboard-toggle').addEventListener('change', (e) => {
            this.toggleScoreboard(e.target.checked);
        });

        // Reset scoreboard button
        document.getElementById('reset-scoreboard').addEventListener('click', () => {
            this.resetScoreboard();
        });

        // Development mode toggle
        document.getElementById('dev-toggle').addEventListener('click', () => {
            this.devModeEnabled = !this.devModeEnabled;
            const devStats = document.getElementById('dev-stats');
            
            if (this.devModeEnabled) {
                devStats.style.display = 'block';
                this.uiManager.updateDevStats();
                this.uiManager.showMessage('Development mode enabled', 'info');
            } else {
                devStats.style.display = 'none';
                this.uiManager.showMessage('Development mode disabled', 'info');
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

        // Debug overlay toggle
        document.getElementById('debug-overlay-toggle').addEventListener('click', () => {
            this.toggleDebugOverlay(!this.debugOverlayEnabled);
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
        this.boardRenderer.hideFencePreview();
        
        this.uiManager.updateUI();
        
        // Show valid moves for human player when it becomes their turn
        this.boardRenderer.showValidMovesForHuman();
        
        // If it's computer's turn, make computer move (with optional delay)
        if (this.getCurrentPlayer().name === "Computer" && !this.gameOver) {
            if (this.aiMoveDelayEnabled) {
                setTimeout(() => this.makeComputerMove(), GAME_CONFIG.AI_MOVE_DELAY_MS);
            } else {
                this.makeComputerMove();
            }
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
            this.uiManager.showMessage(`Human moved to ${targetMove.toChessNotation()}`, 'success');
            this.boardRenderer.updateBoardDisplay();
            this.uiManager.updateUI();
            
            if (this.checkWinCondition()) return;
            this.moveNumber++;
            this.uiManager.updateDevStats();
            this.switchPlayer();
        } else {
            this.uiManager.showMessage('Invalid move!', 'error');
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
            this.uiManager.showMessage(`Human moved to ${targetPos.toChessNotation()}`, 'success');
            this.boardRenderer.updateBoardDisplay();
            this.uiManager.updateUI();
            
            if (this.checkWinCondition()) return;
            this.moveNumber++;
            this.uiManager.updateDevStats();
            this.switchPlayer();
        } else {
            // Provide helpful feedback for invalid clicks
            const validMoves = this.getValidMoves(player);
            if (validMoves.length === 0) {
                this.uiManager.showMessage('No valid moves available!', 'error');
            } else {
                this.uiManager.showMessage('Invalid move! Click on a highlighted green square.', 'error');
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
            
            this.uiManager.showMessage(`${orientation.charAt(0).toUpperCase() + orientation.slice(1)} fence placed`, 'success');
            this.boardRenderer.updateBoardDisplay();
            this.uiManager.updateUI();
            
            if (this.checkWinCondition()) return;
            this.moveNumber++;
            this.uiManager.updateDevStats();
            this.switchPlayer();
        } else {
            this.uiManager.showMessage('Invalid fence placement!', 'error');
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
                this.uiManager.showMessage(aiDecision.message, 'info');
                this.boardRenderer.updateBoardDisplay();
                this.uiManager.updateUI();
                
                if (this.checkWinCondition()) return;
                this.moveNumber++;
                this.uiManager.updateDevStats();
                this.switchPlayer();
            } else if (aiDecision.type === 'move') {
                // Play movement sound for AI
                this.audioManager.play('click');
                
                // AI decided to move
                player.position = aiDecision.position;
                this.uiManager.showMessage(aiDecision.message, 'info');
                this.boardRenderer.updateBoardDisplay();
                this.uiManager.updateUI();
                
                if (this.checkWinCondition()) return;
                this.moveNumber++;
                this.uiManager.updateDevStats();
                this.switchPlayer();
            }
        }
    }

    checkWinCondition() {
        for (const player of this.players) {
            if (player.hasWon()) {
                this.gameOver = true;
                this.winner = player;
                this.uiManager.showWinner(() => this.newGame());
                return true;
            }
        }
        return false;
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
        
        // Reset AI state for new game
        this.ai.resetGameState();
        
        // Automatically enable fence placement mode for human player at start
        this.fencePlacementMode = 'active';
        
        // Reset players
        this.players[0].position = new Position(GAME_CONFIG.PLAYER1_START_ROW, GAME_CONFIG.PLAYER1_START_COL);
        this.players[0].fencesRemaining = GAME_CONFIG.INITIAL_FENCE_COUNT;
        this.players[1].position = new Position(GAME_CONFIG.PLAYER2_START_ROW, GAME_CONFIG.PLAYER2_START_COL);
        this.players[1].fencesRemaining = GAME_CONFIG.INITIAL_FENCE_COUNT;
        
        // Ensure proper button visibility (game controls should be visible)
        document.getElementById('start-game').style.display = 'none';
        document.getElementById('game-controls').style.display = 'flex';
        
        // Update display
        this.boardRenderer.updateBoardDisplay();
        this.uiManager.updateUI();
        
        // Show valid moves for human player immediately after new game
        this.boardRenderer.showValidMovesForHuman();
        
        // Update dev stats if in dev mode
        this.uiManager.updateDevStats();
        
        this.uiManager.showMessage('New game started! Make your move.', 'info');
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

    startGame() {
        // Play game start sound
        this.audioManager.play('start');
        
        this.gameStarted = true;
        
        // Hide start button and show game controls
        this.uiManager.showGameControls();
        
        // Enable controls and show valid moves
        this.uiManager.updateUI();
        
        // Show valid moves for human player immediately when game starts
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
            this.boardRenderer.showValidMovesForHuman();
            this.uiManager.updateDevStats(); // Update dev stats after game starts
        }, 0);
        
        this.uiManager.showMessage('Game started! Make your move.', 'info');
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
            this.uiManager.showMessage('Development mode enabled', 'info');
        } else {
            devStats.style.display = 'none';
            devBtn.style.background = '#666';
            devBtn.textContent = 'Development Mode';
            this.uiManager.showMessage('Development mode disabled', 'info');
        }
        
        // Update stats if game is active
        if (this.gameStarted) {
            this.uiManager.updateDevStats();
        }
    }


    // Switch AI bot and restart game if in progress
    switchBot(botType) {
        this.ai = new QuoridorAI(botType);
        
        // Show message about bot change
        const botName = botType === 'bot0' ? 'Bot 0 - Movement Only' :
                        botType === 'bot1' ? 'Bot 1 - Basic Strategic' : 'Bot 2 - Advantage Focused';
        this.uiManager.showMessage(`Switched to ${botName}`, 'info');
        
        // Update dev stats immediately to show new bot name
        this.uiManager.updateDevStats();
        
        // If game is in progress, restart it
        if (this.gameStarted) {
            setTimeout(() => {
                this.newGame();
            }, GAME_CONFIG.BOT_SWITCH_DELAY_MS);
        }
    }

    toggleKeyboardControls(enabled) {
        this.keyboardEnabled = enabled;
        const status = enabled ? 'enabled' : 'disabled';
        this.uiManager.showMessage(`Keyboard controls ${status}`, 'info');
    }

    toggleClickMoveControls(enabled) {
        this.clickMoveEnabled = enabled;
        const status = enabled ? 'enabled' : 'disabled';
        this.uiManager.showMessage(`Click-to-move ${status}`, 'info');
        
        // Update visual feedback for valid moves when setting changes
        if (this.gameStarted && this.getCurrentPlayer().name === "Human") {
            this.boardRenderer.showValidMovesForHuman();
        }
    }

    toggleAiMoveDelay(enabled) {
        this.aiMoveDelayEnabled = enabled;
        const status = enabled ? 'enabled' : 'disabled';
        this.uiManager.showMessage(`AI move delay ${status}`, 'info');
    }

    toggleScoreboard(enabled) {
        this.scoreboardEnabled = enabled;
        const scoreboard = document.getElementById('scoreboard');
        
        if (enabled) {
            scoreboard.style.display = 'flex';
            this.uiManager.updateScoreboardDisplay();
            this.uiManager.showMessage('Scoreboard enabled', 'info');
        } else {
            scoreboard.style.display = 'none';
            this.uiManager.showMessage('Scoreboard disabled', 'info');
        }
    }
    
    resetScoreboard() {
        this.playerWins = 0;
        this.computerWins = 0;
        this.uiManager.updateScoreboardDisplay();
        this.uiManager.showMessage('Scoreboard reset', 'info');
    }

    toggleDebugOverlay(enabled) {
        this.debugOverlayEnabled = enabled;
        
        if (enabled) {
            this.boardRenderer.showDebugOverlay();
            this.uiManager.showMessage('Debug overlay enabled', 'info');
        } else {
            this.boardRenderer.hideDebugOverlay();
            this.uiManager.showMessage('Debug overlay disabled', 'info');
        }
    }

    // Helper method to calculate opposing player penalty using AI's logic
    calculateOpposingPlayerPenaltyUsingAI(position) {
        const humanPlayer = this.players.find(p => p.name === "Human");
        const aiPlayer = this.players.find(p => p.name === "Computer");
        
        // Determine which player we're calculating for based on current turn
        const currentPlayer = this.getCurrentPlayer();
        
        // Use AI's method directly
        return this.ai.calculateOpposingPlayerPenalty(this, position, currentPlayer);
    }

}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new QuoridorGame();
}); 