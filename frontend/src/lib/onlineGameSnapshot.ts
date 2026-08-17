import { parseMove } from '@/engine/notation';
import type { PlayerIndex, StoredMove } from '@/engine/gameTypes';

/** GET /games/{id} as the two participants see it. The clocks are participant-only. */
export interface GameSnapshot {
  status: 'waiting' | 'playing' | 'finished' | 'resigned';
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  time_control: number | null;
  move_history: string[];
  winner_index: number | null;
  time_used_p1: number | null;
  time_used_p2: number | null;
  last_move_at: string | null;
}

export function toStoredMoves(history: string[]): StoredMove[] {
  return history.map((notation, i) => ({
    move: parseMove(notation),
    playerIndex: (i % 2) as PlayerIndex,
    timestamp: 0,
  }));
}

/**
 * Both clocks as the SERVER has them: the time each player has already spent, plus the
 * time the player on move has spent on the move they still owe. It runs ahead of what a
 * client was showing, because the server cannot see the pauses a client takes while its
 * opponent is disconnected. That is the point: it is the copy that survives a reload.
 */
export function clocksFrom(snapshot: GameSnapshot, timeControl: number): [number, number] {
  const used: [number, number] = [snapshot.time_used_p1 ?? 0, snapshot.time_used_p2 ?? 0];
  const moveCount = snapshot.move_history.length;
  const onMove = moveCount % 2;
  // Clocks are held until the first move, so nothing accrues to the current turn yet.
  const elapsed =
    moveCount > 0 && snapshot.last_move_at
      ? Math.max(0, (Date.now() - Date.parse(snapshot.last_move_at)) / 1000)
      : 0;
  return [0, 1].map((i) =>
    Math.max(0, Math.round(timeControl - used[i]! - (i === onMove ? elapsed : 0))),
  ) as [number, number];
}
