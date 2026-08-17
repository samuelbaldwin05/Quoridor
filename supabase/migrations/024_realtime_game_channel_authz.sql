-- Restrict the per-game Realtime channel (topic "game:{id}") to its two participants.
--
-- Written as 015 and never committed, so it applied to local databases (the CLI reads the
-- migrations directory, not git) and never to the hosted one. It is renumbered to the end
-- rather than kept at 015 because the hosted database is already past 019: the CLI skips
-- pending migrations older than the last applied version unless it is asked not to, so a
-- file numbered 015 would sit there forever. The DROP guards below let it apply to a local
-- database that already picked it up under the old number.
--
-- With Supabase Realtime Authorization, a channel opened with `private: true` consults RLS
-- on realtime.messages for both receiving (SELECT) and sending / presence (INSERT). Public
-- channels bypass these policies, so this only bites once the channel is private, which it
-- is: see `private: true` in frontend/src/hooks/useOnlineGame.ts. The two are coupled;
-- neither is useful alone.
--
-- Why it matters even though the backend is authoritative over moves and results: a forged
-- broadcast cannot fabricate a ranked outcome any more, but it can still grief. A third
-- party who knows a game id could push a fake resign or abort, or a junk move that desyncs
-- both clients, and could read the position of a game in progress.
--
-- The topic is "game:<uuid>"; g.id is compared as text so a non-game topic cannot raise a
-- cast error on the way past.
--
-- Verified at the database level (2026-08-17), by setting role + request.jwt.claims +
-- realtime.topic and exercising the policies directly: a participant reads the topic and
-- can insert; an authenticated non-participant reads nothing and its insert is rejected;
-- anon reads nothing; a participant on another game's topic reads nothing. What that does
-- NOT prove is that the Realtime server populates topic and claims the way this assumes,
-- which needs two live clients. A wrong policy blocks all realtime silently, so if moves or
-- presence stop flowing, revert `private: true` and drop these two policies together.

DROP POLICY IF EXISTS "game_channel_participants_read" ON realtime.messages;
CREATE POLICY "game_channel_participants_read"
    ON realtime.messages FOR SELECT TO authenticated
    USING (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND realtime.topic() LIKE 'game:%'
        AND EXISTS (
            SELECT 1 FROM public.games g
            WHERE g.id::text = split_part(realtime.topic(), ':', 2)
              AND (auth.uid() = g.player1_id OR auth.uid() = g.player2_id)
        )
    );

DROP POLICY IF EXISTS "game_channel_participants_send" ON realtime.messages;
CREATE POLICY "game_channel_participants_send"
    ON realtime.messages FOR INSERT TO authenticated
    WITH CHECK (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND realtime.topic() LIKE 'game:%'
        AND EXISTS (
            SELECT 1 FROM public.games g
            WHERE g.id::text = split_part(realtime.topic(), ':', 2)
              AND (auth.uid() = g.player1_id OR auth.uid() = g.player2_id)
        )
    );
