// Quoridor Game - JavaScript Implementation
// Note: Position, Fence, Player, and AudioManager classes are now in separate files
// This is now a Controller that coordinates GameEngine, UI, and AI

class QuoridorGame {
    constructor() {
        // Initialize game engine (pure game logic)
        this.engine = new GameEngine();
        
        // UI and system components
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
        
        // Winner tracking
        this.winner = null;
        
        // Initialize theme
        this.themeManager = new ThemeManager('modern');
        this.themeManager.initializeTheme();
        
        // Initialize UI renderers (pass this controller, not engine)
        this.boardRenderer = new BoardRenderer(this);
        this.uiManager = new UIManager(this);
        this.modalManager = new ModalManager();
        
        this.initializeBoard();
        this.setupEventListeners();
        this.uiManager.updateUI();
        
        // Show start button and don't show valid moves until game is started
        this.uiManager.showStartButton();
        
        // Load modal contents
        this.loadModals();
    }
    
    // Load both modals content from external HTML files
    async loadModals() {
        await this.modalManager.loadModalContent('rules-modal', 'html/rules-modal.html');
        await this.modalManager.loadModalContent('settings-modal', 'html/settings-modal.html');
        
        // Attach event listeners after content is loaded
        this.attachModalListeners();
    }
    
    // Attach event listeners for both modals
    attachModalListeners() {
        // Rules modal listeners
        const closeRules = document.getElementById('close-rules');
        const closeRulesBtn = document.getElementById('close-rules-btn');
        
        if (closeRules) {
            closeRules.removeEventListener('click', this._closeRulesHandler);
            this._closeRulesHandler = () => this.modalManager.closeModal('rules-modal');
            closeRules.addEventListener('click', this._closeRulesHandler);
        }
        
        if (closeRulesBtn) {
            closeRulesBtn.removeEventListener('click', this._closeRulesBtnHandler);
            this._closeRulesBtnHandler = () => this.modalManager.closeModal('rules-modal');
            closeRulesBtn.addEventListener('click', this._closeRulesBtnHandler);
        }
        
        // Settings modal listeners
        const closeSettings = document.getElementById('close-settings');
        
        if (closeSettings) {
            closeSettings.removeEventListener('click', this._closeSettingsHandler);
            this._closeSettingsHandler = () => this.modalManager.closeModal('settings-modal');
            closeSettings.addEventListener('click', this._closeSettingsHandler);
        }
        
        // Attach settings event listeners (only if settings modal is loaded)
        this.attachSettingsListeners();
    }
    
    // Attach settings event listeners (called after settings modal loads)
    attachSettingsListeners() {
        // Remove existing listeners to avoid duplicates
        const aiSelect = document.getElementById('ai-select');
        const themeSelect = document.getElementById('theme-select');
        const keyboardToggle = document.getElementById('keyboard-toggle');
        const clickMoveToggle = document.getElementById('click-move-toggle');
        const aiDelayToggle = document.getElementById('ai-delay-toggle');
        const soundToggle = document.getElementById('sound-toggle');
        const volumeSlider = document.getElementById('volume-slider');
        const scoreboardToggle = document.getElementById('scoreboard-toggle');
        const resetScoreboard = document.getElementById('reset-scoreboard');
        const devToggle = document.getElementById('dev-toggle');
        const debugOverlayToggle = document.getElementById('debug-overlay-toggle');
        
        // AI selector
        if (aiSelect && !aiSelect.hasAttribute('data-listener-attached')) {
            aiSelect.addEventListener('change', (e) => {
                this.ai.setOpponent(e.target.value);
            });
            aiSelect.setAttribute('data-listener-attached', 'true');
        }
        
        // Theme selector
        if (themeSelect && !themeSelect.hasAttribute('data-listener-attached')) {
            themeSelect.addEventListener('change', (e) => {
                this.themeManager.applyTheme(e.target.value);
            });
            themeSelect.setAttribute('data-listener-attached', 'true');
        }
        
        // Keyboard controls toggle
        if (keyboardToggle && !keyboardToggle.hasAttribute('data-listener-attached')) {
            keyboardToggle.addEventListener('change', (e) => {
                this.toggleKeyboardControls(e.target.checked);
            });
            keyboardToggle.setAttribute('data-listener-attached', 'true');
        }
        
        // Click-to-move toggle
        if (clickMoveToggle && !clickMoveToggle.hasAttribute('data-listener-attached')) {
            clickMoveToggle.addEventListener('change', (e) => {
                this.toggleClickMoveControls(e.target.checked);
            });
            clickMoveToggle.setAttribute('data-listener-attached', 'true');
        }
        
        // AI move delay toggle
        if (aiDelayToggle && !aiDelayToggle.hasAttribute('data-listener-attached')) {
            aiDelayToggle.addEventListener('change', (e) => {
                this.toggleAiMoveDelay(e.target.checked);
            });
            aiDelayToggle.setAttribute('data-listener-attached', 'true');
        }
        
        // Sound controls
        if (soundToggle && !soundToggle.hasAttribute('data-listener-attached')) {
            soundToggle.addEventListener('change', (e) => {
                this.audioManager.setEnabled(e.target.checked);
                this.uiManager.showMessage(`Sound effects ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
            });
            soundToggle.setAttribute('data-listener-attached', 'true');
        }
        
        if (volumeSlider && !volumeSlider.hasAttribute('data-listener-attached')) {
            volumeSlider.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value) / 100;
                this.audioManager.setVolume(volume);
                document.getElementById('volume-display').textContent = `${e.target.value}%`;
            });
            volumeSlider.setAttribute('data-listener-attached', 'true');
        }
        
        // Scoreboard toggle
        if (scoreboardToggle && !scoreboardToggle.hasAttribute('data-listener-attached')) {
            scoreboardToggle.addEventListener('change', (e) => {
                this.toggleScoreboard(e.target.checked);
            });
            scoreboardToggle.setAttribute('data-listener-attached', 'true');
        }
        
        // Reset scoreboard button
        if (resetScoreboard && !resetScoreboard.hasAttribute('data-listener-attached')) {
            resetScoreboard.addEventListener('click', () => {
                this.resetScoreboard();
            });
            resetScoreboard.setAttribute('data-listener-attached', 'true');
        }
        
        // Development mode toggle
        if (devToggle && !devToggle.hasAttribute('data-listener-attached')) {
            devToggle.addEventListener('click', () => {
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
            devToggle.setAttribute('data-listener-attached', 'true');
        }
        
        // Debug overlay toggle
        if (debugOverlayToggle && !debugOverlayToggle.hasAttribute('data-listener-attached')) {
            debugOverlayToggle.addEventListener('click', () => {
                this.toggleDebugOverlay(!this.debugOverlayEnabled);
            });
            debugOverlayToggle.setAttribute('data-listener-attached', 'true');
        }
    }
    
    // Getters to delegate to engine for backward compatibility
    get size() { return this.engine.size; }
    get players() { return this.engine.players; }
    get fences() { return this.engine.fences; }
    get currentPlayerIndex() { return this.engine.currentPlayerIndex; }
    get gameOver() { return this.engine.gameOver; }
    get gameStarted() { return this.engine.gameStarted; }
    
    // Setters for game state (delegate to engine)
    set gameStarted(value) { this.engine.gameStarted = value; }
    set gameOver(value) { this.engine.gameOver = value; }

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
        // Rules modal button
        document.getElementById('show-rules').addEventListener('click', async () => {
            // Ensure rules modal is loaded before showing
            await this.modalManager.loadModalContent('rules-modal', 'html/rules-modal.html');
            this.attachModalListeners(); // Re-attach listeners in case content was just loaded
            this.modalManager.openModal('rules-modal');
        });
        
        // Settings modal button
        document.getElementById('show-settings').addEventListener('click', async () => {
            // Ensure settings modal is loaded before showing
            await this.modalManager.loadModalContent('settings-modal', 'html/settings-modal.html');
            this.attachModalListeners(); // Re-attach listeners in case content was just loaded
            this.attachSettingsListeners(); // Attach settings-specific listeners
            this.modalManager.openModal('settings-modal');
        });

        // Direction buttons
        document.getElementById('move-up').addEventListener('click', () => this.makeMove('up'));
        document.getElementById('move-down').addEventListener('click', () => this.makeMove('down'));
        document.getElementById('move-left').addEventListener('click', () => this.makeMove('left'));
        document.getElementById('move-right').addEventListener('click', () => this.makeMove('right'));

        // Settings event listeners are now attached in attachSettingsListeners()
        // after the settings modal content is loaded

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
        return this.engine.getCurrentPlayer();
    }

    switchPlayer() {
        this.engine.switchPlayer();
        
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
    
    // Delegate game logic methods to engine
    isValidPosition(pos) {
        return this.engine.isValidPosition(pos);
    }
    
    isPositionOccupied(pos) {
        return this.engine.isPositionOccupied(pos);
    }
    
    isMovementBlocked(fromPos, toPos) {
        return this.engine.isMovementBlocked(fromPos, toPos);
    }
    
    getValidMoves(player) {
        return this.engine.getValidMoves(player);
    }
    
    isValidFencePlacement(fence) {
        return this.engine.isValidFencePlacement(fence);
    }
    
    fencesIntersect(fence1, fence2) {
        return this.engine.fencesIntersect(fence1, fence2);
    }
    
    hasPathToGoal(player, fences) {
        return this.engine.hasPathToGoal(player, fences);
    }
    
    isMovementBlockedByFences(fromPos, toPos, fences) {
        return this.engine.isMovementBlockedByFences(fromPos, toPos, fences);
    }
    
    isValidMove(player, targetPos) {
        return this.engine.isValidMove(player, targetPos);
    }
    
    wouldFencePostOverlap(fence) {
        return this.engine.wouldFencePostOverlap(fence);
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
            // Try to make the move using engine
            if (this.engine.tryMove(player, targetMove)) {
                // Play movement sound
                this.audioManager.play('click');
                
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
        
        // Try to make the move using engine
        if (this.engine.tryMove(player, targetPos)) {
            // Play movement sound
            this.audioManager.play('click');
            
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
        
        // Try to place fence using engine
        if (this.engine.tryPlaceFence(fence)) {
            // Play fence placement sound
            this.audioManager.play('clack');
            
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
                // Try to place fence using engine
                if (this.engine.tryPlaceFence(aiDecision.fence)) {
                    // Play fence placement sound for AI
                    this.audioManager.play('clack');
                    
                    player.fencesRemaining--;
                    this.uiManager.showMessage(aiDecision.message, 'info');
                    this.boardRenderer.updateBoardDisplay();
                    this.uiManager.updateUI();
                    
                    if (this.checkWinCondition()) return;
                    this.moveNumber++;
                    this.uiManager.updateDevStats();
                    this.switchPlayer();
                }
            } else if (aiDecision.type === 'move') {
                // Try to make move using engine
                if (this.engine.tryMove(player, aiDecision.position)) {
                    // Play movement sound for AI
                    this.audioManager.play('click');
                    
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
    }

    checkWinCondition() {
        const winner = this.engine.checkWinCondition();
        if (winner) {
            this.winner = winner;
            this.uiManager.showWinner(() => this.newGame());
            return true;
        }
        return false;
    }

    newGame() {
        // Remove any existing winner celebration
        const celebration = document.querySelector('.winner-celebration');
        if (celebration) {
            celebration.remove();
        }
        
        // Reset game engine state
        this.engine.reset();
        this.winner = null;
        
        // Reset dev mode tracking
        this.moveNumber = 1;
        this.lastAiMoveTime = 0;
        this.aiMoveTimes = []; // Reset AI move times tracking
        
        // Reset AI state for new game
        this.ai.resetGameState();
        
        // Automatically enable fence placement mode for human player at start
        this.fencePlacementMode = 'active';
        
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


    startGame() {
        // Play game start sound
        this.audioManager.play('start');
        
        this.engine.start();
        
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
        this.modalManager.openModal('rules-modal');
    }

    hideRules() {
        this.modalManager.closeModal('rules-modal');
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