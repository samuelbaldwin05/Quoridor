// Position class for representing board coordinates
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

