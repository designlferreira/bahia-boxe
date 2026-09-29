---
target: o Perfil dos alunos
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-29T21-15-00Z
slug: src-pages-admin-perfilalunos-tsx
---
Method: dual-agent (A: a7c116b59739152f6 · B: a0f5b0db2fc7237f6)

# Crítica: Perfil dos alunos (professor) — 19/40

Heurísticas: 1=2, 2=2, 3=3, 4=3, 5=1, 6=3, 7=1, 8=2, 9=1, 10=1.

Panorama: painel de estatística descritiva em cartões idênticos, sem decisão do professor associada. Detector: 0 achados. Sem amostra na galeria; medições por código e tokens (contrastes ok, 6,1–12,4:1; textos <12px: `text-[11.5px]` x2 e `text-[10.5px]`).

## FATOS DE DADOS (lidos nas migrations e no código, NÃO no banco real)
- `getStudentProfileStats` (api.ts ~2556) baixa `select("*")` de `student_profiles` de TODOS os alunos do professor e agrega NO CLIENTE; não há RPC/view de agregados.
- `0004_student_profiles.sql` cria `student_profiles_admin_select`: o professor pode LER a linha individual de cada aluno seu (o dado individual chega ao aparelho dele; nenhuma tela o mostra).
- Não há mínimo de amostra: com 1 preenchido, média = mín = máx = o valor dele e a barra diz "100% · 1"; com 2, os dois valores ficam expostos; com 3, o terceiro se deduz por média×3 − mín − máx.
- Denominadores diferentes: "N de M preencheram" usa TODOS os alunos; as % das barras usam só quem preencheu.

## Prioridades
- [P0] A promessa ao aluno ("Seu professor vê só médias e contagens do conjunto dos alunos, não os seus números", `student/Perfil.tsx` l.188) é falsa com poucos alunos e o banco não a garante.
- [P1] A falha da consulta vira uma linha de texto vermelho solto (sem `ErrorState`, sem retry, sem `role=alert`).
- [P1] A tela não serve a nenhuma decisão (sem faixas, sem envergadura, sem tradução das guardas).
- [P2] "Ninguém preencheu ainda" repetido em 5 cartões; sem ação.
- [P2] Textos <12px, barra dourada (dourado = ação positiva), `foreground/85`, decimais com ponto, esqueleto de 280px.
- [P3] Caminho de chegada enterrado em Minha conta; nome parece lista de alunos.

## Perguntas
Qual N torna a promessa verdadeira? A promessa é da interface ou do produto (agregar no servidor)?
