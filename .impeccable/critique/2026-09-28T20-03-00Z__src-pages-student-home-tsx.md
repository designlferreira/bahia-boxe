---
target: Home do aluno
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-28T20-03-00Z
slug: src-pages-student-home-tsx
---
# Critique 2: Home do aluno (src/pages/student/Home.tsx)
Method: dual-agent; both saw the rendered page via /dev/amostras (9 states, fake data, no login); detector CLI + in-page overlay.

## Heuristics: 25/40 (Acceptable) — previous 23/40
1 Status 3 | 2 Real world 3 | 3 Control 2 | 4 Consistency 2 | 5 Error prevention 3 | 6 Recognition 3 | 7 Efficiency 2 | 8 Minimalist 3 | 9 Error recovery 2 | 10 Help 2
Note: run 1 was source-only; run 2 had live evidence and scored 3 and 7 stricter on pre-existing issues.
Cognitive load failures: 3/8 (was 4/8).

## Specificity
Mostly interchangeable; pip meter is the authored detail. Perfil de Boxe absent from Home.
Detector: CLI 0; overlay 33 (21 nested-cards false positive from gallery frame; 6 dark-glow = spec'd button glow, kept; 4 thin-border-wide-shadow on card-dark; 1 cramped-padding FP; 1 text-overflow = long template name, real minor). All contrast AA (5.3–6.6:1). No Home text <12px; nav labels 11.5px.

## Priority issues
- [P1] Headline shows bookable credits, not remaining: 2 left both booked -> grey 0 + red "Solicitar mais aulas". Fix: headline = total-used, bookable/booked in summary; secondary CTA when all booked. -> clarify
- [P1] Stale suggestion: rejected_with_suggestion query has no date filter (api.ts:307). Fix: only future suggestions, say what it replaces, inline Aceitar. -> harden
- [P2] Install banner: dismiss only by double-click, not persisted, gold decorative. -> polish
- [P2] Color/type drift: Bebas on "PRÓXIMA AULA", red "Agendada" badge, red 10px "Nova" chip. -> colorize, typeset
- [P3] Skeleton doesn't match layout; student shell has no max width on tablet/desktop. -> adapt

## Personas
Older: used pips ~1.2:1 invisible; lots of 12–14px. First-timer: 3 "nothing" blocks, no welcome. One-handed: sticky banner, bell top-right, no press feedback under reduced motion. Screen reader: suggestion button no aria-label, bell no focus ring.

## Minor
"Pacote acabou" triple-says it; recurrence w/o package -> empty list; NotificationBell border-[#333]; long template name unreadable.
