---
target: a evolução do Perfil de Boxe
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-29T18-40-00Z
slug: src-pages-student-perfillutadorhistorico-tsx
---
Method: dual-agent (A: a73ac7597c77f5fce · B: a669fe47a82afdd37)

# Crítica: Minha evolução (aluno) — 20/40

Heurísticas: 1=2, 2=2, 3=3, 4=2, 5=2, 6=2, 7=1, 8=2, 9=3, 10=1.

Panorama: template genérico de histórico + progresso; a tela não conta ao aluno a decisão de usar só `self` e só `full` no gráfico. Detector: 0 achados. Sem amostra na galeria `/dev/amostras` (a tela nunca foi vista com dados). Medições por leitura de código e tokens (contraste e fontes ok; trilho da barra 1,16:1 e borda do cartão 1,48:1, limites globais do tema).

## Prioridades
- [P1] Gráfico some sem explicação com menos de 2 completas (linha 66).
- [P1] Nenhum próximo passo: sem botão "Nova autoavaliação", nem no estado vazio.
- [P1] Compara notas de fórmulas diferentes (`scoringVersion`) sem aviso.
- [P2] Gráfico ambíguo: uma barra por avaliação sem data; o texto compara só primeira × mais recente.
- [P2] "Mudou de X para Y" não distingue subiu/caiu/igual; queda sem tom de convite.
- [P2] Leitor de tela e foco: `div` em vez de h2/ul/li; cartões-botão sem anel de foco.
- [P3] Texto vermelho fora do `--red-text`; datas sem ano.

## Menores
"Primeira autoavaliação" pode não ser a primeira completa; selo "Mais recente"; ordem da lista não dita; nome do estilo sem `min-w-0`; "dimensão" vs "competência".

## Perguntas
Mostrar a leitura do professor ao longo do tempo? Abrir com uma frase ("subiu mais em Defesa") e o resto como detalhe? Que caminho leva à 2ª avaliação completa quem começou pela rápida?
