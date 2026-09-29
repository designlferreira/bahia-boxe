---
target: Agenda do professor
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
timestamp: 2026-09-29T02-17-29Z
slug: src-pages-admin-agenda-tsx
---
# Critique 2: Agenda do professor (src/pages/admin/Agenda.tsx)
Method: dual-agent; /dev/amostras "Agenda do professor" (±3 weeks seeded; clock 23:15 so "future" rendered as past). Detector CLI + overlay.

## Heuristics: 27/40 (Acceptable, up from 22)
1 Status 2 (pending outside visible week invisible; no "now"/in-progress) | 2 Real world 3 | 3 Control 3 | 4 Consistency 3 (no "Todas aconteceram") | 5 Error prevention 3 (past-time pending still offers Aprovar) | 6 Recognition 3 | 7 Flexibility 2 | 8 Minimalist 3 | 9 Recovery 3 | 10 Help 2 (dots unexplained)
Cognitive load failures: 2/8 (working memory — last week's open items on Monday; hierarchy on future cards — red Cancelar competes).

## Specificity
Dashboard's sibling: hour rail, Bebas day numbers, amber "needs you". Below card header still stock button pairs. All critique-1 P0/P1 resolved.
Detector: CLI 0; no hex, no ! overrides. Overlay: 7 nested-cards, all FP (gallery phone frame). Measured: nothing <12px, nothing <44px, focus-visible everywhere, no nested buttons, unique action names, all text contrast AA (selected day 4.80 tight). Non-text: free-slot dot 2.53, dashed border 2.05 (below 3:1).
REGRESSION: horizontal overflow on today — card with vínculo pill (whitespace-nowrap, added in step 6) + de→para line (step 4) + badge push the card header to 300px in a 280px column; page content 420px in 373px; Recusar/Cancelar/badge cut off. Cause: no min-w-0 on :266 flex-1 and name div :286.

## Priority issues
- [P0] Cards overflow sideways when a vínculo pill / de→para line is present. Fix: min-w-0 on column and name div, pill on its own line, StatusBadge shrink-0, de→para wraps. -> adapt
- [P1] Monday blind spot: last week's pending/unrecorded invisible. Fix: dot the week arrow + aria when pendências fall outside the visible week (or a line "1 aula sem registro na semana passada" that jumps). -> clarify
- [P2] Future cards: Remarcar + red Cancelar + "Marcar como reposição" on the most common state. Fix: same as past cards (actions in detail) or at most one secondary. -> distill
- [P2] Time-state gaps: past-time pending still offers Aprovar without cue; in-progress class shows "Agendada" + Cancelar; past free hours still listed. -> clarify
- [P3] Day change not announced (aria-live on header line); "hoje" only a 50% border; pending dot overlaps weekday label; free-slot dot/border <3:1. -> polish

## Personas
Alex: no date picker, no "Todas aconteceram", free hour inert. Sam: silent day change; clipped content read but not visible. Professor between classes: Monday blind spot, red Cancelar under the thumb, clipped Recusar.
