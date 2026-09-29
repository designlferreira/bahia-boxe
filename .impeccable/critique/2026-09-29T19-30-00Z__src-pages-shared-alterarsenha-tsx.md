---
target: Alterar senha
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-09-29T19-30-00Z
slug: src-pages-shared-alterarsenha-tsx
---
Method: dual-agent (A: ac17665acb7d9ea81 · B: a0b2bd9d67cf8e858)

# Crítica: Alterar senha (aluno e professor) — 19/40

Heurísticas: 1=2, 2=2, 3=2, 4=1, 5=2, 6=3, 7=1, 8=3, 9=2, 10=1.

Panorama: tela utilitária que ficou atrás do resto da autenticação (Recuperar/Nova senha, Criar conta). Detector: 0 achados. Sem amostra na galeria; medições por leitura de código e cálculo WCAG.

## Prioridades
- [P1] Texto de maquete "Demo: a senha atual é 123456" visível a usuário real (linha 122).
- [P1] `<form>` envolve só o botão (117–121): Enter não envia, gerenciador de senha perde o contexto.
- [P1] Erro de senha atual longe do campo; `text-destructive` sobre `bg-destructive/10` = 4,20:1; `aria-invalid` no campo errado; toast repete a mensagem.
- [P1] Cartão de sucesso: "Use-a no próximo login" impreciso (a pessoa continua logada), sem foco/`role=status`, toast duplicado; nada sobre os outros aparelhos.
- [P2] Botão Mostrar: ~16px de alvo, sem foco visível, sem `aria-pressed`, revela 3 campos estando junto do rótulo do primeiro.
- [P2] `Rule` local em vez de `PasswordRule` compartilhado (cor como único sinal).
- [P2] Sem saída para "esqueci a senha atual".
- [P3] Botão desativado sem motivo; nova senha igual à atual passa no cliente; sem aviso ao sair com campos; campos editáveis durante o envio.

Menores: placeholder informal; `navigate(-1)` após sucesso.

## Perguntas
Oferecer "Sair dos outros aparelhos"? Um formulário de senha único para esta tela e a Nova senha?
