-- Seed data for local development
-- Run after: supabase db reset
-- All INSERTs are idempotent (ON CONFLICT clauses) — safe to re-run.

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- Dev user (matches DEV_USER_ID in core/auth.py)
-- ─────────────────────────────────────────────
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_token_current, reauthentication_token
) VALUES (
    '00000000-0000-0000-0000-000000000099',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'dev@quoridor.local',
    crypt('devpassword123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Dev Player","full_name":"Dev Player"}'::jsonb,
    false, '', '', '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, display_name, username, username_chosen, elo, games_played) VALUES
    ('00000000-0000-0000-0000-000000000099', 'dev@quoridor.local', 'Dev Player', 'devplayer', true, 500, 0)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- Auth users (Supabase auth.users)
-- ─────────────────────────────────────────────
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    reauthentication_token
) VALUES
    (
        'aaaaaaaa-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'alice@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'bob@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'carol@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'daniel@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'eva@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'finn@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'grace@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    ),
    (
        'aaaaaaaa-0000-0000-0000-000000000008',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'henry@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        false, '', '', '', '', '', ''
    )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- Public users profile table
-- ─────────────────────────────────────────────
INSERT INTO public.users (id, email, display_name, username, username_chosen, elo, games_played) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com',  'AliceQ',      'aliceq',      true, 1847, 156),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'bob@example.com',    'BobTheGreat', 'bobthegreat', true, 1623,  89),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'carol@example.com',  'CarolStrike', 'carolstrike', true, 1521, 234),
    ('aaaaaaaa-0000-0000-0000-000000000004', 'daniel@example.com', 'DanielWall',  'danielwall',  true, 1412,  67),
    ('aaaaaaaa-0000-0000-0000-000000000005', 'eva@example.com',    'EvaQuoridor', 'evaquoridor', true, 1398,  45),
    ('aaaaaaaa-0000-0000-0000-000000000006', 'finn@example.com',   'FinnMaster',  'finnmaster',  true, 1289, 112),
    ('aaaaaaaa-0000-0000-0000-000000000007', 'grace@example.com',  'GraceBoard',  'graceboard',  true, 1205,  28),
    ('aaaaaaaa-0000-0000-0000-000000000008', 'henry@example.com',  'HenryRook',   'henryrook',   true, 1156,  19)
ON CONFLICT (id) DO UPDATE SET
    elo          = EXCLUDED.elo,
    games_played = EXCLUDED.games_played;

-- ─────────────────────────────────────────────
-- Per-time-control ELO stats
--
-- Game distribution across time controls (180s / 300s / 600s):
--   AliceQ      156 → 42 / 74 / 40   win rate ~62%
--   BobTheGreat  89 → 22 / 44 / 23   win rate ~58%
--   CarolStrike 234 → 60 / 114 / 60  win rate ~55%
--   DanielWall   67 → 16 / 34 / 17   win rate ~50%
--   EvaQuoridor  45 → 10 / 24 / 11   win rate ~48%
--   FinnMaster  112 → 28 / 56 / 28   win rate ~45%
--   GraceBoard   28 →  6 / 14 /  8   win rate ~43%
--   HenryRook    19 →  4 / 10 /  5   win rate ~40%
-- ─────────────────────────────────────────────
INSERT INTO public.user_time_stats (user_id, time_control, games_played, wins, losses) VALUES
    -- AliceQ (1847 overall, ~62% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000001', 180, 42, 26, 16),
    ('aaaaaaaa-0000-0000-0000-000000000001', 300, 74, 46, 28),
    ('aaaaaaaa-0000-0000-0000-000000000001', 600, 40, 25, 15),

    -- BobTheGreat (1623 overall, ~58% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000002', 180, 22, 13, 9),
    ('aaaaaaaa-0000-0000-0000-000000000002', 300, 44, 25, 19),
    ('aaaaaaaa-0000-0000-0000-000000000002', 600, 23, 13, 10),

    -- CarolStrike (1521 overall, ~55% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000003', 180,  60, 33, 27),
    ('aaaaaaaa-0000-0000-0000-000000000003', 300, 114, 63, 51),
    ('aaaaaaaa-0000-0000-0000-000000000003', 600,  60, 33, 27),

    -- DanielWall (1412 overall, ~50% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000004', 180, 16, 8,  8),
    ('aaaaaaaa-0000-0000-0000-000000000004', 300, 34, 17, 17),
    ('aaaaaaaa-0000-0000-0000-000000000004', 600, 17, 9,  8),

    -- EvaQuoridor (1398 overall, ~48% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000005', 180, 10, 5,  5),
    ('aaaaaaaa-0000-0000-0000-000000000005', 300, 24, 11, 13),
    ('aaaaaaaa-0000-0000-0000-000000000005', 600, 11, 5,  6),

    -- FinnMaster (1289 overall, ~45% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000006', 180, 28, 13, 15),
    ('aaaaaaaa-0000-0000-0000-000000000006', 300, 56, 25, 31),
    ('aaaaaaaa-0000-0000-0000-000000000006', 600, 28, 12, 16),

    -- GraceBoard (1205 overall, ~43% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000007', 180,  6, 3,  3),
    ('aaaaaaaa-0000-0000-0000-000000000007', 300, 14, 6,  8),
    ('aaaaaaaa-0000-0000-0000-000000000007', 600,  8, 3,  5),

    -- HenryRook (1156 overall, ~40% win rate)
    ('aaaaaaaa-0000-0000-0000-000000000008', 180,  4, 2,  2),
    ('aaaaaaaa-0000-0000-0000-000000000008', 300, 10, 4,  6),
    ('aaaaaaaa-0000-0000-0000-000000000008', 600,  5, 2,  3)

ON CONFLICT (user_id, time_control) DO UPDATE SET
    games_played = EXCLUDED.games_played,
    wins         = EXCLUDED.wins,
    losses       = EXCLUDED.losses,
    updated_at   = NOW();

-- ─────────────────────────────────────────────
-- Friendships
-- ─────────────────────────────────────────────

-- Accepted friendships
INSERT INTO public.friendships (requester_id, receiver_id, status) VALUES
    -- Alice ↔ Bob
    ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'accepted'),
    -- Alice ↔ Carol
    ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'accepted'),
    -- Bob ↔ Daniel
    ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'accepted'),
    -- Carol ↔ Eva
    ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000005', 'accepted'),
    -- Daniel ↔ Finn
    ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000006', 'accepted'),
    -- Pending: Grace → Alice
    ('aaaaaaaa-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'pending'),
    -- Pending: Henry → Bob
    ('aaaaaaaa-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000002', 'pending')
ON CONFLICT DO NOTHING;
