---
target: Configurações (professor)
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-29T12-35-05Z
slug: src-pages-admin-configuracoes-tsx
---
Method: dual-agent (A: design review, só leitura de código (navegador negou o acesso) · B: detector + medições)

# Crítica: Configurações (professor) — 18/40

Notas: 1:2 2:2 3:2 4:1 5:1 6:2 7:3 8:2 9:1 10:2. Detector: 0 achados.

## Problemas prioritários
- [P1] Trocar o modo de agendamento salva na hora, sem confirmação e sem dizer o que o aluno passa a ver.
- [P1] Switch da falta e botões de modo sem onError (falha silenciosa); switch mostra true como padrão se a busca falha.
- [P2] IA: modo (decisão mais impactante) em 3º; sem títulos de seção; Orientações no topo com outro visual.
- [P2] "Falta consome crédito" contradiz "aulas restantes"; jargão "migra dados", "fluxo".
- [P3] Botões de modo 40px, sem foco visível, sem role group; texto 11,5px a 4,33:1; Orientações sem foco e ícones sem aria-hidden; padrão de salvar inconsistente (auto x botão); erro do WhatsApp sem role alert.
