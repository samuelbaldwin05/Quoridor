export type Orientation = 'h' | 'v';
export type PlayerIndex = 0 | 1;

export interface Position {
  readonly row: number;
  readonly col: number;
}

export interface Wall {
  readonly row: number;
  readonly col: number;
  readonly orientation: Orientation;
}

export interface PlayerState {
  readonly position: Position;
  readonly wallsRemaining: number;
  readonly goalRow: number;
}

export interface GameState {
  readonly players: readonly [PlayerState, PlayerState];
  readonly walls: readonly Wall[];
  readonly currentPlayerIndex: PlayerIndex;
  readonly status: 'idle' | 'playing' | 'finished';
  readonly winner: PlayerIndex | null;
}

export type Move =
  | { readonly kind: 'pawn'; readonly to: Position }
  | { readonly kind: 'wall'; readonly wall: Wall };

export interface StoredMove {
  readonly move: Move;
  readonly playerIndex: PlayerIndex;
  readonly timestamp: number;
}

export interface MoveResult {
  readonly valid: boolean;
  readonly nextState: GameState;
}
