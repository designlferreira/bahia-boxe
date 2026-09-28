---
target: Home do aluno
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-28T21-17-14Z
slug: src-pages-student-home-tsx
---
# Critique 5: Home do aluno (src/pages/student/Home.tsx)
Method: dual-agent; /dev/amostras (10 states, frames ~325px). Detector CLI + overlay.

## Heuristics: 26/40 — history 23 -> 25 -> 25 -> 27 -> 26
1 Status 3 | 2 Real world 3 | 3 Control 3 | 4 Consistency 2 | 5 Error prevention 3 | 6 Recognition 3 | 7 Efficiency 3 | 8 Minimalist 3 | 9 Error recovery 2 | 10 Help 2
Cognitive load failures: 2/8 (was 3) — both in the suggestion state.

## Specificity
Behaviour highly specific (8-outcome CTA state machine, stepper, trial gold, pips); visual surface stock dark-sporty. Pips the one boxing-specific visual.
Detector: CLI 0; overlay 30 (19 nested-cards FP gallery frame; 5 dark-glow spec'd; 4 thin-border-wide-shadow card-dark; cramped-padding FP; truncation deliberate). Contrast AA; used pip 3.05 flat, 2.77-2.79 on gold/amber gradient start (fail). No text <12px; only deliberate negative-margin tap targets extend past parent (within card padding).

## Priority issues
- [P1] One action, five names ("renovar", "Pedir mais aulas", "Solicitar mais aulas/novo pacote/pacote"); "Tudo agendado" repeats "already booked" + alert + CTA. Fix: one verb "Pedir mais aulas"; drop alert text when CTA is the request; drop duplicate hint. -> clarify
- [P1] acceptSuggestion is a direct UPDATE (api.ts:480); 0028 exclusion-constraint collision surfaces raw Postgres message in toast. Fix: map exclusion_violation to friendly copy + link to Agendar. -> harden
- [P2] Suggestion state: gold balance still dominates; decision card second; no decline next to accept. Fix: suggestion above balance / compact balance; "Recusar/escolher outro". -> layout
- [P2] Next-class card: no relative day (amanhã/hoje), "Pendente" vague; weekday line wraps. Fix: "Amanhã · 19:00", student label "Aguardando o professor", nowrap time. -> clarify
- [P3] Finished package shown as empty tank; spec gold = achievement. Fix: "Você completou as 4 aulas" + "Continuar treinando". -> delight

## Personas
One-handed: CTA mid-screen and moves between states; Detalhes top-right. Invitee: trial state says "book" three times; no price/payment info in stepper. SR: balance section has no heading; h1 is the name. 60+: many 12–13px sizes; no way to reach the professor from Home.

## Minor
No safe-area insets despite viewport-fit=cover; Calendar icon on non-calendar CTAs; recurrence-waiting dead end; CTA skeleton 56px vs 88px real (shift); ErrorState always blames connection; profile card 99px vs next-class 88px in some states.
