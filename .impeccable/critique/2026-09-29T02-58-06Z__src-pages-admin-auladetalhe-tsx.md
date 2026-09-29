---
target: Detalhe da aula (professor)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-29T02-58-06Z
slug: src-pages-admin-auladetalhe-tsx
---
# Critique 1: Detalhe da aula — professor (src/pages/admin/AulaDetalhe.tsx)
Method: dual-agent; /dev/amostras "Detalhe da aula (professor)" (3 frames). Detector CLI + overlay.

## Heuristics: 24/40
1 Status 3 (ongoing class shows "Agendada" — agora not passed) | 2 Real world 2 ("crédito" in sheets/toasts; undo dialog "aguardando confirmação") | 3 Control 3 | 4 Consistency 2 (RescheduleSheet chips unlike student sheet; hex) | 5 Error prevention 2 (Remarcar offers every hour 00–23, no free/busy) | 6 Recognition 3 | 7 Efficiency 2 (past class shows 6 actions) | 8 Minimalist 2 | 9 Recovery 2 (raw error.message from reagendar/cancelar) | 10 Help 3

## Evidence
CLI 0. Grep: `!border-destructive/35 !text-destructive` :143 (Cancelar aula 4.0:1 FAIL); text-[11px]/:93, text-[11.5px] :101; RescheduleSheet hex #333/#141414/#262626 and 11.5px. No focus-visible on student chip; sheet chips/cards without focus/aria-pressed. No overflow, targets ≥44.

## Priority issues
- [P1] Pending request (pending_confirmation) detail has no actions (buttons only for scheduled :106) — dead end from a notification. Fix: Aprovar/Recusar via usePendingActions + de → para.
- [P1] RescheduleSheet opens on today at the original hour (often past → disabled, chip off-screen); "hoje em" copy misleading; offers all 24 hours. Fix: next valid day, scroll chip into view, "Atual: …", only free hours 06–22.
- [P2] Past unrecorded: 5 equal actions. Fix: Aconteceu/Faltou first; Remarcar/Cancelar/reposição under "Outras ações" (agenda decision spirit).
- [P2] Cancelar aula contrast 4.0 → variant destructive.
- [P3] openCancelar no busy state while rule loads; "crédito" copy in toasts; formatQuando; agora badge.
