---
target: Histórico (professor)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-29T14-47-52Z
slug: src-pages-admin-historico-tsx
---
Method: dual-agent (A: design review, sobre código e amostra parcialmente quebrada · B: detector + medições com dados simulados)

# Crítica: Histórico (professor) — 20/40

Notas: 1:2 2:2 3:2 4:2 5:3 6:2 7:1 8:2 9:3 10:1. Detector: 0 achados.

## Problemas prioritários
- [P0] Busca e filtros só enxergam as 200 aulas mais recentes (limit(200) e filtro no cliente); aulas futuras entram na conta e empurram o passado; sem aviso de corte.
- [P1] Aula passada sem registro aparece como "Agendada" (StatusBadge tem semRegistro; o Histórico não passa).
- [P1] Sem agrupamento por dia/mês; futuro misturado ao passado; título "HISTÓRICO" x menu "Aulas".
- [P2] Filtros incompletos (Pendente, Remarcadas, Recusadas, Sem registro); busca a cada tecla; campo sem label; chips 36px, sem aria-pressed, "Agendadas" fora da tela; bordas 1,07-1,48:1.
- [P3] Cartão sem contexto (motivo do cancelamento, de→para); nome longo espreme; vazio igual para "sem aulas" e "sem resultado".
