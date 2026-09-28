---
target: Home do aluno
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-28T19-24-41Z
slug: src-pages-student-home-tsx
---
# Critique: Home do aluno (src/pages/student/Home.tsx)
Method: dual-agent; source-only (browser blocked: login on real Supabase, no test credentials).

## Heuristics: 23/40 (Acceptable)
1 Status 2 | 2 Real world 2 | 3 Control 3 | 4 Consistency 2 | 5 Error prevention 2 | 6 Recognition 3 | 7 Efficiency 3 | 8 Minimalist 2 | 9 Error recovery 2 | 10 Help 2

## Specificity
Partly authored (gold ledger card, Bebas date tile, "Bom treino"); rest is a generic booking stack. Red spent on perpetual pulse. Detector: 0 findings (low rule coverage for this Tailwind/HSL style; missed hardcoded hex in ActivePackageCard.tsx:44). Contrast: primary-as-text 3.9:1 bg / 3.6:1 card (fails AA small text); muted-foreground 6.6:1 OK; inactive nav muted/70 ~3.8:1 fails.

## Priority issues
- [P1] Zero/low balance lies and repeats: credits===0 => "Seu pacote acabou" even when last class booked or never had a package; card shows gold 0 + "Sem pacote ativo" + "poucas aulas" alert (lowCredits true with pkg null, ActivePackageCard.tsx:41); no pending-request state. Fix: 4 states, suppress alert without pkg, muted 0. -> clarify, harden
- [P1] Competing focal points: infinite animate-bb-pulse on CTA (Home.tsx:130) vs 56px gold numeral; no global prefers-reduced-motion. -> quieter
- [P2] Balance card mixes used-bar with remaining-number, duplicate label/unit, origin badge + "aula(s)" admin vocabulary, hardcoded colors. -> distill
- [P2] Recurrence empty-state copy "Escolha um horário livre do professor." (Home.tsx:124) contradicts mode; CTA label flips before modoEfetivo resolves. -> clarify
- [P2] A11y: "Agendada" badge primary-on-primary/20 at 11px ~3:1; nav labels ~3.8:1 at 10.5px; next-class button reads date twice; "PRÓXIMA AULA" not a heading; bell omits unread count. -> audit, harden

## Personas
Older student: reassurance text smallest (10.5-12.5px), abbreviated dates, arithmetic bar, pulsing red alarm. New invitee: first screen says 0 / sem pacote / poucas aulas / acabou; "Experimental" unexplained. One-handed: bell far, 450ms entrance delay, suggestion banner layout shift. Screen reader: no h2s, bare "5", no aria-busy.

## Minor
rounded-[20px] off scale; off-4 spacing; template name vs reposição collide at 375px; next-class card repeats date.

## Questions
Card carries state instead of CTA shouting? Swap dominant element by mode? Classes as "rounds" pips?
