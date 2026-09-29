---
target: Detalhe do aluno (professor)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-29T15-20-58Z
slug: src-pages-admin-alunodetalhe-tsx
---
Method: dual-agent (A: design review · B: detector + medições)

# Crítica: Detalhe do aluno (professor) — 20/40

Notas: 1:3 2:2 3:1 4:2 5:1 6:2 7:2 8:3 9:2 10:2. Detector: 0 achados.

## Problemas prioritários
- [P0] Atribuir pacote: um toque num modelo cria o pacote novo e ENCERRA o ativo, sem confirmação nem aviso (vale também para aula avulsa e para pacote de recorrência).
- [P1] Falta contato (WhatsApp/e-mail) e "próxima aula" no topo.
- [P1] "Últimas aulas" mente (com recorrência são futuras) e as linhas não abrem a aula.
- [P2] "Remover pacote": texto "Créditos restantes serão perdidos" impreciso (não diz quantas, nem que as aulas marcadas continuam); ação rara em destaque vermelho.
- [P2] Aluno novo lê como alarme (0%, 0, sem pacote); rótulos de 11px.
- [P3] Sheet sem carregando/erro/vazio; foco visível; bordas 1,4:1; botão Remover do diálogo 3,78:1.
