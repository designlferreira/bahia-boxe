## Domínio: agendamento

Existem DOIS fluxos de agendamento coexistindo, selecionados pela flag
`modo_agendamento` (em academia/professor):

- **AUTOSSERVICO** (legado-ativo): o professor publica sua disponibilidade e o
  aluno escolhe o horário. NÃO remover, NÃO renomear, NÃO refatorar, NÃO tratar
  como código morto.

  Arquivos envolvidos (mapeados na Etapa 0):
  - **Migration**: `supabase/migrations/0001_credit_ledger.sql` — ledger de
    créditos e todas as RPCs do ciclo de vida da aula: `schedule_booking`,
    `complete_booking`, `mark_no_show`, `undo_lesson_action`,
    `mark_as_replacement`, `assign_package_from_template`,
    `assign_package_to_student`, `remove_active_package`,
    `available_credits_for_student`, trigger `grant_trial_credit`.
  - **Tabelas-base preexistentes** (sem migration neste repo — já existiam no
    Supabase antes deste frontend, ver `supabase/README.md`): `bookings`,
    `availability_slots`, `packages`, `package_templates`, `students`,
    `profiles`, `purchase_requests`.
  - **Serviço/queries**: `src/integrations/backend/api.ts` — toda a camada de
    acesso ao banco deste fluxo (agendar, cancelar, aceitar sugestão,
    histórico, aprovar/recusar, concluir/falta/desfazer/reposição,
    disponibilidade, templates de pacote, pedidos de compra, configurações).
  - **Hook**: `src/hooks/useLessonActions.tsx` — mutations de concluir/falta/
    desfazer/reposição + diálogos de confirmação, reusado por Agenda e
    AulaDetalhe do professor.
  - **Páginas aluno**: `src/pages/student/Home.tsx`, `Agendar.tsx`,
    `Historico.tsx`, `AulaDetalhe.tsx`, `Pacotes.tsx`.
  - **Páginas professor**: `src/pages/admin/Dashboard.tsx`, `Agenda.tsx`,
    `AulaDetalhe.tsx`, `Alunos.tsx`, `AlunoDetalhe.tsx`, `Historico.tsx`,
    `Pacotes.tsx` (templates), `Pedidos.tsx`, `Disponibilidade.tsx`.
  - **Componentes**: `src/components/BookingCard.tsx`,
    `RejectBookingModal.tsx`, `ReplacementPickerSheet.tsx`,
    `NotificationBell.tsx`.
  - **Utilitários**: `src/lib/bookingStatus.ts`, `src/lib/packageUtils.ts`,
    `src/lib/dateUtils.ts`.
  - **Onde se calcula "aulas restantes" hoje**: RPC
    `available_credits_for_student` (canônica, soma todos os pacotes `active`
    do aluno menos reservas futuras) via `creditsAvailableFor()` em `api.ts`;
    espelhada em lote por `creditsByStudent()` no mesmo arquivo (mesma
    fórmula, evita N chamadas de RPC em listas); progresso de UM pacote
    (`total_classes - used_classes`) via `packageProgressPct()` em
    `packageUtils.ts`.

- **RECORRENCIA** (novo): o professor define dias e horários fixos no perfil de
  cada aluno e gera pacotes de aulas a partir disso.

Ambos os fluxos gravam na MESMA tabela de agendamentos (`bookings`).
Toda migration deve ser aditiva e reversível; colunas novas sempre nullable.

### Decisões de design (2026-09-03, antes da Etapa 1)

Resolvem ambiguidades do rascunho original da spec RECORRENCIA, verificadas
contra o código do fluxo AUTOSSERVICO antes de fechar.

**1. Vocabulário de status.** Os nomes em português do rascunho eram
conceituais — o valor gravado usa o enum `booking_status` já existente:
`AGENDADA→scheduled`, `REALIZADA→completed`, `FALTA→no_show`,
`CANCELADA→cancelled`, `REAGENDADA→'rescheduled'` (único valor NOVO no enum).
`ALTER TYPE ... ADD VALUE 'rescheduled'` vai numa migration isolada, sozinha —
um valor de enum não pode ser usado na mesma transação em que é criado, e cada
migration roda em transação; qualquer código/constraint que referencie
`'rescheduled'` fica para uma migration posterior. Reversibilidade é parcial
por natureza do Postgres (um valor de enum órfão não quebra rollback, mas
remover valor de enum não é suportado) — aceito.
`pending_confirmation` / `rejected` / `rejected_with_suggestion` são do fluxo
de APROVAÇÃO do AUTOSSERVICO. Uma aula criada pelo professor no fluxo
RECORRENCIA nasce direto em `scheduled` e nunca passa por confirmação — não
reaproveitar esse fluxo por analogia.

**2. Reagendamento e reposição são o MESMO mecanismo.** Ambos são "este
booking substitui aquele". `replacement_for_booking_id` (já existe na tabela
`bookings`) É o elo de cadeia que o rascunho original chamava de
`reagendado_de_id` — não criar coluna equivalente. Verificado em código
(2026-09-03): o único ponto de escrita nessa coluna é a RPC
`mark_as_replacement` (`0001_credit_ledger.sql`), acionada só quando
`booking.status === 'scheduled' && !booking.isReplacement`, sobre um
"original" restrito pela UI a `status IN ('no_show','cancelled')`
(`getReplaceableBookingsForStudent`); confirmado também no banco (query
`pg_proc.prosrc` + verificação de dados: nenhuma outra função escreve nela, nenhuma linha foge do padrão esperado).
A diferença entre reagendamento e reposição é só como o antecessor terminou:
- antecessor em `rescheduled` → foi remarcação (só professor, aula futura)
- antecessor em `no_show` perdoado → foi reposição (crédito preservado)

A regra de crédito trata os dois certo porque olha o terminal da CADEIA, não
o motivo individual da linha. `is_replacement` fica como está — não
remover/renomear (`ReplacementPickerSheet` depende dele).
A coluna `origem` do rascunho original foi DESCARTADA — é derivável:
- veio da recorrência → `recorrencia_id IS NOT NULL`
- é reposição/remarcação → `replacement_for_booking_id IS NOT NULL`

`mark_as_replacement` (AUTOSSERVICO) NÃO é tocada nem refatorada. Reagendamento
(Etapa 6) usa uma RPC nova, que também seta `is_replacement`/
`replacement_for_booking_id`, mas por cima disso marca o antecessor como
`rescheduled` — o que `mark_as_replacement` nunca fez, porque no AUTOSSERVICO
o antecessor já chega pronto em `no_show`/`cancelled` antes de ser vinculado.
Sobra `cadeia_id` como a única coluna nova de cadeia.

**3. Snapshot com fallback obrigatório.** `mark_no_show`/`complete_booking`
não podem simplesmente passar a ler `falta_consome_credito` do pacote — um
booking do AUTOSSERVICO pode não ter pacote (`pacote_id is null`). A leitura
vira `coalesce(pacote.falta_consome_credito, profiles.no_show_consumes_class)`.
`profiles.no_show_consumes_class` continua sendo a verdade para bookings sem
pacote E o default na criação de pacotes novos. Comportamento do fluxo antigo
não muda.

**4. Cálculo de saldo mora no Postgres, não em TypeScript.**
`PacoteService.calcularSaldo()` do rascunho original foi descartado —
autorização e crédito já vivem em RPCs `security definer`; colocar a regra de
crédito em TS duplicaria o invariante em dois lugares e, num app onde o
cliente fala direto com o banco (Supabase), uma regra em TS é contornável.
Vira função SQL: `calcular_saldo_pacote(p_pacote_id uuid) returns table
(total int, consumidas int, restantes int, a_repor int)`, mais uma view para
a UI ler saldo sem chamar a função por linha.

### Entidades

**aluno_recorrencia** — template persistente, NÃO gera aulas sozinho
  aluno_id, professor_id
  dia_semana (0-6), horario, duracao
  ativo

**pacote** — lote concreto de aulas. **Em aberto**: tabela nova ou reaproveitar
`packages` (já existe, já tem `student_id`/`total_classes`/`used_classes`/
`status`) com 2 colunas novas (`recorrencia_id`, `falta_consome_credito`)? Ver
"Pontos ainda em aberto" — decidir antes de fechar a Etapa 1.
  aluno_id, professor_id, recorrencia_id (nullable)
  total_aulas
  falta_consome_credito   ← SNAPSHOT, copiado da config do professor na criação

**agendamento** — aula real (tabela `bookings` existente, apenas colunas novas)
  ...campos atuais...
  status: enum `booking_status` existente + `'rescheduled'` (único valor novo,
    ver decisão 1) — nunca um enum novo em português
  pacote_id           (nullable, novo)
  recorrencia_id      (nullable, novo)
  cadeia_id           (nullable até o backfill, novo) → id da PRIMEIRA linha da cadeia
  cancelado_por       (nullable, novo)  → PROFESSOR | ALUNO, só quando `cancelled`
  aviso_ausencia_em, aviso_ausencia_motivo (nullable, novo — Etapa 8)
  ~~origem~~ (descartada, decisão 2 — derivável)
  ~~reagendado_de_id~~ (descartada, decisão 2 — reaproveita `replacement_for_booking_id`)

`replacement_for_booking_id` (já existe) → linha anterior da cadeia, tanto em
reagendamento quanto em reposição (decisão 2).

### Regras invariantes do fluxo RECORRENCIA

**Autorização**
- Somente o professor cria, reagenda ou cancela aulas. Validar no SERVIÇO
  (RPC `security definer`, decisão 4), não apenas na UI. Esconder o botão não
  é autorização.
- O aluno só pode registrar `aviso_ausencia` no próprio agendamento. Isso não
  altera data, status nem crédito — apenas notifica o professor.

**Recorrência e pacote**
- A recorrência é um template no perfil do aluno. NÃO gera aulas
  automaticamente e NÃO renova pacotes automaticamente.
- Pacotes são criados por ação explícita do professor, que materializa
  `total_aulas` linhas concretas na tabela de agendamentos.
- `falta_consome_credito` é copiada para o pacote no momento da criação
  (default = `profiles.no_show_consumes_class` do professor no momento).
  A config do professor é apenas o DEFAULT para pacotes novos — pacote em
  andamento nunca muda de regra (lido via `coalesce`, decisão 3).
- Alertar o professor quando restarem 2 ou menos aulas no pacote.

**Reagendamento**
- Reagendar NÃO edita a linha existente. Marca a original como `rescheduled`
  e cria uma NOVA linha com `replacement_for_booking_id` = id da original e
  `cadeia_id` herdado da original (decisão 2 — RPC nova, não
  `mark_as_replacement`).
- Em uma linha sem remarcação, `cadeia_id` = o próprio id.
- "Quantas vezes esta aula foi remarcada" = count por `cadeia_id` menos 1.

**Crédito — regra única**
- O consumo é propriedade da CADEIA, não da linha individual.
- Uma cadeia consome 1 crédito conforme seu status terminal:
```
    completed (REALIZADA)                     → sempre consome
    no_show (FALTA)                           → consome se pacote.falta_consome_credito (com fallback, decisão 3)
    cancelled + cancelado_por=ALUNO           → consome se pacote.falta_consome_credito
    cancelled + cancelado_por=PROFESSOR       → NUNCA consome
    rescheduled (REAGENDADA)                  → nunca consome (não é terminal)
```
- Falta perdoada NÃO gera registro de saldo separado. O crédito simplesmente
  permanece disponível e é usado depois por um agendamento vinculado via
  `replacement_for_booking_id` (reposição).
- `aulas_restantes = pacote.total_aulas − cadeias_que_consumiram`
- `a_repor = faltas_perdoadas − reposicoes_ja_agendadas` (derivado, sem coluna)
- TODO cálculo de saldo passa por `calcular_saldo_pacote()` no Postgres
  (decisão 4). Nenhuma tela, query ou componente TypeScript pode somar status
  diretamente na tabela de agendamentos — uma cadeia com 3 remarcações tem 3
  linhas e contar linhas dobraria o desconto.

### Pontos ainda em aberto

Decidir antes de chegar na etapa correspondente:

- **`pacote`: tabela nova ou reaproveitar `packages`?** Ver seção Entidades
  acima — bloqueia fechar a lista de arquivos da Etapa 1.
- **Feriados** — ao gerar o pacote, aula que cai em feriado: gerar e sinalizar
  para o professor resolver, ou pular? (recomendação: gerar e sinalizar; pular
  automaticamente esconde a decisão do usuário)
- **Fuso horário** — como as datas são persistidas hoje (`timestamptz`, UI
  raciocina em BRT via `date-fns-tz`, ver `api.ts`). Confirmar que a geração
  em lote da Etapa 4 usa o mesmo padrão (`fromZonedTime`/`TIMEZONE`) em vez de
  reimplementar a conversão.
- **Mudança de recorrência** — ao editar o template, aplica ao pacote em
  andamento ou só ao próximo?
