# Quoridor Game 🧩

A Python implementation of the classic Quoridor board game with object-oriented design, featuring human vs computer gameplay and extensible architecture for AI evolution models.

## 🎯 Game Overview

Quoridor is a strategic board game where players race to reach the opposite side of a 9×9 grid while using fences to block their opponent's path.

### Objective
- **Player 1 (Human)**: Start at e1, reach any square on row 9
- **Player 2 (Computer)**: Start at e9, reach any square on row 1

### Components
- 9×9 grid board
- 2 pawns (one per player)
- 20 fences total (10 per player)

## 🚀 How to Play

### Running the Game
```bash
python quoridor.py
```

### Game Rules

#### Pawn Movement
- Move one square orthogonally (up/down/left/right)
- Cannot move through fences
- **Jumping**: If opponent's pawn blocks your path:
  - Jump over if space behind is free
  - Move diagonally around if jumping is blocked

#### Fence Placement
- Fences block movement between squares
- Must leave at least one path to opponent's goal
- Cannot move fences once placed
- Enter position (e.g., 'a1') and orientation ('h' for horizontal, 'v' for vertical)

#### Winning
First player to reach any square on their target row wins!

## 🏗️ Object-Oriented Architecture

The game is designed with extensibility in mind for AI evolution models:

### Core Classes

#### `Position`
- Represents board coordinates
- Supports chess notation (e.g., e1, e9)
- Hashable for efficient lookups

#### `Player` (Abstract Base Class)
```python
class Player:
    def make_move(self, board) -> Tuple[str, dict]:
        # Override this method for different AI strategies
        pass
```

#### `HumanPlayer`
- Handles console input for human players
- Validates user input and provides helpful prompts

#### `ComputerPlayer`
- Currently implements random move selection
- **Perfect for evolution**: Easy to replace with AI logic

#### `Board`
- Manages game state and rule validation
- Pathfinding algorithms for fence placement validation
- Comprehensive move validation

#### `Fence`
- Represents fence objects with position and orientation
- Collision detection and movement blocking logic

#### `QuoridorGame`
- Main game controller
- Turn management and win condition checking

## 🤖 Extending for AI Evolution

The architecture is designed to support AI evolution models:

### Creating Custom AI Players

```python
class EvolutionAIPlayer(Player):
    def __init__(self, player_id, start_position, goal_row, genome):
        super().__init__(player_id, start_position, goal_row)
        self.genome = genome  # Your evolution parameters
        self.name = "Evolution AI"
    
    def make_move(self, board):
        # Implement your AI logic here
        # Access board state: board.fences, board.players
        # Get valid moves: board.get_valid_moves(self)
        
        # Example: Use genome to weight different strategies
        valid_moves = board.get_valid_moves(self)
        # Apply your evolution-based decision making
        return selected_move
```

### Key Methods for AI Development

#### Board Analysis
```python
# Get all valid moves for a player
valid_moves = board.get_valid_moves(player)

# Check if position is reachable
board.is_valid_position(position)

# Analyze pawn movement options
valid_positions = board.get_valid_pawn_moves(player)

# Test fence placement
board.is_valid_fence_placement(fence)
```

#### Game State Access
```python
# Current board state
board.fences          # Set of placed fences
board.players         # List of all players
player.position       # Current player position
player.fences_remaining  # Fences left to place
```

### Evolution Model Integration

1. **Genome Representation**: Define parameters for move evaluation
2. **Fitness Function**: Win rate, move efficiency, game length
3. **Population Management**: Create multiple AI players with different genomes
4. **Tournament Play**: Run games between AI variants

Example evolution setup:
```python
class EvolutionManager:
    def __init__(self, population_size=50):
        self.population = self.create_initial_population(population_size)
    
    def run_tournament(self):
        for ai1, ai2 in self.get_pairings():
            game = QuoridorGame()
            game.board.players = [ai1, ai2]
            winner = game.play()
            self.update_fitness(ai1, ai2, winner)
    
    def evolve_generation(self):
        # Selection, crossover, mutation
        pass
```

## 🎮 Game Features

### Current Implementation
- ✅ Full Quoridor rule implementation
- ✅ Human vs Computer gameplay
- ✅ Comprehensive move validation
- ✅ Fence placement with pathfinding validation
- ✅ Jump and diagonal movement mechanics
- ✅ Visual board display with coordinates
- ✅ Chess notation support

### Planned Enhancements
- 🔄 GUI interface
- 🔄 Network multiplayer
- 🔄 Advanced AI strategies
- 🔄 Game replay and analysis
- 🔄 Tournament mode

## 🛠️ Technical Details

### Dependencies
- Python 3.7+
- Standard library only (no external dependencies)

### Key Algorithms
- **Pathfinding**: BFS for goal reachability validation
- **Move Validation**: Comprehensive rule checking
- **Fence Collision**: Geometric intersection detection

### Performance Considerations
- Efficient fence storage using sets
- Position hashing for fast lookups
- Lazy evaluation of valid moves

## 📝 Example Game Session

```
Welcome to Quoridor!
Player 1 (Human) starts at e1 and needs to reach row 9
Player 2 (Computer) starts at e9 and needs to reach row 1

==================================================
QUORIDOR BOARD
==================================================
    a  b  c  d  e  f  g  h  i 
 1  .  .  .  .  1  .  .  .  . 
                               
 2  .  .  .  .  .  .  .  .  . 
                               
 3  .  .  .  .  .  .  .  .  . 
                               
 4  .  .  .  .  .  .  .  .  . 
                               
 5  .  .  .  .  .  .  .  .  . 
                               
 6  .  .  .  .  .  .  .  .  . 
                               
 7  .  .  .  .  .  .  .  .  . 
                               
 8  .  .  .  .  .  .  .  .  . 
                               
 9  .  .  .  .  2  .  .  .  . 

Human's turn!
Current position: e1
Fences remaining: 10
Enter 'move' to move pawn or 'fence' to place fence: move
Enter direction (up/down/left/right): down
```

## 🤝 Contributing

This codebase is designed for extensibility. Key areas for contribution:
- AI strategy implementations
- Evolution algorithm integration
- Performance optimizations
- Additional game modes
- GUI development

## 📄 License

Open source - feel free to use and modify for your AI evolution experiments!

---

Ready to build the ultimate Quoridor AI? The foundation is here - now evolve it! 🧬🤖 