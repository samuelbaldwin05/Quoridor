-- Add username field to users (separate from google display_name)
ALTER TABLE public.users ADD COLUMN username text UNIQUE;

-- Challenges table for friend-to-friend game invitations
CREATE TABLE public.challenges (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    challenged_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    time_control  integer     NOT NULL DEFAULT 300,
    status        text        NOT NULL DEFAULT 'pending',
    game_id       uuid        REFERENCES public.games(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (challenger_id, challenged_id)
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenges_participants_read"
    ON public.challenges FOR SELECT
    USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

CREATE POLICY "challenges_challenger_insert"
    ON public.challenges FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "challenges_participants_update"
    ON public.challenges FOR UPDATE
    USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

CREATE POLICY "challenges_participants_delete"
    ON public.challenges FOR DELETE
    USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;

CREATE INDEX idx_challenges_challenged ON public.challenges (challenged_id, status);
CREATE INDEX idx_challenges_challenger ON public.challenges (challenger_id, status);
