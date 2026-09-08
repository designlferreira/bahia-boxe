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

**Essa regra também é um índice único no banco — descoberto por acidente em
2026-09-03, ao testar** (`verify_calcular_saldo_pacote.sql` deu `duplicate
key value violates unique constraint
"ux_packages_one_active_purchase_per_student"` ao inserir um segundo pacote
`active` pro mesmo aluno). Confirmado via `pg_indexes`:

```sql
CREATE UNIQUE INDEX ux_packages_one_active_purchase_per_student
ON public.packages USING btree (student_id)
WHERE ((status = 'active'::package_status) AND (origin <> 'trial'::text));
```

**O nome do índice engana** — diz "purchase" mas o predicado é `origin <>
'trial'`, então já valia pra `admin_grant` antes desta feature e agora
também vale pra `recurrence`. Isso é o comportamento que queremos (é
literalmente a regra "1 pacote ativo não-trial por vez" que a Etapa 4 já
precisa), mas **foi efeito colateral de estender o `CHECK` de `origin`, não
uma decisão deliberada sobre este índice especificamente** — registrado aqui
pra não parecer coincidência da próxima vez que alguém ler o nome
"purchase" e concluir que recorrência não deveria estar sujeita a ele.

**Consequência prática para a Etapa 4:** `gerar_pacote_recorrencia` NÃO pode
fazer `insert` direto em `packages` sob nenhuma circunstância (nem por
performance, nem por simplicidade) — tem que passar por `_create_package`,
cujo `update` (fecha o pacote ativo anterior) sempre roda antes do `insert`
na mesma função, satisfazendo o índice por construção. Um `insert` direto
que pule esse `update` colide com este índice exatamente como aconteceu no
script de teste.

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

**Status real da verificação (2026-09-03): só por leitura, não empírica.**
A paridade de comportamento entre `0001` e `0012` foi conferida linha a
linha (auth idêntica, mesmo `update`/`insert`, `kind` explícito comprovado
igual ao default real da coluna) — não foi rodada contra o banco.
`supabase/verify_create_package.sql` existe no repo pronto pra isso, mas a
execução ficou pra depois. **Se aparecer bug na criação de pacote
(`assign_package_from_template`/`assign_package_to_student`/`_create_package`),
este é o primeiro lugar a olhar** — a garantia que existe hoje é mais fraca
que "provado por teste", é "conferido por leitura cuidadosa".

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

**8. `calcular_saldo_pacote()` — algoritmo (2026-09-03, Etapa 3).** Implementada
em `0013_calcular_saldo_pacote.sql`. Só aceita pacote com `recorrencia_id is
not null` — chamar num pacote AUTOSSERVICO daria `consumidas=0` sempre
(nenhum booking antigo tem `pacote_id`), um saldo que parece certo mas não
é; a função prefere dar exceção (`not_a_recurrencia_package`) a devolver
isso silenciosamente.

Algoritmo: acha todas as cadeias com pelo menos uma linha `pacote_id =
p_pacote_id`, pega a cadeia INTEIRA por `cadeia_id` (não só as linhas com
`pacote_id` preenchido — um sucessor de reagendamento pode não ter herdado
isso ainda), acha a linha TERMINAL de cada cadeia (a que nenhuma outra
aponta via `replacement_for_booking_id`) e aplica a regra de crédito só
sobre o terminal. `distinct on (cadeia_id) order by created_at desc` no
passo do terminal é defesa contra um dado anômalo que o AUTOSSERVICO não
impede hoje (duas linhas diferentes apontando pro mesmo antecessor via
`mark_as_replacement`) — sem isso, uma cadeia ramificada contaria mais de
uma vez.

`a_repor` não é uma subtração explícita de "faltas_perdoadas −
reposicoes_ja_agendadas" — é contagem de cadeias cujo terminal ATUAL é uma
falta/cancelamento-por-aluno perdoado (`falta_consome_credito = false`
efetivo). Assim que uma reposição é registrada, ela estende a MESMA cadeia
(decisão 2 — `cadeia_id` herdado) e vira o novo terminal, então a cadeia sai
da contagem automaticamente, por construção — a subtração da spec original
e essa contagem são equivalentes matematicamente, dado que toda reposição
sempre estende a cadeia em vez de existir como linha solta.

View `saldo_pacotes` repete a checagem de posse (aluno dono ou professor
dono) por dentro, em vez de confiar só no RLS que `packages` já tenha (ou
não) configurado fora deste repositório — nunca verificado neste projeto.

**Verificação: os 8 casos do CLAUDE.md, por script rodável — não por
leitura**, diferente da decisão 6. `supabase/verify_calcular_saldo_pacote.sql`
existe no repo; a lógica de cadeia é nova (não é extração de código
existente), então "conferir por leitura" não bastaria aqui. Ainda não
executado contra o banco — mesma ressalva.

**Status real (2026-09-07): APLICADA, NÃO VERIFICADA empiricamente.**
`0013_calcular_saldo_pacote.sql` já está na migration por causa da ordem de
dependência da Etapa 4 (`gerar_pacote_recorrencia`/`complete_booking`/
`mark_no_show` chamam `calcular_saldo_pacote()`), mas
`verify_calcular_saldo_pacote.sql` nunca foi rodado contra o banco — decisão
explícita de priorizar ver o fluxo funcionando pela tela (Etapa 5) antes de
fechar essa verificação por SQL. **Se aparecer saldo errado na tela
(restantes/a_repor errados, pacote não fechando em `finished`, etc.), este é
o PRIMEIRO lugar a olhar** — rode `verify_calcular_saldo_pacote.sql` para
isolar se o bug está no algoritmo da função ou em outro lugar (RPC de
geração, mapeamento TypeScript, tela).

**9. Um aluno pode ter mais de uma linha ativa em `aluno_recorrencia`
(2026-09-07, antes da Etapa 4).** Ex.: segunda 18h E quarta 19h — é a MESMA
rotina semanal do aluno, não duas rotinas independentes. Não dava pra tratar
cada linha como uma "trilha" independente com pacote próprio: o índice
`ux_packages_one_active_purchase_per_student` (decisão 5) já impede
fisicamente dois pacotes `active` não-trial simultâneos pro mesmo aluno —
gerar um segundo pacote pra um segundo dia fecharia o primeiro
automaticamente. `gerar_pacote_recorrencia` (0014) recebe um único
`p_slots jsonb` cobrindo TODOS os dias/horários ativos do aluno já
entrelaçados cronologicamente pelo cliente, e cria UM pacote só.
`packages.recorrencia_id` fica com o `recorrencia_id` do primeiro slot do
array — sem significado funcional além de "não nulo" (`calcular_saldo_pacote`
só checa `is not null`, nunca lê o conteúdo, ver comentário em 0013); o
vínculo que importa por aula é `bookings.recorrencia_id`, correto por linha.
Geração dos slots (quais datas, conversão BRT→UTC) é feita client-side com
`fromZonedTime`, reaproveitando o padrão já usado por
`saveAvailabilityInterval`/`upsert_availability_slots` — resolve o ponto em
aberto de fuso horário por reuso, sem reimplementar a conversão em PL/pgSQL.

**10. `mark_no_show`/`complete_booking` reescritas (0015) — status simétrico,
não incremental.** Quando `pacote_id is not null`, `used_classes`/`status` do
pacote são SOBRESCRITOS a partir de `calcular_saldo_pacote()` a cada chamada
— `status = 'finished' quando consumidas >= total, senão 'active'`. Isso é
diferente do caminho AUTOSSERVICO (que só avança pra `finished`, nunca volta,
porque ali `used_classes` é um contador incremental) — aqui faz mais sentido
ser simétrico porque `calcular_saldo_pacote()` já é "a única autoridade"
(decisão 4): cada chamada recalcula do zero a partir do estado real das
cadeias, então o `status` documentar fielmente esse recálculo é mais
consistente do que reproduzir a assimetria antiga por hábito. Ainda não há
como `consumidas` cair depois de bater `total` dentro do escopo da Etapa 4
(isso só existiria via reagendar/cancelar, Etapa 6) — decidido agora pra essa
migration não precisar ser tocada de novo naquela etapa.

**CORREÇÃO (2026-09-08, bug real encontrado em teste — 0017):** a
simetria acima (`status` recalculado do zero a cada chamada) tinha uma
consequência não prevista: se um pacote já `finished` (fechado por
`_create_package` ao gerar um pacote novo pro mesmo aluno, decisão 5) ainda
tiver algum booking com `pacote_id` apontando pra ele — uma aula órfã,
ainda `scheduled` —, concluir ou marcar falta nessa aula recalculava
`status` do zero e podia devolvê-lo a `active`. Não depende de nenhum outro
bug (duplicação de bookings, etc.) — basta a aula órfã existir. É
corrupção de estado disparando sozinha, não uma dívida aceitável.

0017 corrige: `used_classes` continua sempre sobrescrito (decisão 4 não
muda — "única autoridade", nunca deixar o número congelar mesmo num pacote
fechado), mas `status` só é escrito quando o valor ATUAL da linha é
`active`; se já não for, a linha mantém o que já tinha. `finished` com
`used_classes < total_classes` não é um estado novo (`_create_package` já
produzia isso pra `admin_grant`/`purchase` antes da RECORRENCIA existir) —
o que era novo e errado era esse `finished` conseguir voltar sozinho.
Reativar continua possível, só que exclusivamente via `undo_lesson_action`
(ação explícita do professor), nunca como efeito colateral. Rejeitar a
operação inteira (recusar concluir/marcar falta num pacote não-`active`)
foi descartado: a aula aconteceu de verdade e precisa ficar registrável
independente do ciclo de vida interno do pacote.

**GAP CONHECIDO, aceito conscientemente:** `undo_lesson_action` (0001) NÃO
foi reescrita nesta etapa — não estava no roteiro. Ela só resincroniza
`used_classes` quando acha uma linha em `credit_transactions` pra reverter; o
ramo de recorrência de `complete_booking`/`mark_no_show` nunca escreve em
`credit_transactions` (não é a fonte de autoridade), então desfazer uma
conclusão/falta de aula de recorrência volta o `status` do booking pra
`scheduled` (isso já acontece, incondicional, antes dessa checagem) mas NÃO
resincroniza `packages.used_classes` — fica desatualizado até a próxima
`complete_booking`/`mark_no_show` em qualquer aula do mesmo pacote.
`calcular_saldo_pacote()`/`saldo_pacotes` continuam corretos a qualquer
momento (são a autoridade); só a cópia materializada em `used_classes` é que
fica momentaneamente stale. Mesmo padrão do "crédito de trial parado"
(decisão 7): registrado aqui, não é bug pra "consertar" sem decisão — decidir
se `undo_lesson_action` precisa ser estendida antes da Etapa 6.

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
| 6 | `0013_calcular_saldo_pacote.sql` | `calcular_saldo_pacote(p_pacote_id)` + view de leitura (decisão 4), com testes — fecha a Etapa 3 sozinha | 3 — **APLICADA, NÃO VERIFICADA empiricamente** (verificação adiada pra depois de ver o fluxo pela tela, ver decisão 8) |
| 7 | `0014_gerar_pacote_recorrencia.sql` | RPC pública: valida a recorrência, chama `_create_package(..., 'recurrence', 'package')`, materializa N linhas em `bookings` (`cadeia_id` = próprio id, `pacote_id` = pacote recém-criado) | 4 — **APLICADA (2026-09-07)** |
| 8 | `0015_mark_no_show_complete_booking_recorrencia.sql` | `create or replace` de `mark_no_show`/`complete_booking` (decisão 7): coalesce de `falta_consome_credito`; quando `pacote_id is not null`, usa esse pacote diretamente (não a busca "mais antigo ativo") e sobrescreve `used_classes` via `calcular_saldo_pacote()`; `pacote_id is null` → comportamento idêntico ao atual. Testada junto com a 0014, com pacote de recorrência gerado de verdade — por isso vem DEPOIS dela, não antes (rodar antes seria inofensivo mas ficaria sem cobertura real por uma etapa inteira) | 4 — **APLICADA (2026-09-07)**, verificação empírica pendente pela tela (Etapa 5), não por SQL |
| 9 | `0016_gerar_pacote_recorrencia_overlap_check.sql` | `create or replace` de `gerar_pacote_recorrencia`: rejeita a geração inteira se algum slot se sobrepõe (intervalo real) a um booking `scheduled` do mesmo professor de OUTRO aluno — CAMADA 2 contra overbooking (ver seção própria abaixo) | 4 — **APLICADA (2026-09-08)** |
| 10 | `0017_fix_finished_package_resurrection.sql` | `create or replace` de `mark_no_show`/`complete_booking`: `status` só é escrito quando o valor atual é `active` — corrige um pacote `finished` conseguir voltar a `active` como efeito colateral de concluir/marcar falta numa aula órfã ligada a ele por `pacote_id` (ver seção própria abaixo) | 4 — **APLICADA (2026-09-08)** |
| 11 | `0018_reagendar_cancelar_aula.sql` | RPCs `reagendar_aula`/`cancelar_aula`, professor-only | 6 |
| 12 | `0019_aviso_ausencia.sql` | `bookings.aviso_ausencia_em`/`.aviso_ausencia_motivo` (adiado pra cá — não adicionar coluna que nenhuma função usa ainda) + função pro aluno registrar | 8 |

### Etapa 5 — tela (2026-09-07, sem migration nova)

Nova página `src/pages/admin/AlunoRecorrencia.tsx`
(`/admin/alunos/:studentId/recorrencia`), linkada por um card novo em
`AlunoDetalhe.tsx` (mesmo padrão do card "Perfil de Boxe" — aditivo, não
mexe no resto da página). Gerencia `aluno_recorrencia` (listar, criar,
ativar/desativar — sem editar linha existente, ver "Mudança de recorrência"
abaixo) e chama `gerarPacoteRecorrencia()`, que lê as linhas ativas, calcula
os slots (client-side, `fromZonedTime`, decisão 9) e chama a RPC
`gerar_pacote_recorrencia`. Mostra o saldo (`saldo_pacotes`) quando o pacote
ativo do aluno é `origin === 'recurrence'`.

Novas funções em `api.ts`: `getAlunoRecorrencias`, `createAlunoRecorrencia`,
`setAlunoRecorrenciaAtivo`, `gerarPacoteRecorrencia`, `getSaldoPacote`.
`mapBooking`/`mapPackage` passam a popular os campos de recorrência que já
existiam no tipo mas ainda não eram lidos das linhas do banco.

**Este é o primeiro teste real ponta a ponta do fluxo inteiro** (Etapa 1→5)
— gerar um pacote pela tela e marcar uma falta é o que efetivamente
exercita `_create_package`, `gerar_pacote_recorrencia`,
`calcular_saldo_pacote()` e o `mark_no_show`/`complete_booking` reescritos
juntos, pela primeira vez. Migrations 0008–0015 precisam estar aplicadas no
banco antes de testar.

**Confirmado pelo teste real (2026-09-07): as aulas foram geradas e
aparecem na lista do aluno e na agenda do professor.** Etapas 1-5
funcionam ponta a ponta.

### Overbooking entre RECORRENCIA e AUTOSSERVICO (2026-09-08)

**Dívida conhecida, registrada, não corrigida por completo — só mitigada.**
Descoberta ao revisar por que a tela "Agendar" poderia oferecer um horário
já ocupado por uma aula de recorrência. `pg_get_viewdef('public.available_slots')`
(view preexistente, fora deste repo) revelou:

```sql
SELECT s.id AS slot_id, s.admin_id, s.start_time, s.end_time
FROM availability_slots s
LEFT JOIN bookings b
  ON b.start_time = s.start_time AND b.end_time = s.end_time
 AND b.admin_id = s.admin_id AND b.status = 'scheduled'::booking_status
WHERE b.id IS NULL
```

Dois problemas reais nessa view, nenhum causado por este trabalho mas
ambos relevantes pra RECORRENCIA:

1. **Exclui por IGUALDADE exata de horário, não por sobreposição de
   intervalo.** Um slot publicado 18:00–19:00 e um booking 18:30–19:30 não
   se excluem mutuamente — os dois aparecem como independentes pra essa
   view, mesmo se sobrepondo fisicamente 30 minutos. Antes da RECORRENCIA
   isso não importava muito na prática (a própria grade de disponibilidade
   só publica blocos de 1h em hora cheia, então nunca colide parcialmente
   consigo mesma) — mas dá margem pra overbooking assim que existe uma
   segunda fonte de bookings (a RECORRENCIA) com horário livre.
2. **Só considera `status = 'scheduled'`.** Um booking `pending_confirmation`
   não esconde o slot — dois alunos podem pedir o mesmo horário antes do
   professor aprovar um dos dois. Pré-existente, sem relação com
   RECORRENCIA, registrado aqui só porque apareceu na mesma leitura.

**Mitigação implementada (2026-09-08), em duas camadas — nenhuma resolve a
view em si, então o ponto 2 acima continua em aberto:**

- **CAMADA 1 — restringir a entrada do lado da RECORRENCIA.**
  `AlunoRecorrencia.tsx` trava `horario` em hora cheia e `duracaoMinutos`
  em 60 (removidas as opções 30/45/90 que existiam desde a Etapa 5).
  Deliberado — reduz a flexibilidade que a recorrência prometia em troca
  de nunca depender de sobreposição parcial escapar da igualdade exata da
  view: uma recorrência agora só pode coincidir EXATAMENTE com um slot
  publicado (o caso que a view já cobre) ou não coincidir nada. **Só
  resolve o UI** — é um limite de tela (`createAlunoRecorrencia` continua
  aceitando qualquer `horario`/`duracaoMinutos` via `insert` direto,
  protegido só por RLS de posse, sem `CHECK` no banco). Se alguém
  flexibilizar a grade da recorrência no futuro (ex.: reintroduzir
  30/45/90), a view precisa ser corrigida pra sobreposição real ANTES —
  não é opcional nem contornável de outro jeito.
- **CAMADA 2 — validar sobreposição no momento da geração.**
  `gerar_pacote_recorrencia` (0016, `create or replace` sobre 0014) REJEITA
  a geração inteira (nada é escrito) se algum slot de `p_slots` se
  sobrepõe, por intervalo real (`novo.start < existente.end and novo.end >
  existente.start`), a um booking `scheduled` do MESMO professor de OUTRO
  aluno. Não conta contra bookings do PRÓPRIO aluno (renovar um pacote
  enquanto aulas antigas da recorrência anterior ainda estão `scheduled`
  não é overbooking). Rejeitar em vez de avisar depois foi escolha
  deliberada (não uma opção descartada por acaso): como a checagem roda
  ANTES de qualquer `insert`/`update`, "nada foi gerado ainda" é garantido
  pela ordem das operações dentro da mesma função, sem precisar desfazer
  estado parcial. A mensagem de erro é texto em português direto (não um
  código curto tipo `only_admin`) porque o front (`gerarPacoteRecorrencia`
  em `api.ts`) só repassa `error.message` cru pro `toast.error` — não existe
  camada de tradução de erro neste app.
- Cobre exatamente o cenário descrito: duas recorrências de ALUNOS
  DIFERENTES do mesmo professor na mesma célula da grade. A CAMADA 1
  sozinha não cobre isso — ela só garante alinhamento à grade, não unicidade
  dentro da grade.

**O que continua sem solução:** o ponto 2 (view não considera
`pending_confirmation`) e o caso de alguém escrever em `aluno_recorrencia`
fora da tela (contornando a CAMADA 1 via chamada direta à API).

### Unificação do card de pacote (2026-09-08)

Confirmado: não existem "dois tipos de pacote" no modelo — um pacote de
recorrência é uma linha comum de `packages`, `origin = 'recurrence'`, sujeita
ao mesmo índice de "um ativo não-trial por vez" que `purchase`/`admin_grant`
(decisão 5). `activePackageForStudentRow` (`api.ts`) já buscava o pacote
ativo sem filtrar por `origin` — o único lugar que tratava recorrência como
entidade paralela era a TELA: `AlunoRecorrencia.tsx` desenhava um segundo
card de saldo ao lado do card "Pacote ativo" que já existe em
`AlunoDetalhe.tsx`, dando a impressão de dois pacotes onde só existe um.

Corrigido extraindo `src/components/ActivePackageCard.tsx` — um componente
só, recebendo `pkg`/`credits`/`saldo?` como props, sem buscar dado sozinho.
`AlunoDetalhe.tsx` e `AlunoRecorrencia.tsx` renderizam a MESMA instância
(nenhuma versão própria em nenhuma das duas). O badge de origem
("Experimental"/"Compra"/"Concedido"/"Recorrência") e a linha "N aguardando
reposição" ficam dentro do componente, condicionais a `saldo` existir — não
a qual tela está renderizando. `saldo` (`saldo_pacotes`) só é buscado por
quem chama, quando `pkg.origin === 'recurrence' && pkg.status === 'active'`
— o card em si não decide isso.

### "Crédito disponível" não existe na RECORRENCIA (2026-09-08)

Achado em teste real: aluno com recorrência ativa ficava com crédito
disponível ZERO permanentemente, e o alerta "peça a renovação" sempre
ligado. Diagnosticado por leitura do corpo real de
`available_credits_for_student` (RPC pré-existente, confirmada via
`pg_get_functiondef`, NÃO alterada — continua servindo o AUTOSSERVICO
corretamente):

```sql
select greatest(0,
  coalesce(sum(total_classes - used_classes) dos pacotes 'active', 0)
  - coalesce(count(*) de bookings 'scheduled'/'pending_confirmation' futuros, 0)
);
```

Pra um pacote de recorrência, as N aulas nascem TODAS `scheduled` de uma vez
(Etapa 4) — "aulas restantes" e "reservas futuras" são exatamente o MESMO
conjunto de linhas, então a subtração dá zero por construção, durante toda a
vida do pacote (concluir uma aula tira 1 de cada lado da subtração
igualmente). Não é bug de cálculo — é um conceito ("quanto ainda posso
agendar") que não existe pra quem não se auto-agenda. O número certo é
"aulas restantes no pacote".

**Decisão:** quando o pacote ativo do aluno tem `origin === 'recurrence'`,
a Home do aluno (`student/Home.tsx`) para de ler `available_credits_for_student`
pra esse card e passa a ler `saldo_pacotes.restantes` (decisão 4 — única
autoridade, não `pkg.totalClasses - pkg.usedClasses`, que tem a lacuna já
registrada do `undo_lesson_action`). `getStudentHome()` (`api.ts`) ganha um
campo novo, `recorrenciaSaldo: SaldoPacote | null` — busca condicional, só
quando há pacote `active` de recorrência; `credits` continua exatamente
como sempre foi pra todo o resto.

Rótulo/número/alerta do card de crédito ficam condicionais a
`recorrenciaSaldo`: "Aulas restantes" em vez de "Créditos disponíveis",
alerta de poucas aulas a partir de `restantes <= 2` (mesmo limiar de sempre,
fonte diferente), texto do alerta sem "peça a renovação" (o aluno não pede
nada nesse fluxo — quem recebe o alerta de "restam 2 ou menos aulas" é o
professor, invariante já registrada acima).

**Botão principal da Home também ramifica**, não só por causa do número
zerado — o botão nunca fez sentido pra quem não se auto-agenda, e deixar
"Solicitar pacote" (destino `/app/pacotes`) continuar aparecendo por
acidente (por `credits === 0` bater sempre) escondia isso. Enquanto
`modo_agendamento`/Etapa 7 não existe pra separar as telas de verdade: com
`recorrenciaSaldo` presente, o botão vira "Ver minhas aulas" → `/app/historico`
(mesma tela de "MINHAS AULAS" que já lista os agendamentos do aluno,
inclusive futuros — aba "Próximas" já existente), com o texto de apoio
"Suas aulas já estão marcadas pelo professor" em vez de "Escolha dia e
horário em 2 toques".

### Bug de ordenação em "Minhas Aulas" (2026-09-08)

Achado ao investigar o item acima (não relacionado à RECORRENCIA — afeta
qualquer aluno). `getStudentBookingHistory` (`api.ts`) buscava as aulas com
`order by start_time desc` uma única vez e reusava esse resultado pras três
abas (Próximas/Anteriores/Todas) só filtrando depois no cliente. Pra
"Anteriores"/"Todas" isso é a ordem certa (mais recente primeiro); pra
"Próximas" é a ordem ERRADA — mostrava a aula mais DISTANTE no topo em vez
da mais próxima. Corrigido: a query agora ordena `ascending: tab ===
'proximas'` — só essa aba passa a pedir ordem crescente, as outras duas
continuam exatamente como sempre foram.

**Outras listas verificadas, NÃO afetadas** (mesma varredura, por pedido
explícito):
- `getStudentHome`'s "próxima aula" — query dedicada, já `ascending: true`
  + `limit(1)`, correta desde sempre.
- `getAdminAgendaForDay` (agenda do professor por dia) — ordena por hora
  ascendente explicitamente, sem relação com esse bug.
- `getAdminStudentDetail`'s "ÚLTIMAS AULAS" — descendente por design
  (recência, não "próximas"), correto como está.
- `getAdminBookingHistory`/`AdminHistorico.tsx` — também descendente,
  mas essa tela é uma auditoria (filtros por status, não abas
  Próximas/Anteriores) — não tem a mesma promessa de "mais próxima primeiro"
  que motivou a correção acima. Deixado como está; sinalizar se algum dia
  precisar de uma aba "Próximas" análoga.

### Pontos ainda em aberto

Decidir antes de chegar na etapa correspondente:

- **Feriados** — ao gerar o pacote, aula que cai em feriado: gerar e sinalizar
  para o professor resolver, ou pular? (recomendação: gerar e sinalizar; pular
  automaticamente esconde a decisão do usuário) **AINDA SEM DECISÃO.** A
  implementação da Etapa 4/5 (2026-09-07) não trata feriados de forma
  nenhuma — gera todas as ocorrências futuras do(s) dia(s) da semana sem
  pular nem sinalizar nada. Não há tabela de feriados neste app hoje.
- ~~**Fuso horário**~~ — RESOLVIDO (2026-09-07, decisão 9): a geração de
  slots da Etapa 4/5 é feita client-side, reaproveitando exatamente o padrão
  de `saveAvailabilityInterval`/`upsert_availability_slots`
  (`fromZonedTime`/`TIMEZONE` de `api.ts`), sem reimplementar a conversão em
  PL/pgSQL.
- **Mudança de recorrência** — ao editar o template, aplica ao pacote em
  andamento ou só ao próximo? Ainda sem decisão — a Etapa 5 implementada em
  2026-09-07 permite ativar/desativar linhas de `aluno_recorrencia` e criar
  novas, mas não tem UI de "editar" uma linha existente; o próximo pacote
  gerado sempre lê o conjunto ATUAL de linhas `ativo = true` no momento da
  geração (nunca retroage sobre pacotes/aulas já materializados).
