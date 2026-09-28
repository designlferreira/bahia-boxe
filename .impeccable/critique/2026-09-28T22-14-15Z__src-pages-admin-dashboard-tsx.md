---
target: Painel do professor
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-28T22-14-15Z
slug: src-pages-admin-dashboard-tsx
---
# Critique 1: Painel do professor (src/pages/admin/Dashboard.tsx)
Method: dual-agent; /dev/amostras "Painel do professor" (3 states, frames ~322–327px). Detector CLI + overlay.

## Heuristics: 20/40 (Acceptable, low)
1 Status 2 | 2 Real world 3 | 3 Control 1 | 4 Consistency 2 | 5 Error prevention 1 | 6 Recognition 2 | 7 Efficiency 2 | 8 Minimalist 2 | 9 Error recovery 3 | 10 Help 2
Cognitive load failures: 5/8 (single focus, grouping, hierarchy, working memory, progressive disclosure).

## Specificity
Generic "KPI + lists" admin home in Bahia Boxe palette. Domain-specific bits: causal banner copy, "Pedido de remarcação" label. The day's agenda (principle 1 dominant element) is absent; biggest type goes to "Alunos N ativos".
Detector: CLI 0; overlay 18 in dashboard frames — 2 TRUE nested-cards (pending item card #141414 inside amber panel, :108 in :99), 2 dark-glow (spec'd), 6 nested FP (gallery frame), card-dark thin-border-wide-shadow (system). Contrast all AA (destructive "Sem créditos" 4.60 lowest). Text <12px: KPI labels 11px, units 11.5px (:225, :227). No target <44px, no overflow; narrow rows wrap. Hardcoded hex :81 #1A1F27/#171717, :99 #211A0B, :108 #141414.

## Priority issues (verified in code: atRisk filter api.ts:758; reject toast :48; approve has no disabled :122)
- [P0] Day's agenda not on dashboard; "Próximas aulas" = next 3 of any day, 4th block, below fold on busy days; no empty state for new professor. -> layout (+ onboard)
- [P1] "Alunos em risco" wrong in recorrência (credits = restantes − futuras = 0 by construction → everyone "Sem créditos"); unbounded list. Fix: saldo_pacotes.restantes ≤2 for recurrence, cap 3. -> clarify
- [P1] Remarcação approve/reject: no from→to, no pending/disabled (double tap), no undo; reject sheet offers suggestion that API ignores; toast "Recusado com sugestão de horário" is false. -> harden
- [P2] ≤2 taps target missed for awaiting-confirmation (banner → Agenda oldest day → Concluir → confirm); purchase requests absent; banner red vs Agenda amber for same state. -> distill
- [P3] Hardcoded hexes, duplicate class mb-4.5 mb-5, amber dot pulses red ring, time duplicated in upcoming rows, skeleton not layout-shaped. -> polish

## Personas
Between classes: next class below fold, no approve feedback. Non-technical: "(s)" plurals, "crédito" vs "aula", unexplained "em risco", false toast, empty new-professor state. SR: pending heading is span; identical "Aprovar" names; initials read aloud. 20+ students: unbounded lists, no bulk approve.
