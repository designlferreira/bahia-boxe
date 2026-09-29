# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA (`vite-plugin-pwa`, `display: standalone`), used primarily on phones. Mobile web, not native.

## Users

- **Aluno (student).** Uses the app on a phone 1–3 times a week, a few seconds per session. Job: see how many classes remain and get the next class booked (or see the one the professor already booked). Students span all ages, including older people and people not used to apps.
- **Professor (admin).** Uses the app on a phone between classes, several times a day. Job: see the day, approve/complete/mark no-show on classes, manage students, packages, payments requests and availability. Not technical; the product must never assume they understand software concepts.
- **Product owner (Lucas).** Builds and runs the product; is neither the professor nor a student. Not a developer.

## Product Purpose

Bahia Boxe replaces the WhatsApp back-and-forth that boxing professors use to schedule classes and track prepaid class packages. Success is a professor running their whole class schedule and package balances from the app, and a student booking or checking a class in seconds.

Direction: a SaaS for many boxing professors. Today the live database has a single professor (Salvador, BA); multi-professor is the goal, not the current state.

## Positioning

Built around how a small boxing professor actually operates: prepaid class packages with a credit ledger, a choice between students self-booking from published availability (AUTOSSERVICO) or the professor fixing each student's weekly days and generating the package's classes (RECORRENCIA), explicit no-show/cancellation credit rules, and a boxing-specific fighter profile (Perfil de Boxe: self vs. coach assessment across 8 dimensions and 6 archetypes).

## Operating Context

- Booking lifecycle: `pending_confirmation → scheduled → completed | no_show | cancelled | rescheduled`, plus rejection with a suggested time.
- Two scheduling modes per professor (`profiles.modo_agendamento`); screens differ by mode.
- Packages: purchase requests from students, templates, trial credit, recurrence-generated packages; balance is computed in Postgres (`calcular_saldo_pacote`), never in the UI.
- Invites: professor sends a `/convite/:token` link to onboard a student.
- Timezone `America/Sao_Paulo`; all copy in pt-BR.

## Capabilities and Constraints

- Stack: React 18 + Vite + TypeScript + Tailwind v3 + shadcn/ui (Radix), TanStack Query, Sonner toasts (only toast pattern), date-fns/-tz, lucide-react icons, Supabase (auth, Postgres, RLS, RPCs). Deployed on Vercel.
- Every screen needs loading, empty and error states; skeletons match final layout.
- Destructive actions are confirmed; reversible ones offer undo where possible.
- Targets from the spec: book a class in ≤ 3 taps from the student home; professor resolves a pending item in ≤ 2 taps from the dashboard.
- PWA service worker (`autoUpdate`) can serve stale UI until the app is reopened.
- Domain vocabulary and rules are documented in `CLAUDE.md` and `project/uploads/bahia-boxe-especificacao-completa.md`; those are authoritative for terminology.
- Branding is per professor: "Bahia Boxe" is the individual brand of the current professor, not a platform brand shown to every professor's students. In the multi-professor future, each professor's students see that professor's own brand.
- No concept of academy/unit/city exists in the schema, and none is planned for now. Do not design surfaces that assume one.

## Brand Commitments

- Name: Bahia Boxe, the brand of the current professor (branding is per professor, see Capabilities and Constraints). Language: Brazilian Portuguese throughout.
- Existing identity recorded in the spec (§3, §12.1): dark UI, boxing red for primary action and urgency, gold for achievement/available credit, amber for pending; Bebas Neue for page titles and large numbers only, Inter for body. Tokens only, no hardcoded colors. (Visual detail belongs in DESIGN.md; listed here only because the spec made it binding.)
- Voice: plain, direct, reassuring; never blames the user; explains consequences (e.g. what a cancellation does to credit) in the action itself.

## Evidence on Hand

- Product spec: `project/uploads/bahia-boxe-especificacao-completa.md`.
- Original Claude Design prototype and transcripts: `project/Bahia Boxe.dc.html`, `chats/`, screenshots in `project/uploads/`.
- No testimonials, customer logos, pricing, or usage metrics exist. Do not fabricate any.
- No shareable-card photography: the fighter-profile share art was cancelled (2026-09-14) for lack of a real base asset.

## Product Principles

1. **One dominant thing per screen.** Remaining classes for the student; the day's agenda for the professor.
2. **The professor is not technical.** Every rule the system enforces is explained in plain language at the point of action.
3. **The database is the authority.** Credit, balance and authorization live in Postgres; the UI shows, never recomputes.
4. **Never lose or strand data.** Block creation of inconsistent data, never access to existing data.
5. **Fewer taps than a WhatsApp message.** If a flow is slower than texting the professor, it has failed.

## Accessibility & Inclusion

- WCAG 2.1 AA: text contrast (note `--muted-foreground` and red-on-dark small text), visible focus, labeled icon-only controls (bottom nav).
- Students of all ages, including older and less app-literate users: generous tap targets, legible type sizes, no meaning carried by icon or color alone.
