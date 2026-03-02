// Player class for representing game players
class Player {
    constructor(id, startPos, goalRow, name) {
        this.id = id;
        this.position = startPos;
        this.goalRow = goalRow;
        this.fencesRemaining = GAME_CONFIG.INITIAL_FENCE_COUNT;
        this.name = name;
    }

    hasWon() {
        return this.position.row === this.goalRow;
    }
}

