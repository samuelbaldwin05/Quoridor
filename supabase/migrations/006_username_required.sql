-- Make username the single source of identity for user-facing text.
-- display_name (Google OAuth name) stays on the row but is no longer surfaced
-- in any public response.

-- ─────────────────────────────────────────────────────────────────────────────
-- username_chosen flag — distinguishes auto-generated placeholders from
-- user-picked usernames. UsernameGuard on the frontend redirects to /setup
-- whenever this is false, so new users still go through the setup flow even
-- though the column itself is now NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS username_chosen boolean NOT NULL DEFAULT false;

-- Existing rows that already have a username were chosen by the user.
UPDATE public.users
SET username_chosen = true
WHERE username IS NOT NULL;

-- Backfill any pre-existing null usernames with a deterministic placeholder
-- so the NOT NULL constraint can land. id-derived to guarantee uniqueness.
UPDATE public.users
SET username = 'player_' || substr(id::text, 1, 8)
WHERE username IS NULL;

ALTER TABLE public.users
    ALTER COLUMN username SET NOT NULL;
