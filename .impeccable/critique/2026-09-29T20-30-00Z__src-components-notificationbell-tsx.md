---
target: o sino de notificações
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-09-29T20-30-00Z
slug: src-components-notificationbell-tsx
---
Method: dual-agent (A: a23321ef73f2fb18e · B: a397c4e9d4acdf718)

# Crítica: sino de notificações (aluno e professor) — 22/40

Heurísticas: 1=2, 2=2, 3=3, 4=2, 5=2, 6=3, 7=2, 8=3, 9=1, 10=2.

Fatos: não existe tabela de notificações (tudo derivado em `deriveNotifications`, api.ts ~2211); "lida" e "limpa" vivem em `localStorage` (`bb.notifications.<userId>`), por aparelho; "Limpar central" só esconde ids neste aparelho; para o aluno, notificação = estado atual (toda aula futura `scheduled` gera "Aula confirmada"), então um aluno de recorrência pode ver 12 "Nova" de uma vez. Detector: 0 achados. Sem amostra do sino aberto/com itens na galeria (medido com item injetado). Contrastes de texto e ícones ok (4,6–16,6:1); contador 10,5px < 12px.

## Prioridades
- [P1] Consulta com falha ou carregando parece "Nenhuma notificação" (`useQuery` só lê `data`).
- [P1] Nenhuma mutation tem `onError`; `openNotif` só navega no `onSuccess`; "Desfazer" sem `try/catch`; sem travar duplo toque.
- [P1] "Limpar central" promete o que não faz (só esconde neste aparelho); "central" fora do vocabulário; confirmação redundante com o desfazer; `toast.warning` (âmbar) para ação normal.
- [P1] "Aula confirmada" vira ruído (recorrência), com a hora da criação e sem dizer qual aula.
- [P2] Sem `ul/li`; itens e botão Fechar sem anel de foco; ícones sem `aria-hidden`; "Nova" só visual; "Marcar todas" sempre ativo; "{n} não lida(s)".
- [P2] Contador 10,5px, sem "99+".
- [P3] Folha sem descrição; estado vazio fala ao professor; aviso do professor sem nome do aluno; "Toque para ver os detalhes." genérico.

## Perguntas
Por que "aula confirmada" é notificação? "Lido até" no servidor?
