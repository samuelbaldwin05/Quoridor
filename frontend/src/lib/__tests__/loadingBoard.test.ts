import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LOADING_ROUTES,
  LOADING_WALLS,
  STEP,
  pawnCentre,
  wallRect,
  type LoadingWall,
} from '@/lib/loadingBoard';

/**
 * The animation lives in CSS keyframes in index.html, and the board is drawn twice: once there
 * so it paints before the bundle, once in LoadingBoard.tsx. Nothing else would notice any of
 * the three drifting apart, so this reads index.html back and checks the game they play is a
 * real one. It caught two illegal moves the first time it ran.
 */

const html = readFileSync(fileURLToPath(new URL('../../../index.html', import.meta.url)), 'utf8');

/** Every `translate(x, y)` in a keyframes block, in order, de-duplicated across the pairs of
 *  stops that hold a pawn still between hops. */
function routeFromKeyframes(name: string, start: [number, number]): [number, number][] {
  const block = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n      \\}`).exec(html);
  expect(block, `no @keyframes ${name} in index.html`).not.toBeNull();

  const seen: [number, number][] = [];
  for (const [, x, y] of block![1].matchAll(/translate\((-?\d+)(?:px)?,\s*(-?\d+)(?:px)?\)/g)) {
    const cell: [number, number] = [start[0] + Number(y) / STEP, start[1] + Number(x) / STEP];
    const last = seen[seen.length - 1];
    if (!last || last[0] !== cell[0] || last[1] !== cell[1]) seen.push(cell);
  }
  return seen;
}

function blocks(wall: LoadingWall, from: [number, number], to: [number, number]): boolean {
  const [fromRow, fromCol] = from;
  const [toRow, toCol] = to;
  if (wall.orientation === 'h') {
    // Cuts the groove above `row`, so it stops crossings between row - 1 and row.
    const crossing =
      Math.max(fromRow, toRow) === wall.row && Math.min(fromRow, toRow) === wall.row - 1;
    return crossing && fromCol === toCol && (fromCol === wall.col || fromCol === wall.col + 1);
  }
  const crossing =
    Math.min(fromCol, toCol) === wall.col && Math.max(fromCol, toCol) === wall.col + 1;
  return crossing && fromRow === toRow && (fromRow === wall.row || fromRow === wall.row + 1);
}

describe('the loading screen game', () => {
  it.each(['dark', 'light'] as const)('%s follows the route the keyframes animate', (pawn) => {
    const name = `loading-board-pawn-${pawn}`;
    expect(routeFromKeyframes(name, LOADING_ROUTES[pawn][0])).toEqual(LOADING_ROUTES[pawn]);
  });

  it.each(['dark', 'light'] as const)('%s only ever steps one square at a time', (pawn) => {
    const route = LOADING_ROUTES[pawn];
    for (let i = 1; i < route.length; i += 1) {
      const distance =
        Math.abs(route[i][0] - route[i - 1][0]) + Math.abs(route[i][1] - route[i - 1][1]);
      expect(distance, `hop ${i} of the ${pawn} pawn`).toBe(1);
    }
  });

  it.each(['dark', 'light'] as const)('%s never walks through a wall', (pawn) => {
    const route = LOADING_ROUTES[pawn];
    for (let i = 1; i < route.length; i += 1) {
      for (const wall of LOADING_WALLS) {
        expect(
          blocks(wall, route[i - 1], route[i]),
          `${pawn} hop ${i} crosses the ${wall.orientation} wall at ${wall.row},${wall.col}`,
        ).toBe(false);
      }
    }
  });

  it('keeps both pawns on the board and out of each other’s square', () => {
    const { dark, light } = LOADING_ROUTES;
    for (const [row, col] of [...dark, ...light]) {
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(5);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(5);
    }
    // Neither pawn is ever animated onto a square the other is standing on, which the
    // keyframes cannot express a jump over.
    const darkSquares = new Set(dark.map(([r, c]) => `${r},${c}`));
    for (const [row, col] of light) expect(darkSquares.has(`${row},${col}`)).toBe(false);
  });

  it('starts each pawn on its own back rank and finishes on the far one', () => {
    expect(LOADING_ROUTES.dark[0][0]).toBe(4);
    expect(LOADING_ROUTES.dark[LOADING_ROUTES.dark.length - 1][0]).toBe(0);
    expect(LOADING_ROUTES.light[0][0]).toBe(0);
    expect(LOADING_ROUTES.light[LOADING_ROUTES.light.length - 1][0]).toBe(4);
  });
});

/** The splash markup: what the browser paints before the bundle runs. */
function splashMarkup(): string {
  const splash = /<div id="boot-splash"[^>]*>([\s\S]*?)\n {4}<\/div>/.exec(html);
  expect(splash, 'no #boot-splash markup in index.html').not.toBeNull();
  return splash![1];
}

describe('the board inlined in index.html', () => {
  it('sits outside #root, so mounting React cannot restart the animation', () => {
    // Inside #root, React clears the container on mount and the board starts over from frame
    // one, which reads as a flash. Outside it, the same element runs uninterrupted until
    // lib/bootSplash.ts fades it out.
    expect(splashMarkup()).toContain('class="loading-board"');
    expect(html).toContain('<div id="root"></div>');
    expect(html.indexOf('id="boot-splash"')).toBeLessThan(html.indexOf('<div id="root">'));
  });

  it('is styled without waiting for index.css', () => {
    // A render-blocking stylesheet would defeat the point, so the rules are inlined and the
    // theme variables carry literal fallbacks.
    const style = /<style>([\s\S]*?)<\/style>/.exec(html);
    expect(style).not.toBeNull();
    expect(style![1]).toContain('.app-loading');
    expect(style![1]).toContain('.loading-board');
    expect(style![1]).toContain('@keyframes loading-board-pawn-dark');
    expect(style![1]).toMatch(/fill: var\(--modern-primary-bg, #[0-9a-f]{6}\)/);
  });

  it.each(LOADING_WALLS)('draws the $orientation wall where the routes assume it is', (wall) => {
    const { x, y, width, height } = wallRect(wall);
    expect(html).toContain(
      `class="loading-board-wall is-${wall.orientation}" x="${x}" y="${y}" width="${width}" height="${height}"`,
    );
  });

  it('says nothing at all: the board animating is the whole message', () => {
    // A caption read as a second loading screen competing with this one, and anything it
    // could say before storage has been read would be a guess anyway.
    const text = splashMarkup()
      .replace(/<[^>]*>/g, '')
      .trim();
    expect(text).toBe('');
  });

  it.each(['dark', 'light'] as const)('starts the %s pawn on its first square', (pawn) => {
    const { cx, cy } = pawnCentre(LOADING_ROUTES[pawn][0]);
    expect(html).toContain(`class="loading-board-pawn is-${pawn}" cx="${cx}" cy="${cy}"`);
  });
});
