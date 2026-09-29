---
target: Home do aluno
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-28T20-57-35Z
slug: src-pages-student-home-tsx
---
# Critique 4: Home do aluno (src/pages/student/Home.tsx)
Method: dual-agent; /dev/amostras (frames ~325px). Detector CLI + overlay.

## Heuristics: 27/40 (Acceptable, edge of Good) — history 23 -> 25 -> 25 -> 27
1 Status 3 | 2 Real world 3 | 3 Control 3 | 4 Consistency 3 | 5 Error prevention 3 | 6 Recognition 2 | 7 Efficiency 3 | 8 Minimalist 2 | 9 Error recovery 3 | 10 Help 2
Cognitive load failures: 3/8 (working memory: 7 restantes vs 6 para agendar; progressive disclosure: ledger line always visible; feedback: trial amber, bare "Pendente").

## Specificity
Logic specific (pips, state-driven CTA, Como funciona stepper, copy); visual form generic dark card stack.
Detector: CLI 0; overlay 28 elements (18 nested-cards FP gallery frame; 5 dark-glow spec'd; 4 thin-border-wide-shadow card-dark; cramped-padding FP; truncation FP). Contrast AA; used pip 3.05 flat / 2.77 on gold gradient start (fails 3:1). No text <12px; no real overflow ("Detalhes" negative margin stays within card padding).

## Priority issues
- [P1] REGRESSION (confirmed): finished package -> activePackageForStudentRow returns only active -> data.package null -> semPacote -> veteran sees newcomer "Como funciona"; "Solicitar novo pacote / acabaram" branch unreachable. Gallery "Pacote acabou" fixture unrealistic (active with 0 left). Fix: return last package / hadPackage flag; "Seu pacote de N aulas terminou" state. -> clarify/harden
- [P1] Low-balance alert says "considere renovar" with no route to Pacotes for students (no nav tab). Fix: link "Pedir mais aulas" or change copy. -> clarify
- [P2] Trial class painted amber "low" (tone ignores origin trial) — first screen of most invitees. Fix: exclude trial from low tone; trial copy. -> colorize
- [P2] Number overload (7 restantes vs "3 usadas · 1 agendada · 6 para agendar") + redundant zero-state messages + hints echoing labels. -> distill
- [P3] Install banner above balance card pushes CTA toward nav. -> layout

## Personas
One-handed: accept has no undo; nav lacks safe-area inset. Invitee: trial amber, no "book your free class". SR: balance section has no heading; suggestion title not a heading. 60+: gold vs amber ~7° hue apart; long names wrap in Bebas.

## Minor
" " placeholder; no end time on next class; "não lida(s)"; profile skeleton 92 vs 99px; one-off amber button styling.
