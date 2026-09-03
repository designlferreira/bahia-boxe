## Domínio: agendamento

Existem DOIS fluxos de agendamento coexistindo, selecionados pela flag
`modo_agendamento` (em academia/professor):

- **AUTOSSERVICO** (legado-ativo): o professor publica sua disponibilidade e o
  aluno escolhe o horário. NÃO remover, NÃO renomear, NÃO refatorar, NÃO tratar
  como código morto. Arquivos envolvidos: [preencher após o mapeamento]

- **RECORRENCIA** (novo): o professor define dias e horários fixos no perfil de
  cada aluno e gera pacotes de aulas a partir disso.

Ambos os fluxos gravam na MESMA tabela de agendamentos.
Toda migration deve ser aditiva e reversível; colunas novas sempre nullable.

### Entidades

**aluno_recorrencia** — template persistente, NÃO gera aulas sozinho
  aluno_id, professor_id
  dia_semana (0-6), horario, duracao
  ativo

**pacote** — lote concreto de aulas
  aluno_id, professor_id, recorrencia_id (nullable)
  total_aulas
  falta_consome_credito   ← SNAPSHOT, copiado da config do professor na criação

**agendamento** — aula real (tabela existente, apenas colunas novas)
  ...campos atuais...
  status: AGENDADA | REALIZADA | FALTA | REAGENDADA | CANCELADA
  origem: AUTOSSERVICO | RECORRENCIA | REPOSICAO
  pacote_id           (nullable)
  recorrencia_id      (nullable)
  reagendado_de_id    (nullable)  → linha anterior da cadeia
  cadeia_id                       → id da PRIMEIRA linha da cadeia
  cancelado_por       (nullable)  → PROFESSOR | ALUNO, só quando CANCELADA
  aviso_ausencia_em, aviso_ausencia_motivo (nullable)

### Regras invariantes do fluxo RECORRENCIA

**Autorização**
- Somente o professor cria, reagenda ou cancela aulas. Validar no SERVIÇO,
  não apenas na UI. Esconder o botão não é autorização.
- O aluno só pode registrar `aviso_ausencia` no próprio agendamento. Isso não
  altera data, status nem crédito — apenas notifica o professor.

**Recorrência e pacote**
- A recorrência é um template no perfil do aluno. NÃO gera aulas
  automaticamente e NÃO renova pacotes automaticamente.
- Pacotes são criados por ação explícita do professor, que materializa
  `total_aulas` linhas concretas na tabela de agendamentos.
- `falta_consome_credito` é copiada para o pacote no momento da criação.
  A config do professor é apenas o DEFAULT para pacotes novos — pacote em
  andamento nunca muda de regra.
- Alertar o professor quando restarem 2 ou menos aulas no pacote.

**Reagendamento**
- Reagendar NÃO edita a linha existente. Marca a original como REAGENDADA e
  cria uma NOVA linha com `reagendado_de_id` = id da original e `cadeia_id`
  herdado da original.
- Em uma linha sem remarcação, `cadeia_id` = o próprio id.
- "Quantas vezes esta aula foi remarcada" = count por `cadeia_id` menos 1.

**Crédito — regra única**
- O consumo é propriedade da CADEIA, não da linha individual.
- Uma cadeia consome 1 crédito conforme seu status terminal:
    REALIZADA                        → sempre consome
    FALTA                            → consome se pacote.falta_consome_credito
    CANCELADA + cancelado_por=ALUNO  → consome se pacote.falta_consome_credito
    CANCELADA + cancelado_por=PROFESSOR → NUNCA consome
    REAGENDADA                       → nunca consome (não é terminal)
- Falta perdoada NÃO gera registro de saldo separado. O crédito simplesmente
  permanece disponível e é usado depois por um agendamento `origem = REPOSICAO`.
- `aulas_restantes = pacote.total_aulas − cadeias_que_consumiram`
- `a_repor = faltas_perdoadas − reposicoes_ja_agendadas` (derivado, sem coluna)
- TODO cálculo de saldo passa por `PacoteService.calcularSaldo()`. Nenhuma tela,
  query ou componente pode somar status diretamente na tabela de agendamentos —
  uma cadeia com 3 remarcações tem 3 linhas e contar linhas dobraria o desconto.
