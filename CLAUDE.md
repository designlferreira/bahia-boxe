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

`calcular_saldo_pacote()` é a ÚNICA autoridade — `packages.used_classes` vira
cópia materializada, nunca fonte. Conflito que isso resolve: `used_classes` é
um contador; a spec define consumo como derivado da CADEIA (agrupar por
`cadeia_id`, achar a linha terminal, aplicar a regra) — duas fontes de
verdade pro mesmo número que divergem sempre que há remarcação (uma cadeia
com 3 remarcações tem 3 linhas; um contador ingênuo descontaria 3 créditos de
uma aula só).
- Pacotes com `recorrencia_id IS NOT NULL`: os RPCs que já mudam status de
  booking (`mark_no_show`, `complete_booking`, e os novos de reagendar e
  cancelar da Etapa 6) chamam `calcular_saldo_pacote()` e SOBRESCREVEM
  `used_classes` com o resultado. Sem trigger nova — a escrita fica no mesmo
  ponto onde hoje já se escreve em `used_classes`.
- Pacotes sem `recorrencia_id` (comprado/admin_grant/trial): comportamento
  atual intacto, nada muda — continuam incrementando `used_classes` como
  sempre incrementaram.
- Nenhum código novo pode INCREMENTAR `used_classes`. Só sobrescrever com o
  valor calculado.

**5. `pacote` reaproveita `packages` — não é tabela nova.** `packages` já tem
`student_id`/`total_classes`/`used_classes`/`status`, exatamente a forma que
a spec pedia. Duas colunas novas, nullable: `recorrencia_id uuid references
aluno_recorrencia(id)`, `falta_consome_credito boolean`. `bookings.pacote_id`
referencia `packages.id` diretamente — sem FK polimórfico, sem duas fontes de
saldo pro mesmo aluno. `professor_id` não ganha coluna própria: continua
derivado via `student_id → students.admin_id`, como o resto do código já faz.

`origin` (`text` + `CHECK`, não enum nativo — `0001_credit_ledger.sql:85-86`)
é o campo canônico de "de onde veio o pacote". Ganha um quarto valor:
`'recurrence'`. Por ser `CHECK` (não `pg_enum`), estender é `drop
constraint`/`add constraint` numa única migration, sem a limitação de
transação que o `ADD VALUE` do `booking_status` tem (decisão 1) —
reversibilidade de verdade. `recorrencia_id` continua existindo como FK, mas
quem responde "de onde veio" é `origin`; `recorrencia_id IS NOT NULL` fica só
como o vínculo com o template, não como sinalizador de origem.
Pacote de recorrência: `origin = 'recurrence'`, `kind = 'package'` (default
real da coluna, confirmado em 2026-09-03 via `information_schema.columns`:
`column_default = 'package'::text`, `not null` — é o mesmo valor que
`assign_package_from_template`/`assign_package_to_student` já produzem hoje
sem setar `kind` explicitamente, então setar explicitamente daqui pra frente
não muda nada do que essas duas já gravam).

**Consequência do "1 pacote ativo não-trial por vez" (já valia, mantido):** o
professor não pode pré-gerar o próximo pacote de recorrência antes do atual
terminar — isso finalizaria o atual (mesmo `update ... where status='active'
and origin<>'trial'` que já existe, sem precisar de ajuste: não filtra por
origin do pacote sendo fechado, então já vale simetricamente entre comprado,
admin_grant e recorrência).

**6. Criação de pacote: caminho único de escrita, extraído em commit isolado
antes da geração por recorrência.** `assign_package_from_template` e
`assign_package_to_student` (`0001:222-291`) hoje fazem cada uma seu próprio
`insert into packages` — mesmos 5 campos, mesma regra ao redor, mas duplicado.
Antes de a Etapa 4 introduzir um terceiro caminho, extrai-se o trecho comum
para uma função interna:

```sql
_create_package(p_student_id uuid, p_total_classes int, p_origin text, p_kind text default 'package')
  returns uuid
```

com os invariantes confirmados em 2026-09-03 (comparando as duas funções
linha a linha):
- fecha outros pacotes `active` não-trial do aluno antes de inserir
- `used_classes = 0`, `status = 'active'` na criação
- `kind` sempre setado explicitamente (nunca mais confiar no default)
- retorna o `id` do pacote novo

`p_total_classes is null or p_total_classes <= 0` → exceção **não** entra em
`_create_package` — hoje só existe em `assign_package_to_student`
(`assign_package_from_template` confia sem checar que
`package_templates.total_classes` já é válido). Mover pra dentro da função
compartilhada mudaria o comportamento observável de `assign_package_from_
template`, o que contradiz "comportamento idêntico ao atual" abaixo — cada
chamadora mantém sua própria validação de `total_classes`, exatamente como
hoje. A Etapa 4 adiciona a mesma checagem na sua própria função pública,
antes de chamar `_create_package`.

**Autorização — CORREÇÃO (2026-09-03, revisando a primeira versão desta
decisão):** a versão original dizia que a autorização "permanece na função
pública que chama, não duplicada dentro dela". Isso estava errado. Este
repositório não usa `GRANT`/`REVOKE` em nenhuma migration — todas as 10
funções `security definer` de `0001_credit_ledger.sql` se protegem
inteiramente por checagem interna (`if not exists (...) then raise
exception`); toda função nova é `EXECUTE`-ável por `PUBLIC` a menos que
alguém revogue explicitamente. Se `_create_package` não tivesse nem `REVOKE`
nem checagem própria, ficaria chamável direto via `supabase.rpc
('_create_package', ...)` por qualquer aluno autenticado — cria pacote pra
qualquer aluno, sem autorização nenhuma.

Correção: **as duas camadas, não uma.**
- `revoke execute on function public._create_package(uuid, int, text, text)
  from public, authenticated, anon;` logo após criá-la — fecha a
  alcançabilidade a partir do cliente. Chamada interna a partir de outra
  função `security definer` continua funcionando (roda como o dono da
  função, o `REVOKE` não afeta isso). **Primeiro uso deste mecanismo no
  repositório** — comentar no SQL por quê esta função tem tratamento
  diferente das outras 10.
- `_create_package` TAMBÉM valida autorização internamente (mesmo formato
  de `raise exception` que o resto do repo já usa) — garante que a função
  continue correta mesmo se uma chamadora futura esquecer de autorizar antes
  de chamar, o que é bem mais provável que alguém contornar o `REVOKE`.

A duplicação entre essa checagem e a das funções públicas chamadoras é
**intencional — defesa em profundidade, não descuido. Não remover nenhuma
das duas camadas em nome de DRY.**

Requisitos da extração (é refatoração pura — "não refatorar o AUTOSSERVICO"
existe pra impedir remoção/mudança de comportamento, não pra proibir extração
sem mudança de comportamento):
- comportamento idêntico ao atual nas duas funções existentes, provado por
  teste rodando antes e depois da extração — não só por raciocínio
- assinatura pública e nome de `assign_package_from_template` e
  `assign_package_to_student` inalterados
- commit isolado, sem nada da criação de pacote por recorrência junto

A Etapa 4 chama `_create_package(p_student_id, p_total_aulas, 'recurrence',
'package')` e materializa as N linhas de `bookings` depois — sem insert
paralelo em `packages`.

**7. `bookings.pacote_id` é uma ligação NOVA — não existia nada eager antes
dela.** Verificado em código (2026-09-03): a única ligação booking↔pacote
hoje é `credit_transactions.package_id`/`.booking_id` na mesma linha, escrita
tardiamente por `complete_booking`/`mark_no_show` no momento da conclusão —
nunca uma atribuição antecipada. A escolha de qual pacote debitar é feita
nesse momento por uma busca ("mais antigo `active` com vaga, trial primeiro":
`order by (origin = 'trial') desc, created_at asc limit 1`,
`0001:481-487`/`:555-561`), não por nenhum vínculo gravado no booking. Existe
também `booking_package_consumptions` (`primary key(booking_id)` +
`package_id`) — mas é vestígio morto: era escrita pela trigger
`apply_booking_package_consumption`, **removida na própria 0001**
(`0001:781-782`) por causar dupla contagem; hoje tem RLS ligada e zero
policies (inacessível pelo cliente). **Não reativar, não escrever, não
remover** — é só evidência histórica que a 0001 já consultou pro backfill do
ledger.

Como RECORRENCIA precisa do oposto (as N linhas nascem já pertencendo a um
pacote específico, não "qualquer um com vaga"), `pacote_id` passa a ser a
fonte direta pra `mark_no_show`/`complete_booking` quando presente — a busca
preguiçosa antiga só roda quando `pacote_id is null` (bookings do
AUTOSSERVICO, comportamento idêntico ao de hoje).

**Consequência conhecida, aceita conscientemente — não é bug:** a busca
preguiçosa ordena `(origin = 'trial') desc`, e trial convive à parte da regra
de "1 pacote ativo não-trial por vez" — um aluno pode ter trial ativo E
pacote de recorrência ativo ao mesmo tempo. Antes desta decisão, uma aula de
recorrência concluída debitaria o TRIAL (a busca preguiçosa o prefere
primeiro); com `pacote_id` como fonte direta, isso para de acontecer — que é
o comportamento correto — mas como consequência, **o crédito de trial de um
aluno em recorrência para de ser consumido e fica parado, `active`,
indefinidamente**. `packages` não tem coluna de expiração (`supabase/
README.md:45-46` é explícito: "não há data de expiração"), não achamos
nenhum cron/job agendado em nenhuma migration deste repo, e
`packages_one_trial_per_student` garante que nunca haverá um segundo trial
pra "substituir" o parado. Ele continua contando em `available_credits_for_student`
(soma todos os `active`) pra sempre. Justificativa aceita: trial é cortesia
de entrada; aluno que já está em recorrência não está mais nesse estágio.
**Se alguém achar esse crédito de trial parado no perfil de um aluno depois,
isso é o comportamento decidido aqui, não um bug pra "consertar".**

### Entidades

**aluno_recorrencia** — template persistente, NÃO gera aulas sozinho
  aluno_id, professor_id
  dia_semana (0-6), horario, duracao
  ativo

**pacote** — é a `packages` existente (decisão 5), não uma tabela nova.
  student_id (existente) — professor_id derivado via students.admin_id, sem coluna própria
  recorrencia_id uuid references aluno_recorrencia(id) (nullable, novo)
  falta_consome_credito boolean (nullable, novo)  ← SNAPSHOT, copiado da config do professor na criação
  origin ganha o valor 'recurrence' (CHECK estendido, decisão 5)
  total_classes/used_classes/status/kind (existentes, sem mudança de forma)

**agendamento** — aula real (tabela `bookings` existente, apenas colunas novas)
  ...campos atuais...
  status: enum `booking_status` existente + `'rescheduled'` (único valor novo,
    ver decisão 1) — nunca um enum novo em português
  pacote_id           (nullable, novo)
  recorrencia_id      (nullable, novo)
  cadeia_id           (nullable até o backfill, novo) → id da PRIMEIRA linha da cadeia
  cancelado_por       (nullable, novo)  → check in ('professor','aluno'), minúsculo por
    consistência com o resto do banco (`booking_status`/`origin`/`kind` são
    todos lowercase) — só preenchido quando `cancelled`
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
    cancelled + cancelado_por='aluno'         → consome se pacote.falta_consome_credito
    cancelled + cancelado_por='professor'     → NUNCA consome
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

### Roteiro de migrations (2026-09-03, plano da Etapa 1)

| # | Arquivo | Conteúdo | Etapa |
|---|---|---|---|
| 1 | `0008_booking_status_rescheduled.sql` | `ALTER TYPE booking_status ADD VALUE 'rescheduled';` — sozinha na migration (decisão 1: valor de enum não pode ser usado na mesma transação em que é criado) | 2 |
| 2 | `0009_aluno_recorrencia.sql` | Tabela `aluno_recorrencia` + RLS professor-only (aluno não lê o template — já enxerga a recorrência pelas aulas materializadas na agenda) | 2 |
| 3 | `0010_packages_recurrence_columns.sql` | `packages.recorrencia_id` (nullable, FK), `.falta_consome_credito` (nullable); `origin` CHECK ganha `'recurrence'` (decisão 5) | 2 |
| 4 | `0011_bookings_recurrence_columns.sql` | `bookings.pacote_id` (nullable, FK `packages.id`, decisão 7), `.recorrencia_id`, `.cadeia_id`, `.cancelado_por` (`check in ('professor','aluno')`) — todas nullable; **backfill topológico** de `cadeia_id` via recursive CTE sobre `replacement_for_booking_id` (raiz = próprio id quando `replacement_for_booking_id is null`; sucessor herda o `cadeia_id` da raiz, resolvido seguindo a cadeia até o fim — nunca `cadeia_id = id` para todas as linhas) | 2 |
| 5 | `0012_extract_create_package.sql` | Extrai `_create_package(...)` de `assign_package_from_template`/`assign_package_to_student` (decisão 6) — refatoração pura, testada antes/depois, sozinha | **2.5** |
| 6 | `0013_calcular_saldo_pacote.sql` | `calcular_saldo_pacote(p_pacote_id)` + view de leitura (decisão 4), com testes — fecha a Etapa 3 sozinha | 3 |
| 7 | `0014_gerar_pacote_recorrencia.sql` | RPC pública: valida a recorrência, chama `_create_package(..., 'recurrence', 'package')`, materializa N linhas em `bookings` (`cadeia_id` = próprio id, `pacote_id` = pacote recém-criado) | 4 |
| 8 | `0015_mark_no_show_complete_booking_recorrencia.sql` | `create or replace` de `mark_no_show`/`complete_booking` (decisão 7): coalesce de `falta_consome_credito`; quando `pacote_id is not null`, usa esse pacote diretamente (não a busca "mais antigo ativo") e sobrescreve `used_classes` via `calcular_saldo_pacote()`; `pacote_id is null` → comportamento idêntico ao atual. Testada junto com a 0014, com pacote de recorrência gerado de verdade — por isso vem DEPOIS dela, não antes (rodar antes seria inofensivo mas ficaria sem cobertura real por uma etapa inteira) | 4 |
| 9 | `0016_reagendar_cancelar_aula.sql` | RPCs `reagendar_aula`/`cancelar_aula`, professor-only | 6 |
| 10 | `0017_aviso_ausencia.sql` | `bookings.aviso_ausencia_em`/`.aviso_ausencia_motivo` (adiado pra cá — não adicionar coluna que nenhuma função usa ainda) + função pro aluno registrar | 8 |

### Pontos ainda em aberto

Decidir antes de chegar na etapa correspondente:

- **Feriados** — ao gerar o pacote, aula que cai em feriado: gerar e sinalizar
  para o professor resolver, ou pular? (recomendação: gerar e sinalizar; pular
  automaticamente esconde a decisão do usuário)
- **Fuso horário** — como as datas são persistidas hoje (`timestamptz`, UI
  raciocina em BRT via `date-fns-tz`, ver `api.ts`). Confirmar que a geração
  em lote da Etapa 4 usa o mesmo padrão (`fromZonedTime`/`TIMEZONE`) em vez de
  reimplementar a conversão.
- **Mudança de recorrência** — ao editar o template, aplica ao pacote em
  andamento ou só ao próximo?
