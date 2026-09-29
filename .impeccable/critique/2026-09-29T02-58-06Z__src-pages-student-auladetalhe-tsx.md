---
target: Detalhe da aula (aluno)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-29T02-58-06Z
slug: src-pages-student-auladetalhe-tsx
---
# Critique 1: Detalhe da aula — aluno (src/pages/student/AulaDetalhe.tsx)
Method: dual-agent; /dev/amostras "Detalhe da aula (aluno)" (4 frames). Detector CLI + overlay.

## Heuristics: 25/40
1 Status 2 (pending request: badge still "Agendada", news below the fold) | 2 Real world 3 | 3 Control 3 ("Cancelar pedido" no confirm) | 4 Consistency 2 (suggestion screen hex/red; <24h WhatsApp only for recurrence) | 5 Error prevention 2 (cancelable ignores 6h — error after confirming) | 6 Recognition 3 | 7 Efficiency 3 | 8 Minimalist 2 (completed class still shows arrival/equipment/address) | 9 Recovery 3 | 10 Help 2 (recurrence cancel dialog hides consequence)

## Evidence
CLI 0. Grep: hex bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] :144, bg-[#2E2A1A] :156; 11/11.5px labels (:134,145,204,212,239,244,253,260). No h2 section headings; "Ver no mapa" without focus-visible; decorative icons without aria-hidden. Student Cancelar passes (6.5). Actions ~650px down on a phone.

## Priority issues
- [P1] Cancel button shown when it will fail (<6h). Fix: disable/replace with "Faltam menos de 6 horas — fale com o professor" + WhatsApp (also autosserviço).
- [P1] Recurrence cancel dialog doesn't say if it consumes a class. Fix: rule from the student's own package (falta_consome_credito).
- [P2] Page doesn't adapt to state: pending → "Aguardando o professor" badge + request card on top; past → teacher note first, hide logistics.
- [P2] Hex colours on suggestion screen → tokens.
- [P3] RemarcacaoSheet error without retry; dots on days with free hours; 11px labels; aria-hidden icons; "Ver no mapa" new tab notice; section headings as h2.
