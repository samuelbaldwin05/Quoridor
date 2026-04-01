import { BOARD_SIZE, INITIAL_WALL_COUNT, PLAYER_STARTS } from './constants';
import type { GameState, Move, MoveResult, PlayerIndex, PlayerState } from './gameTypes';
import { getValidPawnMoves, isValidWallPlacement } from './moveValidation';

export function createInitialState(): GameState {
  const players: [PlayerState, PlayerState] = [
    {
      position: { row: PLAYER_STARTS[0].row, col: PLAYER_STARTS[0].col },
      wallsRemaining: INITIAL_WALL_COUNT,
      goalRow: PLAYER_STARTS[0].goalRow,
    },
    {
      position: { row: PLAYER_STARTS[1].row, col: PLAYER_STARTS[1].col },
      wallsRemaining: INITIAL_WALL_COUNT,
      goalRow: PLAYER_STARTS[1].goalRow,
    },
  ];

  return {
    players,
    walls: [],
    currentPlayerIndex: 0,
    status: 'idle',
    winner: null,
  };
}

export function checkWin(state: GameState): PlayerIndex | null {
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i]!;
    if (player.position.row === player.goalRow) {
      return i as PlayerIndex;
    }
  }
  return null;
}

export function applyMove(state: GameState, move: Move): MoveResult {
  if (state.status !== 'playing') {
    return { valid: false, nextState: state };
  }

  const playerIndex = state.currentPlayerIndex;
  const player = state.players[playerIndex];
  const nextPlayerIndex: PlayerIndex = playerIndex === 0 ? 1 : 0;

  if (move.kind === 'pawn') {
    const validMoves = getValidPawnMoves(state, playerIndex);
    const isValid = validMoves.some((p) => p.row === move.to.row && p.col === move.to.col);
    if (!isValid) return { valid: false, nextState: state };

    const newPlayers: [typeof state.players[0], typeof state.players[1]] = [
      { ...state.players[0] },
      { ...state.players[1] },
    ];
    newPlayers[playerIndex] = { ...player, position: move.to };

    const nextState: GameState = {
      ...state,
      players: newPlayers,
      currentPlayerIndex: nextPlayerIndex,
    };

    const winner = checkWin(nextState);
    if (winner !== null) {
      return {
        valid: true,
        nextState: { ...nextState, status: 'finished', winner },
      };
    }

    return { valid: true, nextState };
  } else {
    // Wall placement
    if (player.wallsRemaining <= 0) return { valid: false, nextState: state };
    if (!isValidWallPlacement(state, move.wall)) return { valid: false, nextState: state };

    const newPlayers: [typeof state.players[0], typeof state.players[1]] = [
      { ...state.players[0] },
      { ...state.players[1] },
    ];
    newPlayers[playerIndex] = { ...player, wallsRemaining: player.wallsRemaining - 1 };

    const nextState: GameState = {
      ...state,
      players: newPlayers,
      walls: [...state.walls, move.wall],
      currentPlayerIndex: nextPlayerIndex,
    };

    return { valid: true, nextState };
  }
}

export function getValidMoves(state: GameState): Move[] {
  const playerIndex = state.currentPlayerIndex;
  const pawnMoves = getValidPawnMoves(state, playerIndex).map(
    (to) => ({ kind: 'pawn' as const, to }),
  );

  const wallMoves: Move[] = [];
  const player = state.players[playerIndex];
  if (player.wallsRemaining > 0) {
    for (let row = 0; row < BOARD_SIZE - 1; row++) {
      for (let col = 0; col < BOARD_SIZE - 1; col++) {
        for (const orientation of ['h', 'v'] as const) {
          const wall = { row, col, orientation };
          if (isValidWallPlacement(state, wall)) {
            wallMoves.push({ kind: 'wall', wall });
          }
        }
      }
    }
  }

  return [...pawnMoves, ...wallMoves];
}
