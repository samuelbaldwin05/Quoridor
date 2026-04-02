-- Bootstrap roles required by PostgREST, GoTrue, and postgres-meta.
-- The supabase/postgres image may already create these; IF NOT EXISTS guards make this safe either way.

-- auth schema stub so migrations can reference auth.* before GoTrue starts.
-- GoTrue will create auth.users and replace these stubs with real implementations.
CREATE SCHEMA IF NOT EXISTS auth;

-- auth.uid() stub: returns NULL until GoTrue installs the real function.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULL::uuid $$;

DO $$
BEGIN

  -- anon: unauthenticated API access (no login, granted through authenticator)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;

  -- authenticated: logged-in users (no login, granted through authenticator)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;

  -- service_role: bypasses RLS (no login, granted through authenticator)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;

  -- authenticator: PostgREST connection role (can login, switches to anon/authenticated/service_role per JWT)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'postgres';
  END IF;

  -- supabase_auth_admin: GoTrue DB admin
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN PASSWORD 'postgres';
  END IF;

  -- supabase_admin: used by postgres-meta
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOINHERIT LOGIN PASSWORD 'postgres' SUPERUSER;
  END IF;

END
$$;

-- Grant sub-roles to authenticator so PostgREST can switch roles per request
GRANT anon          TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role  TO authenticator;

-- Allow authenticator to use the public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO supabase_admin;

-- Future tables: auto-grant select/insert/update/delete to anon and authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
