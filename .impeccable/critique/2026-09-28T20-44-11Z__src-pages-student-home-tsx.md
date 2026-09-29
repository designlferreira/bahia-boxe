---
target: Home do aluno
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-28T20-44-11Z
slug: src-pages-student-home-tsx
---
# Critique 3: Home do aluno (src/pages/student/Home.tsx)
Method: dual-agent; both saw /dev/amostras (9 states + 4 Perfil de Boxe states; frames ~327px wide, small phone). Detector CLI + overlay.

## Heuristics: 25/40 (Acceptable) — history 23 -> 25 -> 25
1 Status 3 | 2 Real world 3 | 3 Control 2 | 4 Consistency 3 | 5 Error prevention 3 | 6 Recognition 3 | 7 Efficiency 2 | 8 Minimalist 2 | 9 Error recovery 2 | 10 Help 2
Cognitive load failures: 3/8. Fixes landed (state ladder called exceptional, balance card color semantics, a11y); new surfaces (suggestion card, profile card) introduced new issues.

## Specificity
Top half now product-specific (balance card with pips/tone/summary). Lower half = stack of similar card-dark rows (next class, profile card, install banner).
Detector: CLI 0; overlay 46 (22 nested-cards FP from gallery frame; 17 thin-border-wide-shadow on card-dark, cosmetic; 5 dark-glow spec'd; 1 cramped-padding FP; 1 truncation deliberate). Contrast all AA; used pip 3.05:1 on flat card, ~2.8:1 on tinted gradient corner. No Home text <12px.

## Priority issues
- [P1] Suggestion card buttons overflow (nowrap, two flex-1) at 285px content; projected overflow at 360px phones. Fix: stack under ~380px or full-width accept + text link. -> adapt
- [P1] Suggestion state: 233px card pushes red CTA under nav; two filled CTAs. Fix: suggestion becomes sole primary action; add decline + undo. -> distill
- [P2] First-run / no-package / recurrence-without-package leads with grey 0 + three absence messages; recurrence w/o package has no action. Fix: welcome/explainer block instead of numeric card. -> onboard
- [P2] Perfil de Boxe card taller than next-class card at narrow width; English archetype names. Fix: single-line row, pt-BR gloss, maybe show after first class. -> quieter
- [P3] Vocabulary: restantes/disponíveis, usadas/feitas, "aguardando reposição". -> clarify

## Personas
60+: English archetypes, unexplained "Pendente", 13px greeting. Invitee: grey 0 + absence. One-handed: CTA under nav in suggestion state. SR: above average; balance card has no heading.

## Minor
"não lida(s)"; partial query failure takes down whole Home; tablet column fine but empty.
