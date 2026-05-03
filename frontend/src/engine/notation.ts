// Algebraic notation — kept in lockstep with backend/app/engine/notation.py.
// Pawn move:   "<col><rank>"        e.g. "e2"
// Wall move:   "<col><rank><h|v>"   e.g. "e3v"
// col 'a'..'i' = engine col 0..8.   rank '1'..'9' = engine row 8..0.
// Walls live on engine row 0..7, so wall ranks are 2..9.

import type { Move } from './gameTypes';

const PAWN_RE = /^([a-i])([1-9])$/;
const WALL_RE = /^([a-i])([2-9])([hv])$/;

export class NotationError extends Error {}

export function parseMove(text: string): Move {
  const s = text.trim().toLowerCase();
  const wall = WALL_RE.exec(s);
  if (wall) {
    const [, colLetter, rankDigit, orient] = wall;
    return {
      kind: 'wall',
      wall: {
        col: colLetter.charCodeAt(0) - 97,
        row: 9 - Number.parseInt(rankDigit, 10),
        orientation: orient as 'h' | 'v',
      },
    };
  }
  const pawn = PAWN_RE.exec(s);
  if (pawn) {
    const [, colLetter, rankDigit] = pawn;
    return {
      kind: 'pawn',
      to: {
        col: colLetter.charCodeAt(0) - 97,
        row: 9 - Number.parseInt(rankDigit, 10),
      },
    };
  }
  throw new NotationError(`unrecognized move notation: ${JSON.stringify(text)}`);
}

export function serializeMove(move: Move): string {
  const colLetter = (c: number) => String.fromCharCode(97 + c);
  if (move.kind === 'pawn') {
    return `${colLetter(move.to.col)}${9 - move.to.row}`;
  }
  return `${colLetter(move.wall.col)}${9 - move.wall.row}${move.wall.orientation}`;
}
