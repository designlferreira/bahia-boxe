# Backend layer

This app talks to `src/integrations/backend/api.ts` everywhere, never to
`localStorage` or Supabase directly from components. Right now that file is
backed by an in-memory + `localStorage`-persisted mock store (`store.ts`),
because no live Supabase project is configured for this environment.

`supabase/migrations/*.sql` defines the **real** schema this mock mirrors
exactly (tables, RLS, views, RPCs — spec §4). To switch to a live backend:

1. Provision a Supabase project and apply `supabase/migrations/`.
2. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
3. Reimplement the functions in `api.ts` and `auth.ts` as thin wrappers over
   `src/integrations/supabase/client.ts` (`supabase.from(...)`, `supabase.rpc(...)`)
   instead of the mock store. Call sites (hooks/components) do not change —
   they only import from `@/integrations/backend/api`.
