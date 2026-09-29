---
target: Painel do professor
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-29T01-34-19Z
slug: src-pages-admin-dashboard-tsx
---
# Critique 3 (final): Painel do professor (src/pages/admin/Dashboard.tsx)
Method: dual-agent; /dev/amostras "Painel do professor" (4 states). Detector CLI + overlay.

## Heuristics: 30/40 (Good, up from 27 and 20)
1 Status 3 | 2 Real world 4 | 3 Control 3 | 4 Consistency 2 | 5 Error prevention 3 | 6 Recognition 3 | 7 Efficiency 3 | 8 Minimalist 3 | 9 Error recovery 3 | 10 Help 3
Cognitive load failures: 2/8 (colour code overloaded: gold done vs amber needs-you 7° apart; flat hierarchy inside expanded groups).

## Specificity
Authored for the product: live countdown, remarcação from→to, "Dia livre", "Sem registro", risk reasons, Faltou text quoting the package rule. All critique-2 P1s resolved.
Detector: CLI 0. Overlay in dashboard frames: card-dark thin-border-wide-shadow x9 (design-system utility), nested-cards x4 FP (gallery frame wrapper). No text <12px, all targets >=44px, no overflow, all contrast AA (lowest "Faltou" badge 5.29), every button has focus-visible.

## Priority issues
- [P1] Focus lost after resolving an item (row/group unmounts → focus on body); no live-region announcement. Fix: move focus to next item / group header / #resolver; polite live region. -> harden
- [P1] "Concluída" (accent, hue 45) and "Sem registro"/"Pendente" (amber, hue 38) read the same at 12px. Fix: neutral/check style for done; amber only for needs-you. -> colorize
- [P2] Onboarding disappears at the first student even with WhatsApp/pacote undone; "Quatro passos" doesn't count progress. Fix: "Falta configurar" row in Resolver until done; "1 de 4 feito". -> onboard
- [P2] Same unrecorded class appears in Hoje (details only) and in Resolver (actions). Fix: Hoje badge jumps to/expands the Resolver item, or inline actions. -> distill
- [P3] Flat grouping: expanded items same weight as group header. Fix: smaller/muted header or indent. -> layout

## Personas
Alex: no "todas aconteceram" batch. Sam: focus loss, toast undo timing (mitigated by permanent undo), Faltou busy not announced. Professor between classes: open amber box ~700px; "Domingo, 27 set" lacks "1 dia atrás".

## Minor
active:scale not in reduced-motion override; H1 is the professor's name; "Convidar o primeiro aluno" goes to list, not invite action; "Amanhã" vs "Quarta-feira, 30 set" length variance.
