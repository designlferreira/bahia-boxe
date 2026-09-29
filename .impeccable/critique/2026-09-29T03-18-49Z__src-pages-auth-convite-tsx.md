---
target: Entrada (convite e criar conta)
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-29T03-18-49Z
slug: src-pages-auth-convite-tsx
---
# Critique 1: Entrada — convite e criar conta (Convite.tsx, CriarConta.tsx, ConfirmarEmail.tsx)
Method: dual-agent; A reviewed from code only (did not open the live frames), B ran detector + overlay + measurements on /dev/amostras "Entrada".

## Heuristics: ~18/40 for the invite path, CriarConta/ConfirmarEmail much better (A's estimate)
1 Status 2 | 2 Real world 2 | 3 Control 2 | 4 Consistency 1 (three pages differ: gradient, headline sizes, password UX, error style) | 5 Error prevention 1 (rules hidden until server rejects; confirmation unhandled) | 6 Recognition 3 | 7 Flexibility 2 (no autofill on Convite) | 8 Minimalist 3 | 9 Recovery 1 (raw messages, dead end) | 10 Help 1

## Evidence
CLI 0. No hex, no ! overrides, no text <12px in the 3 files. Overlay: only dark-glow on disabled primaries (spec'd) and card FP. Measured: no overflow, targets ≥44, main+h1 present. Convite inputs: no autocomplete/inputmode (CriarConta/Login have them). No focus-visible class in the 3 files (base components unverified). Disabled primaries ≈3.0:1 (0.5 opacity) and explain nothing. Password rules met/unmet = colour only (WCAG 1.4.1), no aria-live. Invalid invite: no link/button (dead end).

## Priority issues
- [P0 — TO CONFIRM] Convite ignores email confirmation: signUp result not inspected; with confirmation ON, acceptInvite runs unauthenticated, invite left unconsumed, raw error, second try "already registered". Depends on Supabase "Confirm email" setting (unknown).
- [P1] Invalid invite is a dead end: no next step, no WhatsApp, no login link; ignores `reason`; network error shown as "CONVITE INVÁLIDO".
- [P1] Convite lacks what CriarConta has: password rules, show/hide, confirm, autocomplete/inputmode, field errors, aria; disabled button silent. Fix: share the form.
- [P2] No professor/brand identity or expectation setting ("Seu professor está te convidando para gerenciar suas aulas"); validate_invite returns only (is_valid, reason), no professor name.
- [P3] ConfirmarEmail: no "abra o e-mail e toque no link", spam tip only after resend, no "Já confirmei, entrar"; rules colour-only; disabled buttons ≈3:1; toggle aria-label (Login has one); "Entrando…" should be "Criando conta…"; signed-in user opening an invite unhandled; headline sizes differ (3xl / 38 / 44).
