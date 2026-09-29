---
target: as barras de navegação de baixo
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-29T22-00-00Z
slug: src-components-bottomnav
---
Method: dual-agent (A: af3bed9c8480035b8 · B: a33adf87fad26e16a)

# Crítica: barras de navegação de baixo (aluno e professor) — 25/40

Heurísticas: 1=2, 2=3, 3=3, 4=2, 5=3, 6=2, 7=2, 8=3, 9=3, 10=2.

Arquivos: `src/components/StudentBottomNav.tsx`, `src/components/AdminBottomNav.tsx`, montadas em `src/layouts/StudentLayout.tsx` / `AdminLayout.tsx`. Detector: 0 achados. Sem amostra na galeria (as barras vivem nos layouts).

## Medições (cálculo)
- Aba ativa `--nav-active` 6,24:1; inativa do aluno 6,58:1; **inativa do professor (`muted-foreground/70`) 3,81:1** (pior caso 3,39:1); contador branco sobre `bg-primary` 4,80:1.
- Largura por aba: professor (6 abas) 58,2px em 375px / 49,0px em 320px; aluno (4) 83,8px / 70px; aluno em Recorrência (3) 113px / 94,7px.
- Textos <12px: rótulo do professor `text-[9.5px]`, contador `text-[10px]`. Nenhum `focus-visible` nos NavLink. Sem `env(safe-area-inset-bottom)` (há `viewport-fit=cover`).

## Rotas sem aba ativa (NavLink casa por prefixo)
- Aluno: `/app/aula/:id`, `/app/pacotes`, `/app/perfil-lutador*` (+ `/app/agendar` em Recorrência).
- Professor: `/admin/aula/:id`, `/admin/pacotes`, `/admin/disponibilidade`, `/admin/orientacoes`, `/admin/perfil-alunos`, `/admin/configuracoes`. (`/admin/alunos/*` já casa por prefixo: o caso especial da l.43 é redundante.)

## Fatos do contador de Pedidos
`getPurchaseRequests` (api.ts ~1708) conta `purchase_requests` pendentes do professor (`data.length`); NÃO conta pedidos de remarcação (`bookings.pending_confirmation` com antecessor). `refetchInterval: 15000` dentro de `AdminBottomNav` (roda em toda tela do professor); a consulta faz 3–4 requisições por ciclo (pedidos, alunos, modelos, pacotes ativos, + `saldo_pacotes`). Cache compartilhado com `Pedidos.tsx`.

## Prioridades
- [P1] Professor: 6 abas, rótulo 9,5px, inativa a 3,81:1.
- [P1] Nenhuma aba acende nas telas de segundo nível.
- [P1] Sem foco visível; estado ativo só por cor.
- [P2] Contador: conta pouco, consulta demais, sem texto para leitor de tela, sem teto (`aria-label={label}` sobrescreve o conteúdo).
- [P2] Área segura do iPhone e teclado virtual.
- [P3] "Conta" esconde Disponibilidade/Pacotes/Configurações/Perfil dos alunos; "Aulas" com dois sentidos.

Menores: blur `backdrop-blur-xl`; "Agendar" aparece e some enquanto o modo carrega; ícones 21px x 20px; `staleTime: Infinity` no modo.

## Perguntas
"Pedidos" precisa de uma aba se já está no sino e no Painel? "Conta" é conta ou é o trabalho do professor?
