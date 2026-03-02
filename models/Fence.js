// Fence class for representing fence placements on the board
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

