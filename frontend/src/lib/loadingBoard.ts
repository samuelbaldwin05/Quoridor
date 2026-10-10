/**
 * The game the loading screen plays out. The walls here are what LoadingBoard draws, and the
 * routes mirror the `loading-board-pawn-*` keyframes in index.css.
 *
 * Kept out of the component so the keyframes have something to be checked against:
 * LoadingBoard.test.ts reads the CSS back and holds the two in step. A loading screen showing
 * an illegal game is a poor first impression of a game about the rules.
 */

export const BOARD_SIZE = 5;
export const CELL = 16;
export const STEP = 20; // a cell plus the groove a wall sits in
export const GROOVE = 4;

export interface LoadingWall {
  /** Orientation, and the cell the wall's low corner touches, as in the engine's notation. */
  orientation: 'h' | 'v';
  row: number;
  col: number;
}

/** An `h` wall cuts the groove above `row`, across `col` and `col + 1`. A `v` wall cuts the
 *  groove right of `col`, across `row` and `row + 1`. */
export const LOADING_WALLS: LoadingWall[] = [
  { orientation: 'h', row: 3, col: 1 },
  { orientation: 'v', row: 0, col: 2 },
];

/** [row, col] per hop, in order. */
export const LOADING_ROUTES: Record<'dark' | 'light', [number, number][]> = {
  dark: [
    [4, 2],
    [3, 2],
    [3, 3],
    [2, 3],
    [1, 3],
    [0, 3],
  ],
  light: [
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
};

/** SVG geometry, shared by the React board and the one inlined in index.html. */
export const BOARD_PX = BOARD_SIZE * STEP - GROOVE;

export function wallRect(wall: LoadingWall) {
  const span = 2 * CELL + GROOVE;
  return wall.orientation === 'h'
    ? { x: wall.col * STEP, y: wall.row * STEP - GROOVE, width: span, height: GROOVE }
    : { x: (wall.col + 1) * STEP - GROOVE, y: wall.row * STEP, width: GROOVE, height: span };
}

export function pawnCentre([row, col]: [number, number]) {
  return { cx: col * STEP + CELL / 2, cy: row * STEP + CELL / 2 };
}
