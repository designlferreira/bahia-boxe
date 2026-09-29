---
target: Minha conta (aluno)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-29T14-32-57Z
slug: src-pages-student-minhaconta-tsx
---
Method: dual-agent (A: design review · B: detector + medições)

# Crítica: Minha conta (aluno) — 21/40

Notas: 1:2 2:2 3:3 4:2 5:3 6:2 7:2 8:3 9:1 10:1. Detector: 0 achados.

## Problemas prioritários
- [P1] Rótulos confusos: "Editar perfil" (só o nome) vs "Perfil físico e de boxe" vs "Perfil de Boxe" da Home; nenhum caminho para o resultado do Perfil de Boxe.
- [P1] Falta o que é do aluno: e-mail da conta, "Falar com o professor" (WhatsApp), pacote e pedidos.
- [P2] "Aluna" fixo para todos os alunos; "desde 29 set" sem ano.
- [P2] Editar perfil: updateProfileName sem onError, sem Enter para salvar, sem limite, botão apagado sem motivo.
- [P2] "Sair da conta" é o elemento mais forte da tela (vermelho, largura total), enquanto a ação frequente (falar com o professor) não existe.
- [P3] Banner de instalar nunca aparece no iOS/Safari sem instrução; primeira linha sem ícone (texto 27px desalinhado); h1 à mão sem PageHeader; linhas sem foco visível; bordas 1,1-1,5:1; profile nulo = tela vazia.
