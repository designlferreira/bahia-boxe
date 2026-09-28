---
target: Home do aluno
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-28T21-30-29Z
slug: src-pages-student-home-tsx
---
# Critique 6: Home do aluno (src/pages/student/Home.tsx)
Method: dual-agent; /dev/amostras (10 states, frames ~327px). Detector CLI + overlay.

## Heuristics: 27/40 — history 23 -> 25 -> 25 -> 27 -> 26 -> 27
1 Status 3 | 2 Real world 3 | 3 Control 2 | 4 Consistency 3 | 5 Error prevention 3 | 6 Recognition 3 | 7 Efficiency 2 | 8 Minimalist 3 | 9 Error recovery 3 | 10 Help 2
Cognitive load failures: 2/8 (working memory: restantes vs livres + unlabeled pips; single focus in amber-heavy states).

## Specificity
Behaviour very specific (10 states, one verb, Hoje/Amanhã, pips, stepper, quiet CTA on suggestion); not AI slop. Visual form still generic dark fitness card stack.
Detector: CLI 0; overlay 30 (20 nested-cards FP gallery frame; 5 dark-glow spec'd; 4 thin-border-wide-shadow card-dark; 1 deliberate truncation). Contrast AA; used pip 3.05 flat, 2.77/2.79 on gold/amber tint (fail). No text <12px; only deliberate negative-margin tap targets.

## Priority issues
- [P1] Pip meter unlabeled; actionable number ("6 livres") is 14px muted under 56px "restantes". Fix: swatches in summary, 15–16px summary. (Tension with critique 2 which asked for "restantes" as headline.) -> clarify
- [P1] "Escolher outro horário" declines before a replacement exists; no toast/undo. Fix: carry suggestion to Agendar, decline on successful new booking; or toast with Desfazer. -> harden
- [P2] Amber overloaded (low balance card vs "pending/decide"); "Tudo agendado" all amber with nothing to decide. Fix: gold card + amber only on alert/number; no low tone when everything is booked. -> colorize
- [P2] Type small for 60+ where answers live (summary/hint 14px, badge/nav 12px, greeting 13px). Fix: 15–16px floor for answer lines. -> typeset
- [P3] Finished package reads as failure (grey 0). Fix: "4 aulas treinadas", gold pips/check. -> delight

## Personas
One-handed: suggestion state pushes quiet CTA under nav (acceptable). Invitee: trial + dashed box + CTA say "book" 3 ways; no heads-up that screen changes after trial. SR: h1 = name; decline has no spoken confirmation. 60+: small type, pip legend, red "RECUSAR" dialog feels dangerous.

## Minor
Dashed box repeats in trial/poucas aulas; first name instead of full caps name; "não lida(s)"; profile card skeleton height mismatch; decline has no toast (accept does); "remarcar com o professor" references a channel the app lacks (deferred).
