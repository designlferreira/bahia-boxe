---
target: Painel do professor
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-28T22-39-12Z
slug: src-pages-admin-dashboard-tsx
---
# Critique 2: Painel do professor (src/pages/admin/Dashboard.tsx)
Method: dual-agent; /dev/amostras "Painel do professor" (4 states, frames ~373px). Detector CLI + overlay.

## Heuristics: 27/40 (Acceptable, up from 20)
1 Status 3 | 2 Real world 3 | 3 Control 3 | 4 Consistency 2 | 5 Error prevention 3 | 6 Recognition 3 | 7 Efficiency 2 | 8 Minimalist 3 | 9 Error recovery 3 | 10 Help 2
Cognitive load failures: 3/8 (single focus: Resolver panel above hero; choices: 4 hue meanings + ~12 tappables before hero on busy day; working memory: Aconteceu dialog doesn't name student/time).

## Specificity
Authored for the product: Aconteceu/Faltou, live countdown "Próxima · em 40 min", struck-through remarcação, "Dia livre", em-risco reasons. Previous P0/P1s resolved; hero above fold on busy day with groups collapsed.
Detector: CLI 0. Overlay 13 in dashboard frames: dark-glow x4 (spec'd red glow, kept by Lucas), card-dark thin-border-wide-shadow x4 (system utility), true nested card = "Próxima" block inside Hoje card; "Próxima aula" panel borderline; Resolver/Comece nested flags FP (row dividers). No text <12px, all targets >=44px, no overflow, all contrast AA (lowest muted on bg-secondary 5.31).

## Priority issues (verified: useLessonActions.tsx:50/:153 reads profiles.no_show_consumes_class; package has faltaConsomeCredito; Alunos.tsx has no risk filter)
- [P1] No-show/complete dialogs can state the wrong credit consequence for recurrence packages (package snapshot falta_consome_credito governs, dialog reads professor default); dialogs don't name student/time. -> clarify/harden
- [P1] Logging a class = 3 taps with a redundant confirm (undo toast exists); legalistic copy "você estará declarando…", generic toast. -> distill
- [P2] "Ver todos (N)" em risco lands on unfiltered /admin/alunos. -> clarify
- [P2] Hierarchy/colour: Resolver above Hoje; red glowing Aprovar per item; gold used for future times and "Concluída"; nested "Próxima" card. -> layout/quieter
- [P3] Date capitalisation ("terça, 29 set" vs "Domingo, 27 set"); vocabulary shift Aconteceu -> CONCLUIR AULA -> "concluída com sucesso"; SR reads remarcação without "de"; em-risco/Agenda completa buttons lack explicit focus ring; groups re-collapse after each action. -> polish

## Personas
Alex: 3 taps per class, no bulk "todas aconteceram", groups reset. Sam: remarcação "de" missing, focus rings default only, Resolver landmark 13px. Professor between classes: expanding both groups pushes hero ~780px down.
