/**
 * Test Suite for Quoridor Game
 * JavaScript version of the test file
 */

// Import the game classes (assuming they're available globally or via modules)
// For browser testing, include quoridor.js before this file

class QuoridorTests {
    constructor() {
        this.testsPassed = 0;
        this.testsFailed = 0;
        this.testResults = [];
    }

    assert(condition, message) {
        if (condition) {
            this.testsPassed++;
            this.testResults.push(`✓ ${message}`);
            console.log(`✓ ${message}`);
        } else {
            this.testsFailed++;
            this.testResults.push(`✗ ${message}`);
            console.error(`✗ ${message}`);
        }
    }

    assertEqual(actual, expected, message) {
        this.assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
    }

    assertArrayEqual(actual, expected, message) {
        const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
        this.assert(isEqual, `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
    }

    testGameInitialization() {
        console.log('\n=== Testing Game Initialization ===');
        
        const game = new QuoridorGame();
        
        this.assertEqual(game.size, 9, 'Board size should be 9x9');
        this.assertEqual(game.players.length, 2, 'Should have 2 players');
        this.assertEqual(game.currentPlayerIndex, 0, 'First player should start');
        this.assertEqual(game.fences.length, 0, 'Should start with no fences');
        this.assert(!game.gameOver, 'Game should not be over at start');
        
        // Check player positions
        this.assertEqual(game.players[0].position.row, 8, 'Player 1 should start at bottom');
        this.assertEqual(game.players[0].position.col, 4, 'Player 1 should start at center column');
        this.assertEqual(game.players[1].position.row, 0, 'Player 2 should start at top');
        this.assertEqual(game.players[1].position.col, 4, 'Player 2 should start at center column');
        
        // Check fence counts
        this.assertEqual(game.players[0].fencesRemaining, 10, 'Each player should start with 10 fences');
        this.assertEqual(game.players[1].fencesRemaining, 10, 'Each player should start with 10 fences');
    }

    testPlayerMovement() {
        console.log('\n=== Testing Player Movement ===');
        
        const game = new QuoridorGame();
        const player1 = game.players[0];
        
        // Test valid moves
        const validMoves = game.getValidMoves(player1);
        this.assert(validMoves.length > 0, 'Player should have valid moves');
        
        // Test moving up
        const initialRow = player1.position.row;
        const moveUp = new Position(initialRow - 1, player1.position.col);
        this.assert(game.isValidMove(player1, moveUp), 'Should be able to move up');
        
        game.movePlayer(player1, moveUp);
        this.assertEqual(player1.position.row, initialRow - 1, 'Player should have moved up');
        
        // Test invalid move (out of bounds)
        const invalidMove = new Position(-1, 0);
        this.assert(!game.isValidMove(player1, invalidMove), 'Should not be able to move out of bounds');
    }

    testFencePlacement() {
        console.log('\n=== Testing Fence Placement ===');
        
        const game = new QuoridorGame();
        
        // Test valid horizontal fence
        const horizontalFence = new Fence(3, 3, 'horizontal');
        this.assert(game.isValidFencePlacement(horizontalFence), 'Should be able to place horizontal fence');
        
        game.placeFence(horizontalFence);
        this.assertEqual(game.fences.length, 1, 'Should have one fence after placement');
        this.assertEqual(game.players[0].fencesRemaining, 9, 'Player should have one less fence');
        
        // Test placing same fence again (should fail)
        this.assert(!game.isValidFencePlacement(horizontalFence), 'Should not be able to place fence in same location');
        
        // Test valid vertical fence
        const verticalFence = new Fence(1, 1, 'vertical');
        this.assert(game.isValidFencePlacement(verticalFence), 'Should be able to place vertical fence');
        
        // Test fence intersection
        const intersectingFence = new Fence(2, 3, 'vertical');
        game.placeFence(verticalFence);
        this.assert(!game.isValidFencePlacement(intersectingFence), 'Should not be able to place intersecting fence');
    }

    testFenceBounds() {
        console.log('\n=== Testing Fence Bounds ===');
        
        const game = new QuoridorGame();
        
        // Test horizontal fence at right edge (should fail)
        const rightEdgeFence = new Fence(4, 8, 'horizontal');
        this.assert(!game.isValidFencePlacement(rightEdgeFence), 'Should not be able to place horizontal fence at right edge');
        
        // Test vertical fence at bottom edge (should fail)
        const bottomEdgeFence = new Fence(8, 4, 'vertical');
        this.assert(!game.isValidFencePlacement(bottomEdgeFence), 'Should not be able to place vertical fence at bottom edge');
        
        // Test valid fence near edge
        const validNearEdge = new Fence(4, 7, 'horizontal');
        this.assert(game.isValidFencePlacement(validNearEdge), 'Should be able to place fence one position from edge');
    }

    testPathBlocking() {
        console.log('\n=== Testing Path Blocking ===');
        
        const game = new QuoridorGame();
        
        // Create a scenario where a fence would block a player's path
        // Place fences to create a wall
        const fences = [
            new Fence(6, 0, 'horizontal'),
            new Fence(6, 1, 'horizontal'),
            new Fence(6, 2, 'horizontal'),
            new Fence(6, 3, 'horizontal'),
            new Fence(6, 4, 'horizontal'),
            new Fence(6, 5, 'horizontal'),
            new Fence(6, 6, 'horizontal'),
            new Fence(6, 7, 'horizontal')
        ];
        
        // Place all but the last fence
        for (let i = 0; i < fences.length - 1; i++) {
            game.placeFence(fences[i]);
            game.nextTurn(); // Alternate players
        }
        
        // The last fence should be invalid as it would block player 1's path
        this.assert(!game.isValidFencePlacement(fences[fences.length - 1]), 
                   'Should not be able to place fence that blocks player path');
    }

    testWinConditions() {
        console.log('\n=== Testing Win Conditions ===');
        
        const game = new QuoridorGame();
        
        // Move player 1 to winning position
        game.players[0].position = new Position(0, 4);
        this.assert(game.checkWinCondition(), 'Player 1 should win when reaching top row');
        
        // Reset and test player 2 win
        const game2 = new QuoridorGame();
        game2.players[1].position = new Position(8, 4);
        game2.currentPlayerIndex = 1;
        this.assert(game2.checkWinCondition(), 'Player 2 should win when reaching bottom row');
    }

    testJumpingOverPlayer() {
        console.log('\n=== Testing Jumping Over Player ===');
        
        const game = new QuoridorGame();
        
        // Position players adjacent to each other
        game.players[0].position = new Position(4, 4);
        game.players[1].position = new Position(3, 4);
        
        // Player 1 should be able to jump over player 2
        const jumpMove = new Position(2, 4);
        this.assert(game.isValidMove(game.players[0], jumpMove), 'Should be able to jump over adjacent player');
        
        // Test diagonal jump when blocked
        game.placeFence(new Fence(2, 4, 'horizontal')); // Block straight jump
        const diagonalJump1 = new Position(2, 3);
        const diagonalJump2 = new Position(2, 5);
        
        this.assert(game.isValidMove(game.players[0], diagonalJump1) || 
                   game.isValidMove(game.players[0], diagonalJump2), 
                   'Should be able to jump diagonally when straight jump is blocked');
    }

    testRandomAI() {
        console.log('\n=== Testing Random AI ===');
        
        const game = new QuoridorGame();
        const ai = new RandomAI();
        
        // Test that AI can make a move
        const move = ai.getMove(game, game.players[1]);
        this.assert(move !== null, 'AI should return a valid move');
        
        if (move.type === 'move') {
            this.assert(game.isValidMove(game.players[1], move.position), 'AI move should be valid');
        } else if (move.type === 'fence') {
            this.assert(game.isValidFencePlacement(move.fence), 'AI fence placement should be valid');
        }
    }

    runAllTests() {
        console.log('🎯 Starting Quoridor Game Tests...\n');
        
        this.testGameInitialization();
        this.testPlayerMovement();
        this.testFencePlacement();
        this.testFenceBounds();
        this.testPathBlocking();
        this.testWinConditions();
        this.testJumpingOverPlayer();
        this.testRandomAI();
        
        console.log('\n📊 Test Results:');
        console.log(`✓ Passed: ${this.testsPassed}`);
        console.log(`✗ Failed: ${this.testsFailed}`);
        console.log(`📈 Success Rate: ${((this.testsPassed / (this.testsPassed + this.testsFailed)) * 100).toFixed(1)}%`);
        
        if (this.testsFailed === 0) {
            console.log('🎉 All tests passed!');
        } else {
            console.log('❌ Some tests failed. Check the output above for details.');
        }
        
        return this.testsFailed === 0;
    }
}

// Run tests when this file is loaded
if (typeof window !== 'undefined') {
    // Browser environment
    window.addEventListener('load', () => {
        const tests = new QuoridorTests();
        tests.runAllTests();
    });
} else {
    // Node.js environment
    const tests = new QuoridorTests();
    tests.runAllTests();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuoridorTests;
} 