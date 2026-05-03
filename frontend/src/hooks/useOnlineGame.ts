import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Move, PlayerIndex } from '@/engine/gameTypes';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'connecting' | 'ready' | 'error';

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
}: UseOnlineGameOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [result, setResult] = useState<OnlineResult | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const resultSubmittedRef = useRef(false);

  // Keep callbacks in refs so channel handlers don't go stale. Updates run in
  // an effect (not during render) per React rules; the channel handlers read
  // ref.current at fire time, so a one-frame lag here is fine.
  const onMoveReceivedRef = useRef(onMoveReceived);
  const onOpponentResignedRef = useRef(onOpponentResigned);
  const onOpponentTimeoutRef = useRef(onOpponentTimeout);
  useEffect(() => {
    onMoveReceivedRef.current = onMoveReceived;
    onOpponentResignedRef.current = onOpponentResigned;
    onOpponentTimeoutRef.current = onOpponentTimeout;
  });

  useEffect(() => {
    const channel = supabase.channel(`game:${gameId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

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
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState<{ userId: string }>();
        const users = Object.values(presenceState).flat();
        setOpponentConnected(users.some((u) => u.userId !== myUserId));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: myUserId });
          setConnectionStatus('ready');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, myUserId, myRole]);

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

  async function submitResult(winner: 0 | 1, finalTimes?: [number, number], savedGameId?: string) {
    if (resultSubmittedRef.current) return;
    resultSubmittedRef.current = true;
    try {
      const res = await apiFetch<GameResultResponse>(`/games/${gameId}/result`, {
        method: 'POST',
        body: JSON.stringify({
          winner_index: winner,
          move_history: [],
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

  return {
    connectionStatus,
    opponentConnected,
    result,
    broadcastMove,
    broadcastResign,
    broadcastTimeout,
    submitResult,
  };
}
