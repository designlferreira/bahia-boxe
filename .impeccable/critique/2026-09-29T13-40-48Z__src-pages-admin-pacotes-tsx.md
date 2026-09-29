---
target: Pacotes (modelos, professor)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-29T13-40-48Z
slug: src-pages-admin-pacotes-tsx
---
Method: dual-agent (A: design review · B: detector + medições)

# Crítica: Pacotes (modelos, professor) — 19/40

Notas: 1:2 2:2 3:2 4:2 5:1 6:3 7:2 8:3 9:1 10:1. Detector: 0 achados.

## Problemas prioritários
- [P1] "Validade (dias)" promete algo que o sistema não faz: validity_days não é copiado para o pacote, nada o aplica e o aluno nunca o vê.
- [P1] Remover sem Desfazer e sem onError (falha silenciosa); é exclusão lógica (is_active=false), então é reversível.
- [P2] Formulário aceita 0, negativo, vazio e decimal em aulas/validade; sem aviso de que editar preço vale para os próximos pedidos.
- [P2] Cartão sem contexto (aulas, pedidos pendentes) e sem ocultar/reativar.
- [P3] Sem PageHeader/voltar, nomes iguais nos botões, sem foco, borda 1,4:1, coluna de texto de 139px.
