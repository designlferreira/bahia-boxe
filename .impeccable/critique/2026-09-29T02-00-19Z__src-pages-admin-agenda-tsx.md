---
target: Agenda do professor
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-09-29T02-00-19Z
slug: src-pages-admin-agenda-tsx
---
# Critique 1: Agenda do professor (src/pages/admin/Agenda.tsx)
Method: dual-agent; /dev/amostras "Agenda do professor" (3 weeks seeded; late-night clock made "future" classes render as past). Detector CLI + overlay.

## Heuristics: 22/40 (Acceptable)
1 Status 2 (empty day renders nothing; pending-request days not dotted) | 2 Real world 2 (week = next 7 days, not Mon–Sun; "AGENDA DO DIA" over week nav; aria "aguardando confirmação") | 3 Control 3 (no "Hoje" to return) | 4 Consistency 1 (Aprovar red glow vs dashboard soft; gold dots for completed; no de→para) | 5 Error prevention 2 (past unrecorded card also offers Remarcar/Cancelar/reposição) | 6 Recognition 3 | 7 Flexibility 2 (no jump to date, no "Todas aconteceram") | 8 Minimalist 2 (5 controls per unrecorded card) | 9 Recovery 3 | 10 Help 2
Cognitive load failures: 4/8 (single focus, ≤4 choices, one thing at a time, progressive disclosure).

## Specificity
Hour rail with free-hour placeholders and Bebas day numbers feel on-brand; action area is generic equal-weight button stacks; lags the redesigned dashboard.
Detector: CLI 0 (missed hardcoded hex bg-[#262626] :202, bg-[#2E2E2E] :206, border-[#2E2E2E] :212). Overlay in frame: undersized-ui-text x2 (vínculo pills 10px :229), dark-glow on Aprovar (spec'd glow, but should be soft here), nested-cards FP.
Measured: weekday labels 10.5px (:155); week arrows 36x36; action buttons 40px (h-10 override); red "Cancelar" text 4.00:1 FAIL; selected-day weekday label white/80 on red 3.51:1 FAIL; amber dot on selected red day 2.25:1; free-slot dot/dashed border 1.38:1; no focus-visible on week arrows, day buttons, aula cards, "Marcar como reposição"; 14 buttons nested inside card <button> today (invalid HTML); empty day = header "0 aulas" and nothing below.

## Priority issues
- [P0] Buttons nested inside the card <button> (:216 wrapping :243–317) — invalid, SR/keyboard unreliable. Fix: card as div, navigation via its own control (like dashboard ItemResolver). -> harden
- [P1] Past unrecorded card offers 5 actions (Aconteceu/Faltou + Remarcar/Cancelar/reposição). Fix: only Aconteceu/Faltou when awaiting. -> distill
- [P1] Week strip = next 7 days from today (:59–65), ~4 of 7 visible; yesterday hidden; no "Hoje"; only unrecorded days dotted. Fix: Mon–Sun week (or centred), "Hoje" chip, dot pending-request days too. -> layout
- [P1] Consistency/contrast with dashboard: Aprovar red glow -> soft; Cancelar 4.0:1 -> destructive variant; selected-day label 3.51:1; dots gold for completed/red for scheduled contradict colour meaning; no de→para on remarcação. -> colorize/polish
- [P2] Empty day shows nothing (no "Nenhuma aula" / link to Disponibilidade). -> onboard
- [P3] hex colours; 10/10.5px text; 36/40px targets; missing focus rings; end time computed as hour+1 (:235); aria "aguardando confirmação"; one booking per hour in getAdminAgendaForDay (find). -> polish

## Personas
Alex: no bulk, no date jump, paging resets selected day. Sam: nested buttons, no focus rings, action aria-labels without student name. Professor between classes: pages back a week for yesterday; 40px buttons; wall of buttons on each past card.
