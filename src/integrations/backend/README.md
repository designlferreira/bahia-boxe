# Backend layer

Every page and component talks to `api.ts` / `auth.ts` — never to `supabase-js`
directly (the one exception is `pages/auth/Convite.tsx`, which calls
`auth.signUp` for the invite-acceptance signup). Those two files are the only
place that knows about tables, RPC names, and snake_case columns; everything
above them works in the camelCase types from `types.ts`.

- `auth.ts` — Supabase Auth: sign in/out, sign up, session restore, auth-state
  subscription, password change (re-authenticates first so a wrong current
  password is reported as such).
- `api.ts` — reads/writes. Simple CRUD goes through `supabase.from(...)`;
  anything with a credit or status consequence (schedule/complete/no-show/
  undo/replacement, purchase-request approval, package assignment) goes
  through the `security definer` RPCs in `supabase/migrations/`, so the rule
  lives once, in the database, not spread across mutations in React.

## Setup

This project's Supabase database **pre-existed** this frontend — see
`supabase/README.md` for the full story of the real schema and why the
original `migrations/0001-0003` from the empty-database plan were deleted.
Current migrations under `supabase/migrations/` are written against that real
schema and are additive/idempotent; run them in order in the SQL Editor.
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` come from `.env` /
`.env.production`.

Students sign themselves up (`/criar-conta`) or accept an invite
(`/convite/:token`); either way, `auth.signUp` with `name` in the user
metadata is all the client does — `handle_new_user()` creates the `profiles`
row and `handle_new_student_profile()` creates the `students` row, both as DB
triggers. The client never inserts into `profiles`/`students` directly.

## Conventions worth knowing

- **`students.id` is not `profiles.id`.** `auth.users → profiles` is the
  account/identity; `students` is a separate enrolment row (`profile_id`,
  `admin_id`), and it's what `bookings.student_id` / `packages.student_id` /
  `purchase_requests.student_id` actually reference. Any function that starts
  from the logged-in user's profile id resolves the enrolment first
  (`studentIdForProfile()`).
- **`availability_slots` holds concrete hourly datetimes**, not a weekly
  recurrence — the weekly grid in the UI is derived over a rolling horizon
  (`HORIZON_WEEKS`), not stored as one.
- **Credits are a ledger, not a counter.** `credit_transactions` is the
  immutable history of every grant/consumption/reversal
  (`trial_grant` / `purchase_grant` / `admin_grant` / `lesson_completed` /
  `absence_charge` / `undo` / `replacement_refund`); `packages.used_classes`
  is a derived counter kept in sync by the same `security definer` functions
  that write the ledger — nothing outside `complete_booking`/`mark_no_show`/
  `undo_lesson_action`/`mark_as_replacement`/`grant_trial_credit` is allowed
  to touch it. **Available balance is a third, separate concept**: the sum of
  `(total − used)` across every `active` package (a student can have a
  `trial`-origin package and a `purchase`/`admin_grant`-origin package active
  at once) minus reservations, computed by a single canonical function,
  `available_credits_for_student` — `creditsAvailableFor()` / the batched
  `creditsByStudent()` call it (or replicate its exact formula) rather than
  reimplementing the arithmetic.
- **A trial credit is a package**, not a special case: `origin = 'trial'`,
  `kind = 'single'`, exactly one per student ever (enforced by a partial
  unique index on `packages`, not just app convention), granted by an
  `AFTER INSERT ON students` trigger — not by any specific signup screen — so
  every current and future path that creates a `students` row gets it.
  Consumption always drains the trial before a paid package
  (`order by (origin = 'trial') desc, created_at asc`); acquiring a paid
  package never finishes an unused trial, and vice versa.
- **A replacement lesson (`bookings.is_replacement`) never bills a new
  credit** — `complete_booking`/`mark_no_show` skip consumption entirely when
  the booking is flagged. `replacement_for_booking_id` links it to the lesson
  it's recovering; `mark_as_replacement()` reverses that original lesson's
  charge (once — `reverses_transaction_id` is unique) if it had one.
- **Undo has no time limit in the domain layer.** `undo_lesson_action`
  reverses whichever consumption transaction for that booking hasn't already
  been reversed, as long as the booking is still `completed`/`no_show` — the
  10-second toast is just the UI's fast path to it, not a rule enforced by
  the database.
- Idempotency for `complete_booking`/`mark_no_show`/`undo_lesson_action`/
  `mark_as_replacement` comes from locking the booking row (`for update`) and
  checking its current status, not from a unique constraint on `(booking_id,
  reason)` — a booking can legitimately be completed, undone, and completed
  again, and a constraint like that would block the second, valid completion.
