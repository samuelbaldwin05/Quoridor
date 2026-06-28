-- Track when each user last changed their username so the backend can enforce
-- a 7-day cooldown. NULL means the username has never been changed (initial
-- setup is always allowed regardless of this column).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username_updated_at TIMESTAMPTZ DEFAULT NULL;
