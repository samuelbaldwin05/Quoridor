// UI Manager - Handles messages, scoreboard, dev stats, and other UI updates
class UIManager {
    constructor(game) {
        this.game = game; // Reference to game instance for accessing state
    }
    
    // Update UI elements (fence counts, button states)
    updateUI() {
        // Update fence counts
        document.getElementById('player1-fences').textContent = this.game.players[0].fencesRemaining;
        document.getElementById('player2-fences').textContent = this.game.players[1].fencesRemaining;
        
        // Enable/disable controls based on current player and game state
        const currentPlayer = this.game.getCurrentPlayer();
        const isHumanTurn = currentPlayer.name === "Human" && !this.game.gameOver && this.game.gameStarted;
        document.querySelectorAll('.direction-btn').forEach(btn => {
            btn.disabled = !isHumanTurn;
        });
    }
    
    // Show a message to the user
    showMessage(text, type = 'info') {
        const messageDisplay = document.getElementById('message');
        messageDisplay.textContent = text;
        messageDisplay.className = 'message-display'; // Always use the same styling
        
        // Clear message after timeout
        setTimeout(() => {
            if (messageDisplay.textContent === text) {
                messageDisplay.textContent = 'Make your move!';
                messageDisplay.className = 'message-display';
            }
        }, GAME_CONFIG.MESSAGE_TIMEOUT_MS);
    }
    
    // Show winner celebration
    showWinner(onNewGame) {
        // Track the win
        if (this.game.winner.name === "Human") {
            this.game.playerWins++;
            this.game.audioManager.play('win1');
        } else {
            this.game.computerWins++;
            this.game.audioManager.play('lose');
        }
        
        // Update scoreboard display if enabled
        if (this.game.scoreboardEnabled) {
            this.updateScoreboardDisplay();
        }
        
        const celebration = document.createElement('div');
        celebration.className = 'winner-celebration flex-center';
        
        const message = document.createElement('div');
        message.className = 'winner-message';
        message.innerHTML = `
            <h2>🎉 ${this.game.winner.name} Wins! 🎉</h2>
            <p>${this.game.winner.name} reached ${this.game.winner.goalRow === 0 ? 'the top' : 'the bottom'} row!</p>
            <button class="btn action-btn" id="play-again-btn">Play Again</button>
        `;
        
        celebration.appendChild(message);
        document.body.appendChild(celebration);
        
        // Add event listener to the play again button
        const playAgainBtn = document.getElementById('play-again-btn');
        playAgainBtn.addEventListener('click', () => {
            this.game.audioManager.play('start');
            onNewGame();
            celebration.remove();
        });
        
        this.showMessage(`🎉 ${this.game.winner.name} wins the game! 🎉`, 'success');
    }
    
    // Update scoreboard display
    updateScoreboardDisplay() {
        document.getElementById('player-wins').textContent = this.game.playerWins;
        document.getElementById('computer-wins').textContent = this.game.computerWins;
    }
    
    // Update development stats display
    updateDevStats() {
        if (!this.game.devModeEnabled) return;
        
        // Calculate shortest paths using AI's dijkstra method
        const humanPath = this.game.ai.dijkstraDistance(this.game, this.game.players[0].position, this.game.players[0].goalRow);
        const aiPath = this.game.ai.dijkstraDistance(this.game, this.game.players[1].position, this.game.players[1].goalRow);
        const advantage = humanPath - aiPath;
        
        // Calculate average AI move time
        const avgAiTime = this.game.aiMoveTimes.length > 0 
            ? Math.round(this.game.aiMoveTimes.reduce((sum, time) => sum + time, 0) / this.game.aiMoveTimes.length)
            : 0;
        
        // Get current bot name for dev stats (short format)
        const botNameShort = this.game.ai.botType === 'bot0' ? 'Bot 0' : 
                            this.game.ai.botType === 'bot1' ? 'Bot 1' : 'Bot 2';
        
        // Update stats display
        document.getElementById('stat-bot-name').textContent = botNameShort;
        document.getElementById('stat-move-number').textContent = this.game.moveNumber;
        document.getElementById('stat-ai-time').textContent = avgAiTime + 'ms';
        document.getElementById('stat-human-path').textContent = humanPath === Infinity ? '∞' : humanPath.toFixed(2);
        document.getElementById('stat-ai-path').textContent = aiPath === Infinity ? '∞' : aiPath.toFixed(2);
        document.getElementById('stat-advantage').textContent = advantage === Infinity ? '∞' : (advantage > 0 ? '+' + advantage.toFixed(2) : advantage.toFixed(2));
        document.getElementById('stat-last-move-type').textContent = this.game.ai.lastMoveType || '-';
    }
    
    // Show start button and hide game controls
    showStartButton() {
        // Show start button and hide game controls initially
        document.getElementById('start-game').style.display = 'block';
        document.getElementById('game-controls').style.display = 'none';
        
        // Disable movement controls until game starts
        document.querySelectorAll('.direction-btn').forEach(btn => {
            btn.disabled = true;
        });
    }
    
    // Hide start button and show game controls
    showGameControls() {
        document.getElementById('start-game').style.display = 'none';
        document.getElementById('game-controls').style.display = 'flex';
    }
}

