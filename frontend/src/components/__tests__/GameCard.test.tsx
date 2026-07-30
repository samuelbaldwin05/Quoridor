// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameCard } from '../GameCard';

describe('GameCard', () => {
  it('renders the opponent label and children', () => {
    render(
      <GameCard opponentLabel="Rival">
        <div>board contents</div>
      </GameCard>,
    );
    expect(screen.getByText('Rival')).toBeInTheDocument();
    expect(screen.getByText('board contents')).toBeInTheDocument();
  });

  it('falls back to the difficulty label and "You" when no labels given', () => {
    render(
      <GameCard difficulty="bot2" gameMode="vs-bot">
        <div />
      </GameCard>,
    );
    expect(screen.getByText('Hard Bot')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('uses Player 1 / Player 2 labels in pass-and-play mode', () => {
    render(
      <GameCard gameMode="pass-and-play">
        <div />
      </GameCard>,
    );
    expect(screen.getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Player 2')).toBeInTheDocument();
  });

  it('shows fence chips only when counts are provided', () => {
    render(
      <GameCard opponentLabel="Rival" topFenceCount={7} bottomFenceCount={9}>
        <div />
      </GameCard>,
    );
    expect(screen.getByText('Fences: 7')).toBeInTheDocument();
    expect(screen.getByText('Fences: 9')).toBeInTheDocument();
  });
});
