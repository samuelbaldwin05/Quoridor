import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Move, PlayerIndex } from '@/engine/gameTypes';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'connecting' | 'ready' | 'reconnecting' | 'error';

export interface OnlineResult {
  winner: 0 | 1;
  eloChange: number;
  savedGameId: string | null;
}

interface GameResultResponse {
  game_id: string;
  winner_id: string;
  elo_change_p1: number;
  elo_change_p2: number;
  new_elo_p1: number;
  new_elo_p2: number;
}

interface UseOnlineGameOptions {
  gameId: string;
  myRole: 0 | 1;
  myUserId: string;
  /** Called when the opponent broadcasts a move (playerIndex is derived, never from payload) */
  onMoveReceived: (move: Move, opponentIndex: PlayerIndex) => void;
  /** Called when the opponent resigns */
  onOpponentResigned: () => void;
  /** Called when the opponent's clock hits 0 — caller should record a win for myRole */
  onOpponentTimeout: () => void;
  /** Called when the opponent's grace period expired — neither side should record a result */
  onOpponentAborted: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOnlineGame({
  gameId,
  myRole,
  myUserId,
  onMoveReceived,
  onOpponentResigned,
  onOpponentTimeout,
  onOpponentAborted,
}: UseOnlineGameOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [result, setResult] = useState<OnlineResult | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const resultSubmittedRef = useRef(false);

  // Reconnect: a transient socket error bumps `resubscribeNonce` (after a capped
  // exponential backoff) so the subscribe effect tears down + re-subscribes.
  // backoffRef resets on a clean SUBSCRIBE without re-running the effect.
  const [resubscribeNonce, setResubscribeNonce] = useState(0);
  const backoffRef = useRef(0);

  // Keep callbacks in refs so channel handlers don't go stale. Updates run in
  // an effect (not during render) per React rules; the channel handlers read
  // ref.current at fire time, so a one-frame lag here is fine.
  const onMoveReceivedRef = useRef(onMoveReceived);
  const onOpponentResignedRef = useRef(onOpponentResigned);
  const onOpponentTimeoutRef = useRef(onOpponentTimeout);
  const onOpponentAbortedRef = useRef(onOpponentAborted);
  useEffect(() => {
    onMoveReceivedRef.current = onMoveReceived;
    onOpponentResignedRef.current = onOpponentResigned;
    onOpponentTimeoutRef.current = onOpponentTimeout;
    onOpponentAbortedRef.current = onOpponentAborted;
  });

  useEffect(() => {
    // NOTE: this channel is not private. The backend is authoritative over every
    // move + the result (see /games/{id}/move and /result), so a forged broadcast
    // can't fabricate a ranked outcome — but it can still grief (fake resign/abort,
    // desync). To close that, enable a private channel: add `private: true` here
    // AND apply a Realtime authorization policy restricting topic game:{id} to the
    // two participants. Left off until that policy is verified live (a wrong policy
    // silently blocks ALL realtime).
    const channel = supabase.channel(`game:${gameId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const opponentIndex: PlayerIndex = myRole === 0 ? 1 : 0;

    channel
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        // Never trust playerIndex from the payload — always derive it
        onMoveReceivedRef.current(payload.move as Move, opponentIndex);
      })
      .on('broadcast', { event: 'resign' }, () => {
        onOpponentResignedRef.current();
      })
      .on('broadcast', { event: 'timeout' }, () => {
        onOpponentTimeoutRef.current();
      })
      .on('broadcast', { event: 'abort' }, () => {
        onOpponentAbortedRef.current();
      })
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState<{ userId: string }>();
        const users = Object.values(presenceState).flat();
        setOpponentConnected(users.some((u) => u.userId !== myUserId));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: myUserId });
          setConnectionStatus('ready');
          backoffRef.current = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('reconnecting');
          if (reconnectTimer) clearTimeout(reconnectTimer);
          const delay = Math.min(1000 * 2 ** backoffRef.current, 10000);
          backoffRef.current += 1;
          reconnectTimer = setTimeout(() => setResubscribeNonce((n) => n + 1), delay);
        }
      });

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      supabase.removeChannel(channel);
    };
  }, [gameId, myUserId, myRole, resubscribeNonce]);

  // Server-authoritative move: the backend validates against stored state and
  // records it. Throws (via apiFetch) on rejection — caller must not apply locally.
  async function submitMove(notation: string): Promise<void> {
    await apiFetch<{ move_number: number }>(`/games/${gameId}/move`, {
      method: 'POST',
      body: JSON.stringify({ notation }),
    });
  }

  function broadcastMove(move: Move) {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'move',
      payload: { move, playerIndex: myRole },
    });
  }

  function broadcastResign() {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'resign',
      payload: { playerIndex: myRole },
    });
  }

  function broadcastTimeout() {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'timeout',
      payload: { playerIndex: myRole },
    });
  }

  function broadcastAbort() {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'abort',
      payload: {},
    });
  }

  async function submitResult(
    winner: 0 | 1,
    reason: 'win' | 'resign' | 'timeout' | 'disconnect',
    moveHistory: string[],
    finalTimes?: [number, number],
    savedGameId?: string,
  ) {
    if (resultSubmittedRef.current) return;
    resultSubmittedRef.current = true;
    try {
      const res = await apiFetch<GameResultResponse>(`/games/${gameId}/result`, {
        method: 'POST',
        body: JSON.stringify({
          winner_index: winner,
          reason,
          move_history: moveHistory,
          time_remaining_p1: finalTimes?.[0] ?? null,
          time_remaining_p2: finalTimes?.[1] ?? null,
        }),
      });
      const eloChange = myRole === 0 ? res.elo_change_p1 : res.elo_change_p2;
      setResult({ winner, eloChange, savedGameId: savedGameId ?? null });
    } catch {
      setResult({ winner, eloChange: 0, savedGameId: savedGameId ?? null });
    }
  }

  // Display-only result for the WINNER of a forfeit. Only the forfeiting player
  // can record a server-valid result (the backend treats the caller as the loser,
  // and you can only report your own loss), so the winner just shows the outcome
  // and relies on refreshProfile() to pick up the new ELO once the loser's write
  // lands. eloChange 0 simply hides the delta line in the overlay.
  function observeResult(winner: 0 | 1, savedGameId?: string) {
    if (resultSubmittedRef.current) return;
    resultSubmittedRef.current = true;
    setResult({ winner, eloChange: 0, savedGameId: savedGameId ?? null });
  }

  return {
    connectionStatus,
    opponentConnected,
    result,
    submitMove,
    broadcastMove,
    broadcastResign,
    broadcastTimeout,
    broadcastAbort,
    submitResult,
    observeResult,
  };
}
