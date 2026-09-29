---
target: a tela 404
total_score: 15
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-29T22-45-00Z
slug: src-pages-notfound-tsx
---
Method: dual-agent (A: ad446d4d59f1f4493 · B: ac205b7300a07d0ac)

# Crítica: tela 404 — 15/40

Heurísticas: 1=2, 2=1, 3=1, 4=2, 5=2, 6=2, 7=2, 8=2, 9=1, 10=0.

Arquivo: `src/pages/NotFound.tsx` (h1 "404", "Essa página não existe ou foi movida.", botão "Voltar ao início" → `/`). Detector: 0 achados. Sem amostra na galeria (medido montando o componente real isolado: contrastes 4,8–17,9:1, botão 52px, sem rolagem em 320/375px; anel de foco vermelho encostado no botão vermelho).

## FATOS (código e configuração)
- Sem `navigateFallback`/`workbox`: o service worker gerado (`NavigationRoute` para `index.html`) e o `vercel.json` (rewrite `/(.*)` → `/index.html`) devolvem o app para QUALQUER endereço; a 404 é só da SPA (status 200), online e offline.
- A rota `*` fica fora de qualquer layout/`ProtectedRoute`: sem barra de navegação, mesmo logado. `document.title` sempre "Bahia Boxe" (nenhuma tela define título).
- `ProtectedRoute`: papel errado redireciona em silêncio para a home do papel (nunca cai na 404); `loading` → `null` (tela vazia, sem esqueleto).
- **`PostLoginRedirect` (App.tsx l.52-56) NÃO consulta `loading`:** ao abrir `/` (`start_url` do PWA) já logado, `profile` ainda é null e ele manda para `/login`; `Login.tsx` l.31 só redireciona quando `profile` existe: o formulário de login PISCA a cada abertura.
- Sem `.env` local o `AuthProvider` lança `Supabase não configurado` e NÃO há error boundary: qualquer rota fica em branco (`#root` vazio).

## Prioridades
- [P1] Texto e botão de desenvolvedor: "404", causa enigmática, "Voltar ao início" depende da sessão; sem "Voltar" ao lugar de origem (no PWA não há barra de endereço).
- [P2] Flash do formulário de login na abertura do app (`PostLoginRedirect`/`Login` sem `loading`; rotas protegidas em branco enquanto carregam).
- [P2] Endereço do outro papel redireciona sem aviso.
- [P3] Sem marca "BAHIA BOXE", sem título próprio da aba, anel de foco pouco visível; sem ajuda (WhatsApp do professor exige login).

Menores: `text-sm` (14px) vs 13,5px das telas de estado; sem `document.title` em nenhuma tela; sem error boundary.

## Perguntas
Logado, uma tela sem barra de navegação faz sentido? Em PWA, rota desconhecida deveria ir para a Home com aviso?
