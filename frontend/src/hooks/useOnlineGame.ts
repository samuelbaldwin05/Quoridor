import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Move, PlayerIndex } from '@/engine/gameTypes';
import { ApiHttpError, apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'connecting' | 'ready' | 'reconnecting' | 'error';

/**
 * How the result is doing with the backend, which is not the same question as who won.
 * A game is only real once the server has it: unrecorded means no Elo, no games played,
 * no history. So the overlay reports this rather than quietly showing a zero delta.
 *
 *   recording  the POST is in flight or between retries
 *   recorded   the backend finalized it and returned the deltas
 *   observed   somebody else is the one who may record it (the winner of a forfeit);
 *              the delta is read back from the game once their write lands
 *   failed     every attempt failed, so the game is NOT recorded anywhere
 */
export type ResultRecordStatus = 'recording' | 'recorded' | 'observed' | 'failed';

export interface OnlineResult {
  winner: 0 | 1;
  eloChange: number;
  savedGameId: string | null;
  recordStatus: ResultRecordStatus;
}

export type ResultReason = 'win' | 'resign' | 'timeout' | 'disconnect' | 'opponent_timeout';

// Backoff between result-submission attempts. A result is the one request in the app that
// cannot be dropped, so it is retried well past the point of a normal request: an unlucky
// blip at exactly the wrong second used to cost the game entirely.
const RESULT_RETRY_DELAYS_MS = [1500, 4000, 10000];
// Polling for the delta the other side recorded (the observer case). Bounded: after this
// the overlay just shows the outcome without a number.
const OBSERVE_POLL_DELAYS_MS = [1200, 2500, 4000, 6000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GameResultResponse {
  game_id: string;
  winner_id: string;
  elo_change_p1: number;
  elo_change_p2: number;
  new_elo_p1: number;
  new_elo_p2: number;
}

// Only the fields the observer needs off GET /games/{id}; null until it finalizes.
interface GameDetailResponse {
  elo_change_p1: number | null;
  elo_change_p2: number | null;
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
  /**
   * Called when the opponent says they have claimed the win (a disconnect forfeit or a
   * flag). Not to be believed on its own: the claim is checked by the server, so the
   * handler should go and read the game rather than accept the broadcast.
   */
  onOpponentClaimedWin: () => void;
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
  onOpponentClaimedWin,
}: UseOnlineGameOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [result, setResult] = useState<OnlineResult | null>(null);

  // Presence identity. Normally the user id, but a profile that failed to load leaves
  // that empty, and two clients both announcing "" each filter the other out as
  // themselves and sit there believing they are alone. A per-client fallback keeps them
  // distinguishable; presence only has to answer "is somebody else here".
  const fallbackPresenceId = useRef(`anon-${Math.random().toString(36).slice(2)}`);
  const presenceId = myUserId || fallbackPresenceId.current;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const resultSubmittedRef = useRef(false);
  // What was last sent, so Try again can send exactly the same thing.
  const lastSubmissionRef = useRef<{
    winner: 0 | 1;
    reason: ResultReason;
    moveHistory: string[];
    finalTimes?: [number, number];
    savedGameId?: string;
  } | null>(null);

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
  const onOpponentClaimedWinRef = useRef(onOpponentClaimedWin);
  useEffect(() => {
    onMoveReceivedRef.current = onMoveReceived;
    onOpponentResignedRef.current = onOpponentResigned;
    onOpponentTimeoutRef.current = onOpponentTimeout;
    onOpponentAbortedRef.current = onOpponentAborted;
    onOpponentClaimedWinRef.current = onOpponentClaimedWin;
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
      .on('broadcast', { event: 'forfeit' }, () => {
        onOpponentClaimedWinRef.current();
      })
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState<{ userId: string }>();
        const users = Object.values(presenceState).flat();
        setOpponentConnected(users.some((u) => u.userId !== presenceId));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: presenceId });
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
  }, [gameId, presenceId, myRole, resubscribeNonce]);

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

  // Tell the other side we have claimed the win, so a player whose tab was asleep or
  // backgrounded finds out instead of waking to a board that is still "playing". Says
  // nothing about who won: the receiver reads the game from the server.
  function broadcastForfeit() {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'forfeit',
      payload: {},
    });
  }

  function broadcastAbort() {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'abort',
      payload: {},
    });
  }

  // Post the result, retrying anything that might be transient. The endpoint is
  // idempotent (a finished game returns its stored result), so a retry can only ever
  // duplicate the request, never the Elo. Returns true once the backend has it.
  async function postResult(
    winner: 0 | 1,
    reason: ResultReason,
    moveHistory: string[],
    finalTimes: [number, number] | undefined,
    savedGameId: string | undefined,
  ): Promise<boolean> {
    const body = JSON.stringify({
      winner_index: winner,
      reason,
      move_history: moveHistory,
      time_remaining_p1: finalTimes?.[0] ?? null,
      time_remaining_p2: finalTimes?.[1] ?? null,
    });

    for (let attempt = 0; ; attempt++) {
      try {
        const res = await apiFetch<GameResultResponse>(`/games/${gameId}/result`, {
          method: 'POST',
          body,
        });
        const eloChange = myRole === 0 ? res.elo_change_p1 : res.elo_change_p2;
        setResult({
          winner,
          eloChange,
          savedGameId: savedGameId ?? null,
          recordStatus: 'recorded',
        });
        return true;
      } catch (err) {
        // A 4xx is the server's verdict on this payload and will not change on a retry:
        // the claim was rejected, the game is not finalizable, the caller is not a
        // participant. Anything else (timeout, network, 5xx) is worth another go.
        const permanent = err instanceof ApiHttpError && !err.isTransient;
        const delay = RESULT_RETRY_DELAYS_MS[attempt];
        if (permanent || delay === undefined) {
          setResult({
            winner,
            eloChange: 0,
            savedGameId: savedGameId ?? null,
            recordStatus: 'failed',
          });
          return false;
        }
        await sleep(delay);
      }
    }
  }

  async function submitResult(
    winner: 0 | 1,
    reason: ResultReason,
    moveHistory: string[],
    finalTimes?: [number, number],
    savedGameId?: string,
  ) {
    if (resultSubmittedRef.current) return;
    resultSubmittedRef.current = true;
    lastSubmissionRef.current = { winner, reason, moveHistory, finalTimes, savedGameId };
    // Show the outcome immediately. The retries can run for a quarter of a minute, and
    // staring at a finished board with no overlay is worse than a "recording" line.
    setResult({
      winner,
      eloChange: 0,
      savedGameId: savedGameId ?? null,
      recordStatus: 'recording',
    });
    await postResult(winner, reason, moveHistory, finalTimes, savedGameId);
  }

  /** Re-run the last submission after it failed. Drives the overlay's Try again. */
  async function retrySubmitResult() {
    const last = lastSubmissionRef.current;
    if (!last) return;
    setResult((prev) => (prev ? { ...prev, recordStatus: 'recording' } : prev));
    await postResult(last.winner, last.reason, last.moveHistory, last.finalTimes, last.savedGameId);
  }

  // Display-only result for the WINNER of a forfeit. Only the forfeiting player can
  // record a server-valid result (the backend treats the caller as the loser, and you
  // can only report your own loss), so the winner shows the outcome and then reads the
  // delta back off the game once the loser's write lands. Without that read the winner
  // of every resign and timeout is shown no rating change at all, despite their rating
  // having moved.
  function observeResult(winner: 0 | 1, savedGameId?: string) {
    if (resultSubmittedRef.current) return;
    resultSubmittedRef.current = true;
    setResult({
      winner,
      eloChange: 0,
      savedGameId: savedGameId ?? null,
      recordStatus: 'observed',
    });
    void pollForRecordedDelta();
  }

  async function pollForRecordedDelta() {
    for (const delay of OBSERVE_POLL_DELAYS_MS) {
      await sleep(delay);
      try {
        const game = await apiFetch<GameDetailResponse>(`/games/${gameId}`);
        const eloChange = myRole === 0 ? game.elo_change_p1 : game.elo_change_p2;
        if (eloChange !== null && eloChange !== undefined) {
          setResult((prev) => (prev ? { ...prev, eloChange } : prev));
          return;
        }
      } catch {
        // keep trying; the overlay is already up and correct apart from the number
      }
    }
  }

  return {
    connectionStatus,
    opponentConnected,
    result,
    submitMove,
    broadcastMove,
    broadcastResign,
    broadcastTimeout,
    broadcastForfeit,
    broadcastAbort,
    submitResult,
    retrySubmitResult,
    observeResult,
  };
}
