---
target: Solicitações (professor)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-29T03-34-00Z
slug: src-pages-admin-pedidos-tsx
---
# Critique 1: Solicitações / Pedidos (src/pages/admin/Pedidos.tsx)
Method: dual-agent; /dev/amostras "Solicitações (professor)" (2 frames). Detector CLI + overlay.

## Heuristics: 20/40
1 Status 2 (no age/context) | 2 Real world 2 (PEDIDOS / Solicitações / "pedidos de aulas") | 3 Control 2 (reject has undo, approve none) | 4 Consistency 2 | 5 Error prevention 2 (loss warning fragile for recurrence) | 6 Recognition 1 (no student context) | 7 Efficiency 3 | 8 Minimalist 3 | 9 Recovery 2 | 10 Help 1
## Evidence
CLI 0. Measured: no <12px, targets ≥44, no overflow, focus ok. FAIL: "Aula avulsa" badge 3.25:1; dialog confirm "Aprovar mesmo assim" 3.78:1; 8 buttons w/o student name in accessible name (4x "Aprovar", 4x "Recusar"); 4 red-glow primaries at once; h1 "PEDIDOS" vs subtitle "Solicitações".
## Priority issues
- [P0] Loss warning misleads for recurrence: uses used_classes (stale after undo; saldo_pacotes is the authority) and in recurrence all classes are already booked and survive — "essas aulas deixam de valer" is wrong/meaningless there. api.ts:1657, Pedidos.tsx:88-98,134-140.
- [P1] Card lacks decision context: age ("há 2 dias" from createdAt, already loaded), student note (notes, loaded not rendered), student balance/package. 
- [P1] Approve/reject asymmetry: reject has confirm + 8s undo; approve (money) has no undo; toasts don't name the student; reject dialog says "O aluno recebe um aviso" without a reason.
- [P2] Double-tap guard coarse: approve.isPending disables all Aprovar, reject not guarded; no per-card busy label. Dashboard count not invalidated on approve/reject.
- [P2] Student notification copy wrong in recurrence ("Suas aulas já estão disponíveis para agendar"); rejection has no WhatsApp.
- [P3] Red-glow x4; badge colours (Aula avulsa red at 3.25:1); Pedidos/Solicitações naming; aria-labels; empty state dead end; no history.
