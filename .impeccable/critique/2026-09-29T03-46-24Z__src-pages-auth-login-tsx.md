---
target: Login
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-29T03-46-24Z
slug: src-pages-auth-login-tsx
---
# Critique 1: Login (src/pages/auth/Login.tsx)
Method: dual-agent; A reviewed from code only, B ran detector + measurements on /dev/amostras "Login".

## Heuristics: 24/40
1 Status 3 | 2 Real world 2 ("Gestão de aulas" is professor jargon) | 3 Control 2 (no way back to the invite / to resend confirmation) | 4 Consistency 2 (eye toggle and email input differ from ContaForm) | 5 Error prevention 3 | 6 Recognition 3 | 7 Efficiency 3 | 8 Minimalist 3 | 9 Recovery 1 (unconfirmed e-mail reported as wrong password) | 10 Help 2 (no resend)

## Evidence
CLI 0. Two <12px texts (caption, "ou" at 11px). Eye toggle 18x18 (needs 44), no focus-visible, no aria-pressed, icons without aria-hidden; email lacks inputMode; both links without own focus class; logo SVG not aria-hidden; placeholder and eye icon 4.77:1. No overflow; fits a 375x667 phone. No red glow in frame (overlay hits FP).

## Priority issues
- [P0] Unconfirmed e-mail shown as "E-mail ou senha incorretos." (auth.ts:98-108 maps every 400/401/422); with Confirm email ACTIVE this hits every new student who logs in before confirming, and "Já confirmei, entrar" sends them here. No resend path from Login.
- [P1] Invite users get no context: Login ignores the pending invite token; "Já tenho conta · Entrar" lands on a generic screen.
- [P1] Fixed brand + placeholder ("BAHIA BOXE / Gestão de aulas", voce@bahiaboxe.com) vs PRODUCT.md per-professor brand; "Gestão de aulas" speaks to the professor.
- [P2] Eye toggle parity with ContaForm (44px, aria-pressed, focus ring, aria-hidden icons), inputMode/autoCapitalize on email.
- [P3] 11px texts, logo aria-hidden, links focus ring, placeholder contrast, error clears while typing.
