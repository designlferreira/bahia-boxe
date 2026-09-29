---
target: Recorrência do aluno (professor)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-29T04-00-56Z
slug: src-pages-admin-alunorecorrencia-tsx
---
Method: dual-agent (A: design review · B: detector + medições)

# Crítica: Recorrência do aluno (professor) — 19/40

Nota: Aceitável. Detector: 0 achados. Medições reais no navegador (375px).

## Heurísticas
1 Visibilidade 2 · 2 Linguagem 1 · 3 Controle 2 · 4 Consistência 2 · 5 Prevenção de erro 2 · 6 Reconhecimento 2 · 7 Eficiência 2 · 8 Minimalismo 3 · 9 Recuperação de erro 2 · 10 Ajuda 1.

## Especificidade
Genérica: lista de cartões + Switch + formulário, com vocabulário de tabela do banco ("materializa aulas concretas"). Sem visão semanal.

## Problemas prioritários
- [P1] O efeito de "Gerar" (cancelar N aulas, sem desfazer) só aparece depois do toque; o botão vermelho é a ação de maior risco e não mostra o impacto. Fix: resumo sempre visível acima do botão (o que cria, o que cancela, datas) e botão que diz "Gerar 8 e cancelar 5".
- [P1] Em Autosserviço o botão parece ativo (vermelho a 50%) e o motivo fica embaixo, 12px, sem ligação para leitor de tela nem link para Configurações. Fix: aviso acima do botão + "Abrir Configurações".
- [P2] Jargão: "Materializa aulas concretas", "recorrência" vs "dias fixos", "Começa em". Mesma coisa com 3 nomes (título, toast, exclusão, sheet).
- [P2] Desativar/excluir sem explicar o efeito (não muda aulas já geradas); aviso 11px repetido em cada cartão; nada de "onde ver as aulas" depois de gerar.
- [P2] Acessibilidade: 3 Switches "Alternar recorrência" e lixeiras "Excluir recorrência" idênticos; lixeira 36x36; chips sem aria-pressed; chip de data selecionado 3,25:1; lixeira de linha inativa 2,0:1; textos 11px; foco do Switch/lixeira/chips não confirmado.
- [P3] Sem campo com teto no número de aulas (aceita 999, não deixa apagar); 24 horas incluindo madrugada; estado "Primeira vez" mostra cartão de gerar desabilitado em vez de convite para adicionar o primeiro horário.

## Personas
Jordan: não entende "materializa"; gera sem saber que cancela 5 aulas; depois não sabe onde ver. Sam: switches indistinguíveis, lixeira sem motivo programático. Casey: 16 chips de data em rolagem, lixeira 36px ao lado do switch.

## Perguntas
Cadastrar dias e gerar precisam ser dois passos? O aluno é avisado quando 5 aulas somem e 8 aparecem?
