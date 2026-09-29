---
target: Disponibilidade (professor)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-29T12-53-37Z
slug: src-pages-admin-disponibilidade-tsx
---
Method: dual-agent (A: design review · B: detector + medições)

# Crítica: Disponibilidade (professor) — 19/40

Notas: 1:2 2:2 3:3 4:2 5:1 6:2 7:2 8:2 9:1 10:2. Detector: 0 achados.

## Problemas prioritários
- [P0] Salvar e remover horário sem onError; "Desfazer" sem tratamento de erro: falha silenciosa.
- [P1] A tela não sabe do modo Recorrência (grade que nenhum aluno usa) e mostra "alunos podem agendar em N dias".
- [P1] Sheet com 48 chips sem guia: chip selecionado fora da tela, fim <= início só recusa depois de Salvar, madrugada, sem aria-pressed, sem role alert no erro.
- [P2] Sete cartões iguais (2160px), resumo dourado repete a lista, dias vazios repetem a mesma frase.
- [P2] Controles repetidos com o mesmo nome (7 switches, 5 lápis, 5 lixeiras); chips e lápis/lixeira sem foco visível; contrastes: chip selecionado 3,38, "Pausado" 3,02, bordas 1,15-1,57.
- [P3] Copy: "aula(s)", "intervalo(s)", "1 dias", "Toda domingo".
