# Bahia Boxe PWA

_Started 2026-08-31 20:42 UTC_

---

## User

Construa um PWA mobile-first em React 18 + Vite + TypeScript + Tailwind + shadcn/ui e Supabase chamado Bahia Boxe, seguindo integralmente esta especificação: tokens de design da seção 3, modelo de dados e RLS da seção 4, máquina de estados da seção 5, rotas da seção 6, navegação da seção 7 e componentes da seção 8. Aplique os padrões da seção 9 em toda tela. Depois implemente as melhorias da seção 12 na ordem de prioridade, respeitando os critérios de pronto.

referencias visuais anexadas

use o site para usar animacoes e micro interacoes: https://naocodei.com/free-code/ e https://motionsites.ai/

## Assistant

I'll read the spec first.

_[tool: read_file]_

Spec lida. Vou construir o protótipo interativo completo (aluno + professor) como um único Design Component mobile-first, seguindo tokens, máquina de estados, rotas, navegação e as melhorias da seção 12.

_[tool: update_todos]_

_[tool: dc_write]_

_[tool: show_html]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

Protótipo interativo do Bahia Boxe pronto — login com os dois perfis, tokens da seção 3 (dark + vermelho + dourado, Bebas/Inter), máquina de estados completa (pendente → aprovada/recusada com sugestão → concluída/falta) e as melhorias da seção 12: home com um único botão dominante, agenda em timeline com aprovação inline, tela de aceite da sugestão, barra de progresso do pacote com alerta ≤2, undo no toast para concluir/falta, reembolso e reposição no histórico, skeletons no formato do conteúdo, empty/erro em todas as listas e `aria-label` na bottom nav.

Testes rápidos: agendar em 3 toques a partir da home; aprovar pendência em 1 toque no painel; “Simular erro de rede” em Conta mostra o estado de erro em Aulas.

Próximos passos possíveis: onboarding guiado do professor (disponibilidade → templates → convite), tela de disponibilidade e fluxo de convite `/convite/:token`.

## User

Found issues — fixing…

## User

Found issues — fixing…

## User

<pasted_text name="Pasted text (116 lines)">
O arquivo atual ficou muito bom. Quero que você **mantenha integralmente o design, estrutura, componentes, estilos e padrões já implementados** e apenas complete os fluxos que ficaram faltando.

Preciso implementar **3 fluxos adicionais**, todos seguindo rigorosamente o mesmo Design System e linguagem visual já utilizada no projeto:

### 1. Gerenciamento de horários disponíveis pelo professor

Criar o fluxo completo para o professor configurar sua disponibilidade para aulas.

O professor deve conseguir:

* Visualizar sua agenda/disponibilidade atual.
* Definir dias da semana e horários em que está disponível.
* Definir um ou mais intervalos de horário por dia.
* Adicionar novos intervalos.
* Editar horários existentes.
* Remover horários.
* Ativar/desativar a disponibilidade de um dia.
* Ter uma visão clara de quais horários estão disponíveis para os alunos realizarem agendamentos.
* Considerar conflitos com aulas/agendamentos já existentes.
* Impedir ou sinalizar horários inválidos/conflitantes.
* Ter estados de loading, vazio, sucesso e erro.
* Exibir confirmação antes de ações destrutivas quando fizer sentido.

Importante: o fluxo deve ser pensado como **gestão recorrente de disponibilidade**, e não apenas como criação de uma aula específica.

Sugestão de estrutura:

* Tela de "Minha disponibilidade"
* Visualização semanal
* Cada dia com seus intervalos
* Ação "Adicionar horário"
* Modal/drawer para criação e edição
* Ação para excluir/desativar
* Feedback visual após salvar

### 2. Alteração de senha

Criar o fluxo de alteração de senha dentro da área de configurações/perfil do professor.

O fluxo deve contemplar:

* Senha atual
* Nova senha
* Confirmação da nova senha
* Mostrar/ocultar senha
* Validação dos requisitos da nova senha
* Validação de confirmação
* Estado de erro
* Estado de loading durante o envio
* Estado de sucesso após alteração
* Tratamento de senha atual incorreta
* Mensagem clara quando as senhas não coincidirem

Não criar uma experiência visual isolada. O fluxo deve parecer parte nativa do produto existente.

### 3. Sininho / central de notificações

Adicionar o sino de notificações na interface do professor, respeitando a navegação e o header já existentes.

Criar o fluxo completo:

* Ícone de sino no local mais apropriado da interface atual.
* Indicador de notificações não lidas.
* Ao clicar, abrir a central/popover/drawer de notificações seguindo os padrões já existentes.
* Lista de notificações.
* Estado de notificações não lidas.
* Estado de notificações lidas.
* Diferenciação visual entre lida e não lida.
* Ação para marcar uma notificação como lida.
* Ação "Marcar todas como lidas".
* Estado vazio quando não houver notificações.
* Considerar notificações relacionadas a:

  * novos agendamentos;
  * alterações/cancelamentos de aulas;
  * confirmações;
  * avisos importantes do sistema.

### Regras importantes de implementação

**NÃO redesenhe o que já existe.**

Antes de implementar, analise o arquivo atual e identifique:

1. Componentes já existentes que podem ser reutilizados.
2. Padrões de navegação existentes.
3. Padrões de modal/drawer.
4. Componentes de formulário.
5. Padrões de feedback/toast.
6. Tipografia, espaçamento, bordas, sombras e demais tokens.
7. Padrões de estados vazios, loading e erro.
8. Estrutura de navegação do professor.
9. Como os dados e estados estão organizados atualmente.

Os 3 novos fluxos devem parecer que **sempre fizeram parte do mesmo produto**.

Não introduza novos padrões visuais quando já existir um equivalente no projeto.

Também não altere ou remova funcionalidades existentes.

### Antes de finalizar

Faça uma revisão do arquivo completo e garanta que:

* Os três fluxos estão acessíveis pela navegação.
* Não existem telas órfãs.
* Todos os botões e ações principais possuem comportamento.
* Existem estados de loading, erro, vazio e sucesso onde necessário.
* Os fluxos são coerentes entre desktop e mobile, caso o arquivo suporte ambos.
* O gerenciamento de disponibilidade está claramente separado de agendamentos.
* O usuário consegue entender facilmente o que está disponível para os alunos.
* O sino de notificações possui feedback claro para itens não lidos.
* A alteração de senha possui validações completas.

**Prioridade:** preservar a qualidade visual do arquivo atual. Quero uma extensão do trabalho já feito, não uma nova interpretação visual.

</pasted_text>

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Agora as telas. Primeiro o header do professor (sino) e o menu da conta.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: grep]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Três fluxos adicionados sem alterar o que já existia:

**Disponibilidade** (`Conta → Minha disponibilidade`, e atalho no header da Agenda): grade semanal recorrente, toggle por dia, intervalos com editar/remover, drawer de criação/edição no mesmo padrão do modal de recusa, bloqueio de intervalos inválidos ou conflitantes, aviso de aulas já marcadas, ConfirmDialog ao desativar dia/remover intervalo com aulas, undo no toast, e loading/vazio/erro.

**Alterar senha** (`Conta → Alterar senha`): senha atual + nova + confirmação, mostrar/ocultar, checklist de requisitos ao vivo, aviso de senhas diferentes, botão desabilitado até válido, loading, erro de senha atual (demo: `123456`) e tela de sucesso.

**Central de notificações**: sino no header com contador de não lidas (professor e aluno, com listas próprias), drawer com diferenciação lida/não lida, marcar uma ao tocar (navega para o contexto), "Marcar todas", limpar com confirmação e undo, e estado vazio.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Alvos de toque corrigidos para 44×44px (editar/remover intervalo, "Marcar todas" e fechar da central). Nada mais foi alterado.

Aviso: o limite de uso está em 90% — bom ponto para pausar. Se quiser continuar, os próximos passos naturais seriam o onboarding do professor e o fluxo de convite `/convite/:token`.

