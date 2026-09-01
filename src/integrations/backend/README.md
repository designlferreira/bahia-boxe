# Backend layer

Every page and component talks to `api.ts` / `auth.ts` — never to `supabase-js`
directly (the one exception is `pages/auth/Convite.tsx`, which calls
`auth.signUp` for the invite-acceptance signup). Those two files are the only
place that knows about tables, RPC names, and snake_case columns; everything
above them works in the camelCase types from `types.ts`.

- `auth.ts` — Supabase Auth: sign in/out, session restore, auth-state
  subscription, password change (re-authenticates first so a wrong current
  password is reported as such).
- `api.ts` — reads/writes. Simple CRUD goes through `supabase.from(...)`;
  anything with business rules (booking creation, completion, no-show,
  purchase-request approval, package assignment, invites, reconciliation)
  goes through the `security definer` RPCs in
  `supabase/migrations/0002_views_and_rpcs.sql`, so those rules live in the
  database rather than the client.

## Setup

`supabase/migrations/` must be applied to the project (SQL Editor, in order:
`0001`, `0002`, `0003`). `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` come
from `.env` / `.env.production`.

Students sign themselves up through `/convite/:token`; the `0003` trigger
creates their `profiles` + `user_roles` rows. Admin accounts have no self-signup
path by design — create one in the Supabase Dashboard (Authentication → Users →
Add user), then insert its `profiles` and `user_roles` rows manually (the exact
SQL is in the `0003` migration's header comment).

## Conventions worth knowing

- `students.id` **is** the student's `profiles.id` (== `auth.users.id`). Every
  `student_id` column holds that same value, so "the logged-in student" needs no
  join to resolve, and RLS on student-owned rows is a plain
  `student_id = auth.uid()`.
- Credits are derived, never stored: `(total − used) − future scheduled`
  (`calcCreditsAvailable`). Cancelling a booking therefore returns the credit
  on its own, with no explicit refund step.
