---
target: Agendar aula (aluno)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-29T02-34-09Z
slug: src-pages-student-agendar-tsx
---
# Critique 1: Agendar aula (src/pages/student/Agendar.tsx)
Method: dual-agent; /dev/amostras "Agendar aula (aluno)" (2 frames: 6 to book / 0 to book). Detector CLI + overlay.

## Heuristics: 24/40 (Acceptable)
1 Status 2 (opens on an empty day; after confirming only a generic toast) | 2 Real world 2 ("crédito(s) disponível(is)" vs decided "restantes") | 3 Control 3 | 4 Consistency 2 (old scrolling day strip; no Hoje/Amanhã; hex colours) | 5 Error prevention 1 (0 to book: slots still selectable, fails only after Confirmar) | 6 Recognition 2 (no day shows it has slots) | 7 Efficiency 3 | 8 Minimalist 3 | 9 Recovery 3 (RPC codes translated) | 10 Help 3
Cognitive load failures: 4/8 (working memory — hunting days; empty opening view; number mismatch with Home; no "what happens next").

## Open question (DB fact, must be checked before copy changes)
Repo 0025 schedule_booking inserts 'scheduled'; the app has an approval flow for pending_confirmation and supabase/README.md:83 lists this as unknown. Something outside the repo (trigger) may set pending. Check pg_get_functiondef + triggers on bookings.

## Specificity
Tokens, Bebas title, red selection — generic booking screen; the day strip is the pre-redesign version.
Detector: CLI 0; hex bg-[#141414] border-[#222] :175. Overlay: nested-cards FP (gallery frame), dark-glow on EmptyState "Ver próximo dia" (red glow spent on a navigation shortcut).
Measured: opens on day-after-tomorrow (useState(1) with days starting tomorrow) — empty in sample; 5 of 7 days visible (strip scrolls); weekday 11px, slot sublabel 11.5px; selected-day weekday 3.51 FAIL; "Selecionado" 3.51 FAIL; "Sem vaga" 1.67/2.05; no focus-visible on back, days, slots; slots lack aria-pressed; selection not announced; with 0 credits slots selectable. Fixed confirm bar possibly positioned against .page-container (animation transform) instead of the viewport — to confirm in real app.

## Priority issues
- [P1] Opens on the day after tomorrow (:48) — often empty. Fix: first day with a free slot (fallback tomorrow). -> clarify
- [P1] 0 to book: grid still active; error only after Confirmar. Fix: EmptyState "Todas as suas aulas já estão agendadas" + "Pedir mais aulas". -> harden
- [P1] After confirming: generic "Aula agendada!", no day/time, no "aguardando o professor" (if pending). -> clarify (depends on DB answer)
- [P2] Day strip: no availability marks, scrolls, no Hoje/Amanhã, "Ver próximo dia" loops blindly. Fix: redesigned strip like the Agenda (7 fit, dot on days with free slots, jump to next day with slots). -> layout
- [P2] Vocabulary: "crédito(s) disponível(is)" -> "Você pode agendar mais N aulas". -> clarify
- [P3] hex colours; 11/11.5px text; contrast fails (selected weekday, "Selecionado", "Sem vaga"); focus rings; aria-pressed on slots; aria-live for the confirm bar; EmptyState CTA red glow -> secondary; heading "Horários livres" lists full slots too; confirm bar positioning. -> polish

## Personas
Jordan: lands on an empty day, reads "O professor não abriu disponibilidade" as nothing to book. Casey: scrolling strip, easy to misread date; confirm bar appears without cue. Sam: no focus rings, slots without aria-pressed, confirm bar not announced.
