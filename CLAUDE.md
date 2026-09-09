## ⚠️ ANTES DE QUALQUER COISA: confirme em que repositório você está

**Este repositório é `/home/claude/bahia-boxe`** (`origin =
github.com/designlferreira/bahia-boxe`, branch `main`).

Existe um SEGUNDO checkout no mesmo container, **`/home/claude/repo`**, que
NÃO tem relação nenhuma com este trabalho: é um scaffold de handoff do Claude
Design (commit único `a6a9651`, sem remote, backend mock em `localStorage`,
seed com "Marina Souza", migrations `0001_init.sql`/`0002_views_and_rpcs.sql`).
Ele se parece o suficiente com este projeto para enganar — mesmo nome de
domínio, mesmos nomes de arquivo (`src/integrations/backend/api.ts`,
`src/pages/admin/Agenda.tsx`), mesmas telas — mas o schema é outro, não tem
`cancelado_por`, não tem recorrência e não tem banco real.

**O shell reseta o cwd para `/home/claude/repo` a cada comando.** Isso já
causou uma sessão inteira de análise sobre o repositório errado (2026-09-08).
Portanto:

1. **PRIMEIRO PASSO de toda sessão nova, antes de afirmar qualquer coisa
   sobre o código:** rodar
   `cd /home/claude/bahia-boxe && git remote -v && git log --oneline -3 && ls supabase/migrations/`
   e confirmar que o remote é `designlferreira/bahia-boxe` e que as migrations
   vão até pelo menos `0018_*`. Se o remote vier vazio e só houver
   `0001_init.sql`, você está no checkout errado.
2. **Todo comando usa caminho absoluto** começando em `/home/claude/bahia-boxe`
   — nunca caminho relativo, nunca confiar no cwd herdado. Um `cd` dentro de
   um comando não persiste para o próximo.
3. O banco é um **Supabase real** com as migrations aplicadas, não um mock.
   Ler o corpo de função aplicado via `pg_get_functiondef` quando a pergunta
   for sobre o que está no banco — o arquivo da migration é a intenção, o
   banco é o fato.

---

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

**A regra de crédito é uma WHITELIST, e portanto FAIL-OPEN (nota de
2026-09-08).** O único caso de `cancelled` que cobra crédito é
`cancelado_por = 'aluno'`; todo o resto cai no `else 0`. Consequência: um
valor errado em `cancelado_por` — `'Aluno'`, `'regeneração'` com acento,
qualquer typo — significa silenciosamente "não consome". Erra a favor do
aluno, então não é urgente, mas também não é detectável por leitura de
saldo (o número parece plausível). **A rede que pega isso é o CHECK
constraint da coluna**, estendido na 0019 para exatamente
`in ('professor', 'aluno', 'regeneracao')` e mais nada (NULL continua
passando, porque nullable = "não cancelada"): uma escrita com typo é
REJEITADA na hora, nunca chega a virar um "não consome" silencioso. Se
algum dia a lista de valores crescer, o CHECK é o lugar que precisa crescer
junto — não a whitelist da 0013.

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
| 11 | `0018_gerar_pacote_recorrencia_cancela_anteriores.sql` | `create or replace` de `gerar_pacote_recorrencia`: cancela (`cancelado_por='professor'`) as aulas futuras `scheduled` do PRÓPRIO aluno ligadas a um pacote de recorrência anterior, antes de gerar as novas — evita duplicação ao regenerar (ver seção própria abaixo) | 4 — **APLICADA (2026-09-08)** |
| 12 | `0019_cancelado_por_regeneracao.sql` | `cancelado_por` ganha o terceiro valor `'regeneracao'` (CHECK estendido); `gerar_pacote_recorrencia` passa a gravá-lo e a NÃO cancelar reposições (`replacement_for_booking_id is not null`); **backfill** das linhas já canceladas pela 0018 (`'professor'` → `'regeneracao'`) — único UPDATE de dados do arquivo (ver seção própria abaixo) | 4 |
| 13 | `0020_reagendar_cancelar_aula.sql` | RPCs `reagendar_aula`/`cancelar_aula`, professor-only + **reordenação** de `complete_booking`/`mark_no_show` (ramo `pacote_id` antes do early-return de `is_replacement`) — ver seção própria abaixo | 6 |
| 14 | `0021_undo_recorrencia_e_overlap_do_proprio_aluno.sql` | `undo_lesson_action` ganha o ramo de recorrência com **reabertura condicionada** (assimetria deliberada com a 0017 — ver seção própria); `gerar_pacote_recorrencia` cancela a grade ANTES de checar sobreposição e passa a checar também contra o próprio aluno, com mensagens distintas | 6 |
| 15 | `0022_modo_agendamento.sql` | `profiles.modo_agendamento` (nullable, `check in ('autosservico','recorrencia')`) + RPC `modo_agendamento_efetivo(p_professor_id)` | 7 — **APLICADA (2026-09-08), idempotência corrigida e CONFIRMADA por reexecução real (2026-09-09)** — rodar de novo devolveu "Success", coluna/CHECK/função intactos; verificação de comportamento por script ainda pendente (`supabase/verify_modo_agendamento.sql`) |
| 16 | `0023_aviso_ausencia.sql` | `bookings.aviso_ausencia_em`/`.aviso_ausencia_motivo` (adiado pra cá — não adicionar coluna que nenhuma função usa ainda) + função pro aluno registrar — **renumerada de 0022 pra 0023** quando a Etapa 7 (linha acima) tomou o número 0022 primeiro | 8 |

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

**CORREÇÃO (2026-09-08, achado em teste): a implementação acima recriou o
mesmo problema que `ActivePackageCard` existia pra resolver.** Em vez de
usar o componente compartilhado, editei um bloco PRÓPRIO já existente em
`Home.tsx` (headline + barra + linha "usadas/disponíveis") — uma terceira
implementação do mesmo conceito, nunca migrada pra `ActivePackageCard`
quando ele foi criado (`AlunoDetalhe.tsx`/`AlunoRecorrencia.tsx` já
usavam). Na tela isso apareceu como o card de pacote "duplicado" — não
literalmente dois cards, mas a mesma informação (usadas/restantes/origem)
calculada e escrita duas vezes por dois caminhos de código diferentes, uma
receita garantida pra divergir de novo no futuro.

Corrigido de vez: TODA a lógica condicional a `saldo` (headline
`saldo.restantes` vs `credits`, rótulo, unidade, badge de origem, nome do
template, alerta de poucas aulas) mudou de `Home.tsx` pra dentro do próprio
`ActivePackageCard` — o componente agora é auto-suficiente, só recebe
`pkg`/`credits`/`saldo?` e decide tudo sozinho. `Home.tsx`, `AlunoDetalhe.tsx`
e `AlunoRecorrencia.tsx` renderizam a MESMA instância, sem nenhuma versão
paralela em nenhum dos três. Efeito colateral bom: o alerta de "poucas
aulas" (que só existia em `Home.tsx`) agora aparece também pro professor
nas duas telas admin — satisfaz de graça o invariante já registrado
"Alertar o professor quando restarem 2 ou menos aulas no pacote" (texto do
alerta neutralizado pra fazer sentido pras duas audiências: "considere
renovar o pacote" em vez de "peça a renovação", que só fazia sentido
vindo do aluno).

**Lição pra não repetir:** quando um componente compartilhado é criado pra
unificar duas telas, qualquer ajuste de comportamento SUBSEQUENTE (como o
"crédito disponível" desta seção) precisa entrar DENTRO do componente, não
num dos lugares que o chamam — mesmo que só um lugar precise do ajuste no
momento.

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

### Seletor de data de início da recorrência (2026-09-08)

Motivação: `computeRecorrenciaSlots` sempre partia de "agora" — sem
confirmar bug nenhum aí (a geração testada estava correta, ver seção
"D RESOLVIDO" da conversa), mas o professor não tinha como expressar
"combinei com o aluno que começamos dia 15".

**Escolha de UI: chips de datas válidas, não um calendário em grade.** O
pedido original falava em "calendário", mas este app não tem nenhum
componente de calendário-mês em lugar nenhum — todo seletor de dia/hora
existente (`Disponibilidade.tsx`, o próprio seletor de hora da Etapa 5) usa
fileira horizontal de chips roláveis. Uma fileira com as próximas ~8 semanas
de datas válidas (só as que caem em algum dia fixo ATIVO) cobre o caso de
uso descrito ("dia 15" está entre as primeiras opções) sem introduzir um
padrão de UI novo só pra isso. Se no futuro for preciso escolher uma data
muito mais distante que não caiba na fileira, aí sim vale um calendário de
verdade — registrado aqui, não implementado agora por falta de necessidade
concreta.

Implementação: `getRecorrenciaStartDateOptions(recorrencias, weeksAhead=8)`
(`api.ts`, nova, exportada) — mesmo filtro de "horário ainda não passado"
que `computeRecorrenciaSlots` já usava, aplicado a TODAS as linhas ativas
(união dos dias da semana). `computeRecorrenciaSlots`/`futureWeekdayDates`
ganham um parâmetro `fromInstant` (default: `new Date()`) — só desloca o
limite inferior da busca; nenhuma outra regra muda. `gerarPacoteRecorrencia`
ganha `startDate?: string` opcional, repassado como `fromInstant` via
`fromZonedTime` — omitido, comportamento idêntico ao de antes (a partir de
agora). A tela sempre pré-seleciona a primeira opção (a mais próxima), sem
exigir que o professor escolha manualmente se não quiser.

### Duplicação de bookings ao regenerar pacote (2026-09-08)

Achado na mesma rodada de teste que motivou a correção do item A. Como
`computeRecorrenciaSlots` não sabe que o aluno já tem aulas futuras
`scheduled` de um pacote de recorrência anterior ainda não esgotado,
regenerar produzia datas idênticas às já agendadas — o aluno ficava com
duas aulas `scheduled` no mesmo horário, visível e confuso na agenda.

Opções descartadas: (1) rejeitar a regeneração inteira quando há aulas
futuras pendentes — travaria uma renovação legítima, pior que o problema;
(3) deixar como dívida — mesmo com A corrigido (pacote não ressuscita mais
sozinho), o aluno continuaria vendo duas aulas marcadas pro mesmo horário.

**Escolhida a opção 2**, com uma correção sobre a proposta original: as
aulas futuras `scheduled` do PRÓPRIO aluno ligadas a QUALQUER pacote de
recorrência (`pacote_id is not null` — não só o pacote imediatamente
anterior, cobre também sobras acumuladas de gerações antigas de antes desta
correção existir) são canceladas com `cancelado_por = 'professor'` (0018,
`create or replace` sobre `gerar_pacote_recorrencia`) antes de gerar as
novas. Não é escolha arbitrária: "cancelado por professor nunca consome
crédito" já é a regra de crédito existente e testada (tabela em "Crédito —
regra única") — as aulas descartadas não viram falta nem gastam nada do
pacote velho. Só aulas FUTURAS e `scheduled` são candidatas; passadas,
`completed`, `no_show`, `cancelled` ou `rescheduled` ficam intactas — são o
registro real do que aconteceu, não sobra de agendamento.

O cancelamento roda DENTRO da mesma função/transação, antes de
`_create_package` e dos inserts em `bookings`: se qualquer checagem
posterior falhar (recorrência inválida, CAMADA 2 de overlap), a exceção
desfaz o cancelamento junto — nunca fica "cancelado mas sem pacote novo".

**A tela avisa antes, nunca silenciosamente** (exigência explícita): nova
`countAulasCancelaveisRecorrencia(studentId)` conta exatamente o que a RPC
cancelaria; se `> 0`, o clique em "Gerar" abre um `ConfirmDialog`
("N aula(s) do pacote anterior... serão canceladas... Continuar?") antes de
chamar a mutation; se `0` (primeira geração), gera direto sem diálogo — não
há nada a avisar.

**Escopo aceito, não resolvido:** o pacote antigo (agora `finished`) não
tem `used_classes` resincronizado por este cancelamento — só
`complete_booking`/`mark_no_show` (0017) tocam nisso. Mesma classe da
dívida já registrada pro `undo_lesson_action` (decisão 10):
`calcular_saldo_pacote()`/`saldo_pacotes` continuam corretos a qualquer
momento; só a cópia materializada de um pacote já fechado (que não é mais
"o pacote ativo" de ninguém) pode ficar momentaneamente desatualizada.

### `cancelado_por = 'regeneracao'`, o terceiro valor (2026-09-08, 0019)

A 0018 marcava as aulas descartadas como `cancelado_por = 'professor'`,
colapsando dois fatos que são diferentes e cuja diferença é observável:

- **cancelamento real pelo professor** — o aluno perdeu uma aula que ia
  acontecer. É reponível legitimamente.
- **descarte por regeneração** — a aula foi substituída por outra na grade
  nova. Nunca chegou a ser um compromisso; não há o que repor.

Sintoma concreto: `getReplaceableBookingsForStudent` filtra por status
(`no_show`/`cancelled`), então as aulas descartadas apareciam como
candidatas a reposição. **O filtro certo é por MOTIVO, não por status** —
filtrar `cancelled` inteiro tiraria junto o cancelamento real do professor,
que deve continuar reponível. Daí o terceiro valor.

Crédito não muda: a regra da 0013 só cobra em
`cancelled + cancelado_por = 'aluno'`, então `'regeneracao'` já entra como
"nunca consome" por construção, sem tocar em `calcular_saldo_pacote`.

**Reposição órfã — decisão tomada ANTES de ser alcançável.** A mesma 0019
faz a regeneração pular linhas com `replacement_for_booking_id is not null`.
Hoje isso é inócuo (nenhuma reposição tem `pacote_id`, então nenhuma entra
no `update` de qualquer jeito), mas a Etapa 6 vai criar sucessores DENTRO do
pacote e aí uma reposição já combinada com o aluno passaria a ser varrida
por uma regeneração. **Decidido agora, uma linha, antes do buraco abrir:**
reposição é compromisso individualizado, não parte da grade que está sendo
substituída — se precisa sair, o professor cancela explicitamente. Registrado
aqui para que a Etapa 6 não precise redescobrir isso.

**Backfill (o único UPDATE de dados da 0019).** As linhas que a 0018 já
tinha cancelado ficaram marcadas `'professor'`; sem reclassificá-las, elas
continuariam aparecendo como candidatas a reposição (o filtro novo mira
`'regeneracao'`). A reclassificação é precisa, não um chute: verificado por
grep no repositório inteiro que **nenhum outro caminho jamais escreveu
`cancelado_por`** — `cancelBooking` (aluno), `rejectBooking`,
`mark_as_replacement`, `complete_booking`/`mark_no_show` e a UI admin não
tocam a coluna. Toda linha com `'professor'` hoje veio da regeneração, então
o backfill não pode "roubar" um cancelamento manual do professor: esse
caminho ainda não existe. **Quando a Etapa 6 criar cancelamento manual
gravando `'professor'`, este backfill deixa de ser seguro e não pode ser
rodado de novo.**

### Onde as aulas descartadas precisam sumir (2026-09-08)

Quatro consultas em `api.ts` liam `bookings` sem filtrar por motivo de
cancelamento. Todas passaram a usar a constante `SEM_DESCARTE_DE_REGENERACAO`
(`"cancelado_por.is.null,cancelado_por.neq.regeneracao"`), via `.or(...)`:

- **`getReplaceableBookingsForStudent`** — descarte de regeneração não é
  reponível (ver seção acima). Filtro por MOTIVO, não por status.
- **`getAdminStudentDetail`** (janela `limit(6)` de "ÚLTIMAS AULAS").
- **`getStudentBookingHistory`** — mais: na aba "Próximas", também exclui
  `cancelled` inteiro no filtro client-side ("próxima" é o que ainda vai
  acontecer, e aula cancelada não vai). Nas abas de histórico, cancelamento
  pelo professor CONTINUA aparecendo (é um fato que o aluno viveu); só o
  descarte por regeneração some.
- **`deriveNotifications`** — o `.or(...)` entra antes do `limit(40)`: sem
  ele, as linhas descartadas consomem a janela e empurram pra fora os
  eventos que viram notificação de verdade.

**Por que `.or(is.null, neq)` e não `.neq(...)` sozinho:** em SQL,
`cancelado_por <> 'regeneracao'` é NULL (não `true`) nas linhas com
`cancelado_por` nulo — que são a esmagadora maioria (todo o AUTOSSERVICO).
Um `.neq` puro descartaria justamente essas. Armadilha de lógica ternária,
não preferência de estilo.

**Consultas deliberadamente NÃO filtradas:** as que já excluem por status
(`ACTIVE_STATUSES`, `.eq("status","scheduled")`, `.neq("status","cancelled")`
— um descarte é `cancelled`, então nunca entra), as leituras de uma linha
específica por id (detalhe de aula: se alguém abre o link direto, mostrar a
aula é o certo) e `getAdminBookingHistory` (tela de auditoria, com filtro
"Canceladas" próprio — ali o descarte é justamente o que se quer poder ver).

**Frequência do aluno — corrigida junto, era número errado, não só ruído.**
`AlunoDetalhe.tsx` calculava `completed / history.length` sobre a janela de
6 linhas de qualquer status. Dois erros somados: o denominador incluía aulas
`scheduled`/`cancelled`, e a janela em si é ordenada por `start_time desc` —
com recorrência ela é composta SÓ de aulas futuras ainda não realizadas, o
que zerava a frequência de todo aluno em recorrência. Agora
`getAdminStudentDetail` devolve `completedCount`/`noShowCount` (dois
`count: "exact", head: true`, sem transferir linha) sobre TODAS as aulas do
aluno, e a tela calcula `completed / (completed + faltas)`. O card "Faltas"
usa o mesmo count, pelo mesmo motivo.

Observação registrada, não corrigida (fora do escopo pedido): a lista
"ÚLTIMAS AULAS" continua sendo as 6 linhas mais recentes por `start_time`
desc, o que com recorrência significa aulas FUTURAS, não "últimas". O número
agora está certo; o rótulo da lista é que segue impreciso.

### Etapa 6 — reagendar e cancelar (2026-09-08, 0020)

**`reagendar_aula(p_booking_id, p_novo_inicio, p_novo_fim) returns uuid`** —
marca a original como `rescheduled` e cria uma linha NOVA com
`replacement_for_booking_id` = original e `cadeia_id` HERDADO. Nunca edita a
original. Valida no serviço: admin, dono da aula, aula `scheduled`, fim
depois do início, início no futuro, e sobreposição real de intervalo com a
agenda do professor (excluindo a própria linha — senão mover 18:00-19:00 pra
18:30-19:30 colidiria consigo mesma). Aqui NÃO há exclusão por aluno: dois
alunos no mesmo horário e o mesmo aluno duas vezes são igualmente conflito.
A duração é preservada da aula original (a tela só escolhe dia e hora de
início) — remarcar move a aula, não a encurta.

`cadeia_id` nulo é tratado: `schedule_booking` (AUTOSSERVICO) não preenche a
coluna, então aulas criadas DEPOIS do backfill da 0011 têm `cadeia_id` nulo.
Nesse caso a própria original vira raiz (`coalesce(cadeia_id, id)`), senão a
contagem de remarcações agruparia por NULL.

**`cancelar_aula(p_booking_id, p_cancelado_por)`** — exige o motivo porque o
motivo muda o crédito. A RPC aceita só `'professor'`/`'aluno'` e **rejeita
`'regeneracao'`**: aquele é valor interno, escrito só por
`gerar_pacote_recorrencia`. Na tela a escolha É a ação (um Sheet com as duas
opções e a consequência de crédito de cada uma escrita), não um
`ConfirmDialog` de um botão só.

Ambas ressincronizam `used_classes`/`status` via `calcular_saldo_pacote()`
quando `pacote_id is not null`, com a mesma regra da 0017 (status só é
escrito quando o valor atual é `active`) — decisão 4: todo RPC que muda
status de booking ressincroniza a cópia materializada.

**Reordenação em `complete_booking`/`mark_no_show` (necessária, não
cosmética).** Até a 0017, `if v_is_replacement then return; end if;` vinha
ANTES do ramo `pacote_id is not null`. Consequência: uma aula de recorrência
marcada como reposição saía pela porta do AUTOSSERVICO e **nunca**
ressincronizava `used_classes`. Isso já era alcançável antes da Etapa 6 (o
professor pode marcar uma aula de recorrência como reposição pelo
`ReplacementPickerSheet`), e a Etapa 6 tornaria sistemático — todo sucessor
de reagendamento nasce com `is_replacement = true` (decisão 2). Agora o ramo
de recorrência vem primeiro: pra quem tem `pacote_id`, quem decide crédito é
a cadeia e `is_replacement` é irrelevante. Pra `pacote_id is null` (todo o
AUTOSSERVICO) nada muda — o early-return continua exatamente onde estava.

**Contagem de remarcações na tela.** `getAdminBookingDetail` devolve
`remarcacoes` = linhas da cadeia − 1. O booking passou a vir da TABELA e não
da view `booking_history_app`: a view é anterior às colunas da 0011 e não as
expõe, então ler dali devolveria `cadeiaId` nulo. Da view aproveitamos só o
`student_name`, que ela resolve server-side (RLS impede o join no cliente).

### `undo_lesson_action` e a assimetria com a 0017 — NÃO UNIFORMIZAR (0021)

`undo_lesson_action` era a última das quatro RPCs de ciclo de vida da aula
ainda mexendo em `used_classes` só à moda antiga. Para uma aula de
recorrência ela não achava nada no ledger (o ramo de recorrência de
`complete_booking`/`mark_no_show` nunca escreve em `credit_transactions`) e
retornava ali: o status do booking voltava, a cópia materializada não. A
0021 dá a ela o mesmo ramo das outras três.

**A regra de `status` é DIFERENTE da 0017/0020, de propósito. Quem ler as
duas lado a lado vai achar que é inconsistência e vai querer uniformizar —
não é, e não deve.**

| | `complete_booking` / `mark_no_show` (0017/0020) | `undo_lesson_action` (0021) |
|---|---|---|
| Regra | `status` só é escrito quando já é `active` | reabre `finished` → `active` sob duas condições |
| Por quê | a ação pode ser **incidental** sobre uma aula órfã de um pacote já substituído — concluir uma aula solta não pode ressuscitar o pacote antigo | a ação é **explícita** do professor sobre AQUELE pacote — desfazer a conclusão que fechou o pacote deve reabri-lo |

A reabertura não é cega. Duas condições a barram:

- `consumidas >= total` → não reabre: o pacote continua cheio.
- existe OUTRO pacote `active` não-trial do mesmo aluno → não reabre: esse
  pacote foi **substituído**, não esgotado. O predicado é literalmente o do
  índice `ux_packages_one_active_purchase_per_student`; sem ele, um
  `status = 'active'` cego daria erro de chave duplicada na cara do
  professor, sem explicação nenhuma — erro, não corrupção, mas ainda assim
  o caminho errado.

Só quando as duas falham (fechou por exaustão e ninguém o substituiu) o
pacote volta a `active`. O resync de `used_classes` acontece SEMPRE,
independente do que o `status` faça — decisão 4 vale aqui como nas outras
três.

O caminho AUTOSSERVICO (`pacote_id is null`) segue byte-idêntico ao de 0001,
com `status = 'active'` incondicional: ali o ledger é a autoridade e o
estorno só existe se houve cobrança naquele pacote.

### Camada 2 revisada: cancelar antes de checar (0021)

A exclusão `b.student_id <> p_aluno_id` da Camada 2 (0016) existia por um
motivo específico: `computeRecorrenciaSlots` não consulta bookings
existentes, então a grade anterior do próprio aluno sempre colidiria consigo
mesma e toda regeneração seria recusada. **Cancelar a grade PRIMEIRO torna a
exclusão desnecessária** — depois do cancelamento, as únicas linhas futuras
`scheduled` do próprio aluno que sobram são as que a regeneração
deliberadamente não toca:

- reposições/remarcações (`replacement_for_booking_id is not null`, 0019);
- aulas do AUTOSSERVICO que o próprio aluno agendou (`pacote_id is null`).

Ambas são conflito real se colidirem com a grade nova — e antes da 0021
passavam batido, deixando o aluno com duas aulas no mesmo horário. Esse furo
só se tornou alcançável quando a Etapa 6 passou a criar sucessores que
herdam `pacote_id` e sobrevivem à regeneração.

Ordem final dentro da RPC: valida → **cancela a grade** → checa contra outro
aluno → checa contra o próprio aluno → cria pacote → insere. Tudo na mesma
transação: se uma das checagens levantar, o cancelamento é desfeito junto —
nunca fica "cancelado sem pacote novo".

**Duas mensagens distintas, não uma genérica:** conflito com OUTRO aluno pede
ajustar os dias fixos ou resolver na agenda; conflito com o PRÓPRIO aluno
pede cancelar ou remarcar aquela aula. Dizer só "deu conflito" deixaria o
professor sem saber qual caminho tomar.

`countAulasCancelaveisRecorrencia` (`api.ts`) espelha o WHERE da RPC,
incluindo a exclusão de reposição — o número do diálogo de confirmação tem
que ser exatamente o que vai acontecer; avisar um número maior é pior do que
não avisar.

### O que a Etapa 6 quebrou na tela, e a lição do `useLessonActions` (2026-09-08)

Quatro defeitos achados no primeiro teste de remarcação, todos da mesma
origem: a Etapa 6 mexeu no modelo e parou na tela de detalhe.

1. **`'rescheduled'` não existia na camada TS.** O valor está no enum do
   banco desde a 0008, mas `BookingStatus`/`STATUS_MAP` (`lib/bookingStatus.ts`)
   nunca aprenderam — `getStatusConfig('rescheduled')` caía no FALLBACK e a
   aula original renderizava badge **"—"**. Corrigido com label "Remarcada".
2. **A original remarcada continuava ocupando o horário na Agenda.**
   `getAdminAgendaForDay` filtrava só `.neq("status","cancelled")`, então uma
   linha `rescheduled` seguia bloqueando a hora antiga com badge "—". Agora
   sai junto com `cancelled` (`not in (cancelled, rescheduled)`): a linha
   continua existindo como registro, só não bloqueia mais a hora. **Era o
   pior dos quatro** — remarcar deixava o horário antigo inutilizável.
   A view `available_slots` do AUTOSSERVICO **não** sofre disso: o join dela
   exige `b.status = 'scheduled'`, então uma linha `rescheduled` não casa e o
   slot volta a aparecer como livre. Ressalva pré-existente, sem relação com
   a Etapa 6: se a aula original tinha vindo do AUTOSSERVICO (`slot_id`
   preenchido), `schedule_booking` marcou aquele slot como `is_active = false`
   e **nada volta a marcar como true** — nem cancelar, nem remarcar. Ali o
   horário não reabre, pelo mesmo motivo que já não reabria ao cancelar.
3. **Remarcar/Cancelar tinham sido ligados só na tela de detalhe.** Na Agenda
   a única ação de aula futura é "Marcar como reposição", que fica escondida
   quando `is_replacement` é true — e o sucessor de uma remarcação nasce com
   `is_replacement = true` (decisão 2). Resultado: a aula nova aparecia com
   **zero ações**, enquanto uma aula normal mostrava uma.

   **`useLessonActions` existe exatamente para isso não acontecer** — o
   docstring dele diz "usada tanto na lista da Agenda quanto na tela de
   Detalhes da aula, pra não duplicar as mutations e os diálogos". O hook foi
   estendido corretamente (ganhou `openReagendar`/`openCancelar`), mas só uma
   das duas superfícies passou a chamá-los. **Ao acrescentar uma ação ao
   hook, ligue as DUAS telas na mesma leva** — o hook centraliza a lógica,
   não a renderização.
4. **Remarcação e reposição apareciam com o mesmo rótulo.** As duas são o
   mesmo mecanismo no banco (decisão 2) e a tela só olhava `is_replacement`,
   chamando tudo de "Reposição". O discriminador correto já estava escrito na
   própria decisão 2: **é como o ANTECESSOR terminou** — `rescheduled` →
   remarcação; `no_show`/`cancelled` → reposição. Resolvido em
   `vinculoPorAntecessor` (`api.ts`), que busca o status dos antecessores de
   toda a tela **numa consulta só**, indexada por id do antecessor — nunca
   uma consulta por linha. O antecessor quase nunca está no conjunto já
   carregado (remarcar é mover para outro dia), então ele precisa mesmo ser
   buscado; o que não pode é buscar N vezes.

### Etapa 7 — `modo_agendamento` (2026-09-08, 0022)

**Nota de proveniência:** as decisões desta seção foram fechadas numa sessão anterior a esta
edição do CLAUDE.md, e essa sessão foi encerrada por `/clear` antes de serem escritas aqui — ao
contrário de toda a Etapa 1-6, que foi registrada pela mesma sessão que decidiu. O texto abaixo
reconstrói as decisões a partir da confirmação do usuário na sessão seguinte (que recitou cada uma
de volta antes de mandar implementar), não de um registro contemporâneo à decisão original. Ver a
lição no topo deste arquivo: **é por isso que a regra "documentar antes de perder o contexto"
existe** — esta seção quase não existiu.

**O problema.** As Etapas 1-6 deram à RECORRENCIA todo o modelo de dados e as RPCs, mas nenhuma
tela sabe que os dois fluxos não deveriam estar sempre os dois visíveis ao mesmo tempo: um
professor 100% em recorrência ainda expõe "Agendar aula" pro aluno (que nunca deveria escolher
horário sozinho nesse modo) e nada impede abrir a tela de recorrência de um aluno cujo professor
nunca ativou esse fluxo. `modo_agendamento` é a flag que resolve isso — só decide QUAL fluxo cada
tela oferece; não muda nenhuma regra de crédito, RPC de ciclo de vida de aula, ou policy de RLS
além do necessário pra ler a própria flag.

**Decisão 1 — vocabulário.** Valor gravado em minúsculo: `'autosservico'` / `'recorrencia'`
(`profiles.modo_agendamento`, `text` + `check`). Consistência com o resto do banco vence
(`booking_status`, `origin`, `kind`, `cancelado_por` são todos lowercase) — mesmo raciocínio já
registrado em `cancelado_por` (decisão do entities). `AUTOSSERVICO`/`RECORRENCIA` maiúsculo
continua existindo só na prosa deste arquivo e em constantes TypeScript (`ModoAgendamento` em
`types.ts`), nunca no valor persistido.

**Decisão 2 — leitura via RPC, não via policy nova.** `modo_agendamento_efetivo(p_professor_id)`
(`security definer`, 0022) é o único jeito de alguém que NÃO é o próprio professor ler a flag —
usado pelo aluno, do lado de `Agendar.tsx`, pra saber o modo do próprio professor antes de oferecer
a tela de autoagendamento. A alternativa óbvia (abrir uma policy de `select` em `profiles` no
sentido aluno→professor) foi descartada: essa fronteira é fechada de propósito neste projeto
(`supabase/README.md`: "Aluno não enxerga o perfil do professor"; as views `student_booking_history`
e `booking_history_app` existem justamente pra resolver `admin_name` sem abrir essa policy). RLS não
filtra coluna — abrir `select` por causa de UMA flag reabriria a linha inteira do professor pro
aluno, desproporcional a uma flag de navegação. A função devolve só o campo necessário, já
coalescido (`coalesce(modo_agendamento, 'autosservico')`), com autorização interna própria (mesmo
padrão de `calcular_saldo_pacote`, 0013): só o próprio professor ou um aluno matriculado com ele
pode perguntar. O professor lendo o PRÓPRIO modo continua indo direto em `profiles` via
`getAdminSettings` (mesmo caminho que já existia pra `no_show_consumes_class`) — a RPC só existe
pra atravessar a fronteira que a policy não atravessa; não há razão pra uma leitura da própria
linha, já permitida, passar por uma função a mais.

**Decisão 3 (SUB-DECISÃO D) — bloqueio assimétrico: só onde o usuário CRIA dado do fluxo errado.**
Duas superfícies de CRIAÇÃO, uma por fluxo. O critério é "quem CRIA dado", não "de quem é a tela"
— **não confundir com uma separação por AUDIÊNCIA** (aluno sempre redirect, professor só some da
navegação); um rascunho anterior desta etapa usou esse critério e ficou incompleto, ver a correção
logo abaixo desta seção:

- `student/Agendar.tsx` (cria `bookings` via `schedule_booking`, AUTOSSERVICO) — se
  `modo_agendamento_efetivo(professorId) === 'recorrencia'`, redireciona o aluno pra
  `/app/historico` com toast explicando ("seu professor gerencia sua agenda por recorrência").
- `student/Pacotes.tsx` (cria `purchase_requests` via `requestPackage`/`requestSingleClass`,
  AUTOSSERVICO — o aluno pede mais crédito pra se auto-agendar) — mesmo tratamento de
  `Agendar.tsx`: redireciona pra `/app/historico`. Sem risco de encalhar nada: esta tela não tem
  estado próprio pra proteger acesso, ao contrário de `AlunoRecorrencia.tsx` (ver correção abaixo).
- `admin/AlunoRecorrencia.tsx` (cria `bookings`/`packages` via `gerar_pacote_recorrencia`,
  RECORRENCIA) — **corrigido, ver seção "Correção: bloqueio por AÇÃO, não por TELA" abaixo.**

**`/admin/solicitacoes` (`Pedidos.tsx`, tabela `purchase_requests`) foi DELIBERADAMENTE deixada de
fora — não é uma omissão.** Ali o professor não cria dado do fluxo errado: ele DECIDE
(aprovar/rejeitar) um pedido que o ALUNO já criou antes, possivelmente antes de o professor trocar
de modo. Se essa tela fosse bloqueada por modo, um `purchase_request` pendente vira dado órfão sem
caminho de resolução nenhum — o aluno não pode desfazer o próprio pedido, e o professor não teria
como aprovar nem rejeitar. Bloquear a criação evita lixo novo; bloquear a leitura/decisão de um
pedido que já existe apenas transforma o lixo em travado. A assimetria é o ponto, não um
esquecimento — se algum dia parecer inconsistente com o resto (todas as outras superfícies de
RECORRENCIA são bloqueadas por modo), é isso: comportamento decidido, releia esta seção antes de
"corrigir".

Nenhuma outra tela foi gateada nesta etapa (`Disponibilidade.tsx`, `Pacotes.tsx`/templates,
`Pedidos.tsx`) — publicar disponibilidade ou manter templates de pacote comprável não cria dado
inconsistente por si só mesmo com o professor em recorrência; escopo restrito às duas superfícies
que efetivamente materializam aula/pacote em nome do aluno.

**UI em `/admin/configuracoes`.** Mesmo cartão de padrão do `no_show_consumes_class` (leitura via
`getAdminSettings`, escrita via mutation dedicada — aqui `updateModoAgendamento`), mas como
seletor de dois valores nomeados, não um `Switch` booleano. Acompanha aviso explícito, sempre
visível (não só num tooltip): **trocar a flag NÃO migra nenhum dado — pacotes e aulas já criados
continuam exatamente como estão, nos dois modos.** Necessário porque nada nesta etapa reconcilia
dado nenhum entre os dois fluxos; a flag é pura seleção de navegação. Um professor que já tem
aulas AUTOSSERVICO e liga RECORRENCIA (ou vice-versa) não vê nada acontecer com o que já existe —
só passa a ver telas diferentes daqui pra frente.

**Verificação.** `supabase/verify_modo_agendamento.sql` — mesmo padrão de
`verify_calcular_saldo_pacote.sql` (transação explícita terminada em `rollback`, resultado por
tabela temporária lida antes do rollback, não por `RAISE NOTICE`). Roteiro combinado com o usuário:
(1) propriedade nullable+coalesce — todo professor deve ler `'autosservico'` antes de qualquer
escrita; (1b) um aluno matriculado lê o mesmo valor que o próprio professor (prova que a RPC
atravessa a fronteira); (2) virar a flag pra `'recorrencia'` muda a leitura E não move nenhuma
linha de `bookings`/`packages`; (3) voltar a flag reproduz exatamente o estado original — prova de
que nada no caminho AUTOSSERVICO foi tocado, só ficou temporariamente inacessível pela tela.
**Status real (2026-09-08): script escrito, AINDA NÃO EXECUTADO contra o banco** — mesma ressalva
já registrada em outras migrations desta etapa (decisões 6 e 8): rodar antes de considerar a Etapa
7 fechada. Só existe um professor neste banco (`supabase/README.md`), então o caso negativo "aluno
de outro professor tentando ler este" não tem dado real pra exercitar — não fabricado, registrado
como lacuna de cobertura, não como bug.

**Fora do escopo desta etapa, registrado pra não parecer esquecimento:** nenhuma RPC de crédito
(`complete_booking`, `mark_no_show`, `calcular_saldo_pacote`, etc.) foi tocada — `modo_agendamento`
não participa de nenhuma regra de crédito, só de navegação. "Mudança de recorrência" (ponto em
aberto já registrado abaixo) e o card "Recorrência" em `AlunoDetalhe.tsx` continuam visíveis mesmo
quando o professor está em autosserviço (a tela de destino é que redireciona, o link não foi
escondido) — deliberado, pra manter esta etapa no mínimo necessário; esconder o link é possível
depois, sem migration nova.

### 0022 não era idempotente — corrigida (2026-09-09)

`add column modo_agendamento text check (...)` sem `if not exists`: rodou certo na primeira vez
(coluna, CHECK e a função, os três aplicados corretamente — confirmado por introspecção direta:
`information_schema.columns`, `pg_get_constraintdef`, assinatura de `pg_proc`), mas uma reaplicação
falhou em `ADD COLUMN` com `column "modo_agendamento" of relation "profiles" already exists`,
diferente de toda migration anterior desta feature (todas usam `if not exists`/`add column if not
exists`/o padrão de `do $$ ... drop constraint ... end $$` das 0010/0019). Corrigido: `add column
if not exists`, e o CHECK vira `drop constraint if exists` + `add constraint` nomeado
explicitamente como `profiles_modo_agendamento_check` — mesmo nome que o Postgres já tinha
auto-gerado pro CHECK inline da versão anterior, então reaplicar não muda nada em quem já rodou.
`create or replace function` já era idempotente, sem mudança. **Nenhum dado foi perdido nem
precisou ser corrigido no banco** — o estado já estava certo, só a migration em si não era segura
pra rodar duas vezes.

### Correção: bloqueio por AÇÃO, não por TELA (2026-09-08)

**Achado pelo usuário, revisando a decisão 3 acima.** A implementação original redirecionava a
tela `admin/AlunoRecorrencia.tsx` INTEIRA sempre que o professor estava em `'autosservico'` —
mesmo tratamento de `Agendar.tsx`. Isso encalha configuração real: um professor que ativa
RECORRENCIA, cadastra dias fixos pra um aluno, e depois volta pra AUTOSSERVICO (por qualquer
motivo — testar, decidir que não era pra esse aluno, alternar sazonalmente) perde TODO acesso à
tela, sem caminho nenhum pra ver, desativar ou entender o que já tinha configurado. É exatamente o
"dado órfão sem caminho de resolução" que a exceção de `/admin/solicitacoes` (decisão 3, acima)
já existia pra evitar — só que replicada aqui por não ter sido generalizada.

A diferença entre `Agendar.tsx`/`Pacotes.tsx` (redirect de tela inteira está certo) e
`AlunoRecorrencia.tsx` (não estava) é estrutural, não um detalhe de UX: as duas primeiras não têm
NADA pra proteger acesso de leitura — `Agendar.tsx` é só a grade de horários do dia, `Pacotes.tsx`
é só a lista de templates pra pedir; sair delas não esconde configuração de ninguém.
`AlunoRecorrencia.tsx` é diferente: ela é ao mesmo tempo a tela de GERENCIAR configuração
(`aluno_recorrencia` — ver/ativar/desativar dias fixos, ver saldo do pacote atual) e a tela de
CRIAR compromisso novo (o botão "Gerar pacote", que materializa `packages`/`bookings` de verdade).
Bloquear a tela inteira confundia as duas.

**Correção:** a tela fica sempre acessível — dias fixos, saldo, histórico, tudo visível e
editável (ativar/desativar dia fixo, adicionar novo) independente do modo. Só o botão **"Gerar
pacote"** — a única ação que de fato materializa `bookings`/`packages`, o artefato que realmente
conflita com AUTOSSERVICO — fica desabilitado quando o professor está em `'autosservico'`, com uma
linha explicando o que fazer ("Ative o modo Recorrência em Configurações"). Mesmo princípio já
usado em `/admin/solicitacoes`: bloquear a CRIAÇÃO evita lixo novo; bloquear a
leitura/gerenciamento de configuração que já existe só transforma configuração em lixo travado.

**Enquanto corrigia isso, três lacunas reais** (não decisões deliberadas — coisas que a etapa
original simplesmente não cobriu):

- **Botão principal da Home do aluno** (`student/Home.tsx`) ramificava em `recorrenciaSaldo`
  (dado do PACOTE em mãos), não na flag. Consequência: um professor que ativa RECORRENCIA enquanto
  o aluno ainda segura um pacote `purchase` antigo veria "Agendar aula" oferecido — que
  `Agendar.tsx` redirecionaria de qualquer jeito, mas a Home prometia uma ação que a próxima tela
  não cumpriria. Corrigido pra ramificar em `modo_agendamento_efetivo` — é decisão de NAVEGAÇÃO
  (qual ação oferecer), não do pacote específico (princípio já registrado acima: flag decide o que
  o professor OPERA, dado decide o que um pacote/aula É).
- **Aba "Agendar" do `StudentBottomNav`** continuava visível e tocável mesmo com a rota
  redirecionando sozinha — o aluno via a aba, tocava, e caía de volta imediatamente em
  "Aulas". A aba some da navegação quando `modo_agendamento_efetivo === 'recorrencia'` (a ROTA
  continua redirecionando também — defesa em duas camadas, mesmo padrão de `_create_package`:
  esconder o caminho normal não é a única proteção).
- **`student/Pacotes.tsx`** não tinha gate nenhum — ver decisão 3 corrigida acima.

**Confirmado, NÃO são lacunas — continuam exatamente como decidido:**

- `/admin/disponibilidade` e `/admin/solicitacoes` (+ item "Pedidos" do `AdminBottomNav`) seguem
  SEM gate nenhum. Publicar disponibilidade não cria dado inconsistente por si só, e bloquear
  solicitações estranharia pedidos pendentes — mesmo raciocínio de sempre, nenhum motivo novo pra
  revisar só porque `AlunoRecorrencia.tsx` mudou de tratamento (a mudança ali foi de "tela inteira"
  pra "ação específica", não de "sem gate" pra "com gate" — não se aplica aqui, essas duas telas já
  não tinham NENHUMA ação equivalente a "Gerar pacote" pra isolar).
- Card "Recorrência" em `AlunoDetalhe.tsx` continua visível em qualquer modo — e agora essa escolha
  fica ainda mais consistente do que antes: como `AlunoRecorrencia.tsx` deixou de redirecionar
  tela inteira, abrir o card em AUTOSSERVICO mostra a mesma configuração de sempre, só com "Gerar
  pacote" desabilitado — nenhum comportamento surpreendente atrás do link.

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
- **`availability_slots.is_active` nunca volta a `true` — vazamento silencioso
  da grade** (dívida PRÉ-EXISTENTE, sem relação com RECORRENCIA, registrada
  em 2026-09-08, **não corrigir agora**). `schedule_booking` marca o slot como
  `is_active = false` no momento do agendamento (`0001:424`), e os únicos
  outros escritores dessa coluna são as ações manuais da tela de
  disponibilidade (`setSlotsActive`, via `toggleAvailabilityDay`/
  `saveAvailabilityInterval`/`deleteAvailabilityInterval`) — verificado por
  grep. **Nada reabre o slot quando a aula deixa de existir**: nem
  `cancelBooking` (aluno), nem `rejectBooking` (professor recusa um pedido),
  nem `cancelar_aula`/`reagendar_aula` (0020), nem o descarte por regeneração.
  Cada agendamento que termina cancelado/recusado/remarcado queima um horário
  concreto da grade publicada, até o professor republicar o intervalo na mão.

  **Por que é silencioso:** `getAvailability` mostra só slots ativos enquanto
  o dia tem algum ativo (`api.ts`, o `filter(s => s.is_active)` do
  `relevant`), e `mergeHours` junta as horas restantes em intervalos. O
  horário queimado simplesmente some do intervalo exibido — quem publicou
  "18:00–21:00" passa a ver "18:00–19:00" e "20:00–21:00", sem nenhuma marca
  explicando o buraco das 19:00. Piora com o tempo, dentro do horizonte de
  `HORIZON_WEEKS`.

  **Por que não é conserto de uma linha:** `is_active = false` hoje significa
  DUAS coisas diferentes — "o professor despublicou esta hora" e "esta hora
  está ocupada por uma aula" — e o código não consegue distinguir (o próprio
  comentário do `relevant` depende dessa ambiguidade para manter escondido um
  intervalo removido de propósito). Um `set is_active = true` no cancelamento
  republicaria horas que o professor tirou de propósito. O conserto de
  verdade separa os dois conceitos (coluna própria para "ocupado", ou derivar
  ocupação dos `bookings` em vez do flag) — decidir antes de mexer.
- **Desfazer só existe por 9 segundos** (achado em teste, 2026-09-08, não
  implementado — pré-existente, não é da Etapa 6). O ÚNICO ponto de entrada
  de `undo_lesson_action` na aplicação é a ação "Desfazer" do toast de
  sucesso de concluir/falta, com `UNDO_TOAST_MS = 9000`
  (`useLessonActions.tsx`). Professor que fecha o toast, troca de tela ou
  simplesmente demora perde o desfazer **para sempre** — mesmo com a RPC
  continuando a aceitar (ela não tem janela de tempo: "continua válido
  enquanto a transição em si for válida", comentário da 0001). Frágil para
  uma ação que corrige erro de registro. Falta um caminho permanente (ex.:
  botão "Desfazer" na tela de detalhe quando o status é `completed`/`no_show`).
- **UX da lista de dias fixos** (achado pelo usuário em teste, 2026-09-08,
  não bloqueia nada) — `AlunoRecorrencia.tsx` permite desativar um dia fixo
  mas não excluí-lo, então a lista só cresce (linhas desativadas continuam
  aparecendo, só com opacidade reduzida). Sem agrupamento (ativos primeiro,
  por exemplo) nem qualquer ordenação além de `dia_semana` cru. A longo
  prazo, um aluno com vários ciclos de recorrência ao longo do tempo acumula
  uma lista poluída. Não implementado agora — não urgente, registrado pra
  não sumir.
