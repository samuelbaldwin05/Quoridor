// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StoredMove } from '@/engine/gameTypes';
import { MoveListPanel } from '../MoveListPanel';

// jsdom doesn't implement scrollIntoView; the panel calls it when viewing history.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const moves: StoredMove[] = [
  { move: { kind: 'pawn', to: { row: 7, col: 4 } }, playerIndex: 0, timestamp: 0 },
  { move: { kind: 'pawn', to: { row: 1, col: 4 } }, playerIndex: 1, timestamp: 0 },
];

const label = (idx: 0 | 1) => (idx === 0 ? 'You' : 'Opp');

describe('MoveListPanel', () => {
  it('renders Start plus one entry per move with the caller-supplied labels', () => {
    render(
      <MoveListPanel
        moveHistory={moves}
        viewIndex={null}
        onViewIndex={vi.fn()}
        playerLabel={label}
        showResign={false}
      />,
    );
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Opp')).toBeTruthy();
    expect(screen.getByText('e2')).toBeTruthy(); // serialized move 0
  });

  it('selects a move by index and jumps back to live', () => {
    const onViewIndex = vi.fn();
    render(
      <MoveListPanel
        moveHistory={moves}
        viewIndex={1}
        onViewIndex={onViewIndex}
        playerLabel={label}
        showResign={false}
      />,
    );
    fireEvent.click(screen.getByText('Start'));
    expect(onViewIndex).toHaveBeenCalledWith(0);
    // "Live ↓" is shown only while viewing history; clicking it returns to live (null).
    fireEvent.click(screen.getByText('Live ↓'));
    expect(onViewIndex).toHaveBeenCalledWith(null);
  });

  it('disables back at the start and forward while live', () => {
    const { rerender } = render(
      <MoveListPanel
        moveHistory={moves}
        viewIndex={null}
        onViewIndex={vi.fn()}
        playerLabel={label}
        showResign={false}
      />,
    );
    // live: forward disabled, back enabled, no "Live ↓"
    expect(screen.getByTitle('Next move').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTitle('Previous move').hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText('Live ↓')).toBeNull();

    // at Start (index 0): back disabled, forward enabled
    rerender(
      <MoveListPanel
        moveHistory={moves}
        viewIndex={0}
        onViewIndex={vi.fn()}
        playerLabel={label}
        showResign={false}
      />,
    );
    expect(screen.getByTitle('Previous move').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTitle('Next move').hasAttribute('disabled')).toBe(false);
  });

  it('shows the resign control only when showResign and onResign are provided', () => {
    const onResign = vi.fn();
    const { rerender } = render(
      <MoveListPanel
        moveHistory={moves}
        viewIndex={null}
        onViewIndex={vi.fn()}
        playerLabel={label}
        showResign={false}
        onResign={onResign}
      />,
    );
    expect(screen.queryByTitle('Resign')).toBeNull();

    rerender(
      <MoveListPanel
        moveHistory={moves}
        viewIndex={null}
        onViewIndex={vi.fn()}
        playerLabel={label}
        showResign={true}
        onResign={onResign}
      />,
    );
    fireEvent.click(screen.getByTitle('Resign'));
    expect(onResign).toHaveBeenCalledTimes(1);
  });
});
