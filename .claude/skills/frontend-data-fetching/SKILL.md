---
name: frontend-data-fetching
description: Use when adding or changing any frontend call to the backend API. Covers the actual apiFetch + colocated-interface pattern used throughout frontend/src, and flags where it diverges from the Zod/QueryError/TanStack Query conventions described in CLAUDE.md.
---

# Frontend data fetching

Read this before wiring a new backend call into a component, hook, or page.

## Important: this skill documents the real pattern, not the CLAUDE.md aspiration

`CLAUDE.md` states that API responses are validated through Zod, errors are wrapped in a `QueryError` class, and server state is held in TanStack Query hooks. Verified against the actual code: none of that is currently true for backend calls.

- There is no `QueryError` class anywhere in `frontend/src`.
- Zod (`zod`, a real dependency) is used for two things only: `frontend/src/lib/schemas/settingsSchemas.ts` (`SettingsSchema`, validating `localStorage` settings in `settingsStorage.ts`) and the equivalent game-storage schemas. It is never used to validate a response from `backend/app/api/`.
- `@tanstack/react-query` is a real dependency and `App.tsx` wraps the app in a `QueryClientProvider`, but no `useQuery` or `useMutation` call exists anywhere in `frontend/src`. Every backend call goes through plain `useState`/`useEffect` (or a direct `await` in an event handler) instead.

Treat the gap below as the current, consistent convention to match. If you want to move a given call onto Zod validation, a `QueryError` type, or an actual TanStack Query hook, that is a real improvement, but it is new work, not "following existing conventions": say so in the PR rather than presenting it as the established pattern, and expect it to look different from every other call site until more of them migrate.

## The actual pattern

1. **The client function**: `frontend/src/lib/api.ts` exports one generic function, `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`. It attaches the auth header (dev token or Supabase session access token), sets `Content-Type: application/json`, and on a non-OK response throws a plain `Error` with the status and response body text (`API ${res.status}: ${text}`). A 204 or empty body resolves to `undefined as T`. There is no per-endpoint wrapper function in `lib/`; call sites call `apiFetch` directly.
2. **The response shape**: a plain TypeScript `interface`, colocated with the code that calls `apiFetch`, not in a separate schema file. For example `frontend/src/pages/GameHistoryPage.tsx` declares `interface OnlineGameDetail` right above the function that adapts it, with a comment naming the backend route it corresponds to (`// Public replay record from GET /games/{id} (online games).`). `frontend/src/hooks/useOnlineGame.ts` does the same with `interface GameResultResponse` next to the `apiFetch<GameResultResponse>('/games/${gameId}/result', ...)` call. There is no runtime validation of the response; the interface is a compile-time-only contract with the backend schema.
3. **The call site**: either inside a custom hook (`frontend/src/hooks/useAuth.ts`'s `fetchProfile`, `frontend/src/hooks/useOnlineGame.ts`) or directly inside a page component's `useEffect` (`frontend/src/pages/ProfilePage.tsx`, `GameHistoryPage.tsx`). State is plain `useState` (`loading`, `error`, the data itself), not a query cache.
4. **Errors**: a `try/catch` around the `apiFetch` call. `ProfilePage.tsx`'s pattern (a `useState<string>` for the error message, set from `err instanceof Error ? err.message : ...` in the `catch`) is representative. There is no shared error type; each call site handles the thrown `Error` locally.

## What still applies from CLAUDE.md, verified

- No `any`: response and request shapes are always typed, whether by an `interface` (the common case above) or a Pydantic-mirroring type. Do not type an `apiFetch` call as `apiFetch<any>` or leave its generic off (it then infers `unknown`, which usually just moves the untyped access somewhere worse).
- Named exports are preferred (`export function apiFetch`, `export interface OnlineResult`), not default exports.
- Encapsulate related fetch + state logic in a custom hook when more than one component needs it (`useAuth`, `useOnlineGame`); keep a one-off fetch inline in the page that needs it (`ProfilePage`, `GameHistoryPage`) rather than extracting a hook nothing else uses.

## Adding a new call

1. Add the request/response `interface`(s) next to the function or hook that will call `apiFetch`, matching the backend's Pydantic schema field-for-field (check `backend/app/schemas/` for the actual response model rather than guessing field names).
2. Call `apiFetch<ResponseType>(path, init)`, passing `method` and a JSON-stringified `body` for writes, matching the existing call sites' shape.
3. Wrap it in `try/catch` (or let it throw and handle at a boundary that already exists, like the pattern in `useOnlineGame.ts` where a move-submit failure is deliberately left to throw so the caller does not apply the move locally, per the confirm-then-apply rule in `docs/ARCHITECTURE.md`'s multiplayer authority model).
4. If more than one place needs this call, put it in a custom hook under `frontend/src/hooks/`; otherwise keep it colocated with the one page or component that uses it.
5. No `any`. No new dependency on `QueryError` or a `useQuery` hook unless you are deliberately introducing that pattern for the first time and calling it out as such.
