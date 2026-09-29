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
4. **O app é PWA com service worker (`vite-plugin-pwa`, `registerType:
   "autoUpdate"`, `vite.config.ts`).** Uma mudança de frontend já commitada e
   deployada pode não aparecer pra quem está usando o app até fechar e
   reabrir (ou dar hard refresh) — `autoUpdate` atualiza o service worker em
   segundo plano, não força reload de quem já tem o app aberto. Aconteceu de
   verdade (2026-09-16): navegação da Agenda reportada como quebrada
   ("só existe a seta de voltar"), código lido de ponta a ponta sem achar
   nada — os dois botões eram simétricos, sem condição nenhuma diferenciando
   um do outro. Era cache do service worker; hard refresh resolveu. **Antes
   de investigar um bug visual que não bate com o código lido, pedir hard
   refresh primeiro** — só vale abrir uma investigação de código se o
   sintoma persistir depois disso.

---

## Fluxo de branches

**O Lucas não é dev.** Nunca assumir que ele sabe quando/como rodar um
comando local. Toda vez que uma tarefa exigir uma ação na máquina dele (`git
pull`, `git push`, `npm install`, `npm run dev`, copiar `.env`, etc.), dar o
passo a passo explícito e completo — qual comando, em qual pasta, o que
esperar de resultado — nunca só dizer "dá um pull" ou "roda o install" sem o
comando pronto pra copiar.

**Cópia local CONCLUÍDA (2026-09-28).** Duas pastas, um `.git` compartilhado
via worktree:
- `C:\Users\lfluc\Projetos\BahiaBoxe` — branch `dev`, com `.env` configurado
  (projeto Supabase `jduthhmobwxhqamiepax`) e `npm run dev` já testado
  rodando em `http://localhost:5173/`. É aqui que o trabalho local acontece.
- `C:\Users\lfluc\Projetos\BahiaBoxe-main` — branch `main`, sem servidor
  local, só para consulta/comparação.

A partir de agora existem DUAS origens possíveis de mudança — esta sessão e
a máquina do Lucas — e ele é quem decide quando sincronizar uma com a outra,
mas só decide bem se o comando exato (`git pull`/`git push`, em qual das
duas pastas) vier junto, seguindo a regra acima.

- Trabalhe sempre na branch "dev". Antes de começar qualquer tarefa, confirme
  com "git branch" que está nela.
- Nunca faça commit, push ou merge direto na "main".
- Só faça merge de "dev" para "main" quando o Lucas disser explicitamente que
  aprovou.
- Depois de cada push na "dev", avise que o preview da Vercel foi atualizado
  para eu testar.

**Link de preview a usar SEMPRE: o alias fixo da branch, não a URL do
deployment.** `list_deployments` devolve uma URL nova a cada push (ex.:
`bahia-boxe-6sn8ictxj-...`) — passar essa URL de novo faz o usuário testar um
build congelado no commit anterior, não o mais recente (aconteceu de
verdade em 2026-09-28: o professor testou um fix que não apareceu porque a
URL passada era do push anterior ao fix). O alias que sempre aponta pro
deploy mais recente da branch é
`bahia-boxe-git-dev-designlferreiras-projects.vercel.app` (formato Vercel:
`<projeto>-git-<branch>-<team>.vercel.app`, obtido com
`list_deployment_aliases` sobre o deployment mais recente, não com
`list_deployments` sozinho). Se ainda assim a mudança não aparecer depois de
usar o alias certo, aí sim considerar cache do service worker (gotcha
acima) — nessa ordem, não na ordem inversa.

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
    progresso de UM pacote (`total_classes - used_classes`) via
    `packageProgressPct()` em `packageUtils.ts`. **Atualização (2026-09-28):**
    isso é "créditos para AGENDAR", não "aulas restantes" — na recorrência dá 0
    por construção. As telas de professor (painel, "Alunos em risco", lista de
    alunos) mostram aulas RESTANTES (total − usadas, `saldo_pacotes` na
    recorrência); `creditsByStudent()` foi removida (ver seção "Painel do
    professor" no fim do arquivo).

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
| 15 | `0022_modo_agendamento.sql` | `profiles.modo_agendamento` (nullable, `check in ('autosservico','recorrencia')`) + RPC `modo_agendamento_efetivo(p_professor_id)` | 7 — **APLICADA e VERIFICADA por script (2026-09-09)** — idempotência confirmada por reexecução real; os 9 casos de `supabase/verify_modo_agendamento.sql` vieram `OK` (nenhum `DIVERGIU`/`ERRO`): propriedade nullable+coalesce vale pro professor e pro aluno lendo pela RPC, virar/voltar a flag muda só a leitura efetiva sem tocar uma linha sequer de `bookings`/`packages` (51/21 antes e depois, nos dois sentidos) |
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
**Status real (2026-09-09): EXECUTADO contra o banco, os 9 casos vieram `OK`** — nenhum `DIVERGIU`
nem `ERRO`. Confirmado empiricamente, não só por leitura: propriedade nullable+coalesce vale pro
professor e pro aluno matriculado lendo pela RPC (prova que ela atravessa a fronteira de
`profiles`); virar a flag pra `'recorrencia'` muda só a leitura (`bookings`=51/`packages`=21,
idênticos antes e depois); voltar a flag reproduz o estado original e os dados continuam intactos.
Único caso ainda sem cobertura empírica, aceito como lacuna e não como bug: "aluno de OUTRO
professor tentando ler este" — só existe um professor neste banco (`supabase/README.md`), sem dado
real pra exercitar esse ramo do `raise exception 'not_allowed'`; não fabricado de propósito (mesmo
critério já usado em `verify_create_package.sql`).

**Verificação na aplicação de verdade (2026-09-09), além do script.** O usuário testou os três
passos combinados diretamente no app, não só via SQL:

1. **Professor em `autosservico`:** nada mudou em lugar nenhum — comportamento idêntico ao que
   existia antes desta etapa, nas duas pontas (aluno e professor).
2. **Trocar para `recorrencia`:** comportamento esperado nas duas pontas. Lado aluno: a aba
   "Agendar" some do `StudentBottomNav`; `/app/agendar` e `/app/pacotes` redirecionam; o botão
   principal da Home vira "Ver minhas aulas". Lado professor: `AlunoRecorrencia.tsx` passa a
   permitir "Gerar pacote".
3. **Voltar para `autosservico`:** tudo volta a como estava — **incluindo confirmação explícita de
   que a tela de recorrência continuou acessível, com os dias fixos ainda editáveis**, prova em uso
   real (não só em teoria de código) da correção "bloqueio por AÇÃO, não por TELA" registrada
   abaixo: a tela nunca ficou bloqueada, só o botão "Gerar pacote".

Com isso, a Etapa 7 tem dupla cobertura — script (`verify_modo_agendamento.sql`, transação com
rollback, sem tocar dado real) e uso real da aplicação nas duas pontas — e as **Etapas 1 a 7 são
dadas como completas e verificadas em 2026-09-09.**

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
  da grade — RESOLVIDO (2026-09-16), testado na aplicação real.** (dívida
  PRÉ-EXISTENTE, sem relação com RECORRENCIA, registrada em 2026-09-08).
  `schedule_booking` marcava o slot como
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
  republicaria horas que o professor tirou de propósito.

  **DECIDIDO (2026-09-15): Opção B — derivar ocupação de `bookings`, nunca mais
  escrever nada sobre ocupação.** `is_active` volta a significar só "publicado".
  Argumento decisivo: elimina a CLASSE do bug (não sobra flag pra alguém
  esquecer de limpar) em vez de mover o risco pra uma coluna nova — e o
  histórico deste projeto já mostra que "lembrar de limpar em todo caminho de
  cancelamento futuro" é exatamente o que não acontece. Peso extra: 3 dos 4
  pontos que leem esse sinal (`getAvailability`, `getAdminAgendaForDay`, e a
  própria RPC via a checagem nova) já buscam `bookings` em paralelo por outro
  motivo — não é consulta nova.

  **Condição não-negociável, faz parte da mesma mudança, não é dívida
  separada:** a comparação de sobreposição vira por INTERVALO real
  (`existente.start < candidato.end AND existente.end > candidato.start`),
  não por igualdade exata de horário — adotar a igualdade exata (o que a view
  `available_slots` já faz hoje) em mais lugares ampliaria esse bug em vez de
  resolvê-lo. **Confirmado: isso também fecha "`pending_confirmation` não
  bloqueia slot" (Overbooking entre RECORRENCIA e AUTOSSERVICO, ponto 2) de
  graça — a nova checagem olha `status in ('scheduled', 'pending_confirmation')`
  nos dois lados, não só `scheduled`.**

  **Achado ao desenhar o plano, mais grave que o pedido original:** a guarda
  de `schedule_booking` contra double-booking (`exists (b.slot_id = p_slot_id
  and status = 'scheduled')`) NUNCA protegeu contra colisão com RECORRENCIA —
  `bookings.slot_id` só é escrito por essa mesma função (confirmado por grep
  em todas as migrations); uma aula de recorrência nunca tem `slot_id`. A
  única coisa que hoje impede um aluno de AUTOSSERVICO agendar em cima de uma
  aula de RECORRENCIA é a tela "Agendar" não oferecer o horário (via a view
  `available_slots`) — barreira de cliente, não de banco. **Decidido: corrigir
  junto, não é escopo extra** — proposta: **exclusion constraint** em
  `bookings` (`EXCLUDE USING gist (admin_id WITH =, tsrange(start_time,
  end_time) WITH &&) WHERE (status in ('scheduled','pending_confirmation'))`,
  precisa de `btree_gist`) — mesmo padrão que `packages_one_trial_per_student`/
  `ux_packages_one_active_purchase_per_student` já usam pra outros
  invariantes, só que agora no nível de banco, não de tela.

  **Diagnóstico de backfill RODADO (2026-09-15) — resultado derruba a premissa
  do backfill automático.** 355 linhas `is_active = false`, 1 professor. Só 9
  (menos de 3%) têm `slot_id` vinculado (evidência direta de queima por
  AUTOSSERVICO). Das 346 restantes, 274 são de horários FUTUROS — e nenhuma
  tem `slot_id`, ou seja, não foram queimadas por aula de autosserviço (se
  fossem, teriam o vínculo). São desativação deliberada do professor, ou
  queima por RECORRENCIA (que nunca preenche `slot_id`). **Backfill automático
  descartado**: reabriria 346 linhas ambíguas pra corrigir 9 casos
  comprovados — republicaria em massa horários que o professor provavelmente
  tirou de propósito.

  **DECIDIDO: sem backfill automático.** Caminho escolhido — a tela de
  disponibilidade passa a mostrar ao professor quais horários estão
  despublicados, com um botão de reativar. Ele sabe quais tirou de propósito;
  o código não tem como saber.

  **Terceiro diagnóstico, pra separar as 346 ambíguas antes de desenhar essa
  tela** (`supabase/diagnostico_ambiguas_is_active.sql`, RODADO 2026-09-15):
  cruza cada linha ambígua com bookings SOBREPOSTOS por intervalo (não por
  `slot_id`), em qualquer status, incluindo `cancelled`/`rescheduled`.
  Achado ao escrever este diagnóstico, além do pedido original: "existe
  booking sobrepondo" sozinho não separa direito — um booking sobreposto pode
  estar ATIVO agora (`scheduled`/`pending_confirmation`), e nesse caso o
  horário está genuinamente ocupado NESTE MOMENTO — `is_active = false` está
  CORRETO, não é vazamento, e oferecer "reativar" nesse caso seria perigoso
  (sugeriria liberar um horário que uma recorrência está usando agora). Por
  isso o corte final é em 4 grupos, não 2: (A) `slot_id` vinculado — os 9
  já conhecidos; (B) sem `slot_id`, mas ocupado AGORA por booking ativo —
  correto, não mostrar como reativável; (C) sem `slot_id`, já foi ocupado mas
  o booking não está mais ativo — candidato real a vazamento; (D) nunca teve
  nenhum booking ali — candidato a desativação deliberada.

  **Resultado: A=9, B=7, C=1, D=338.** A hipótese que motivou toda a
  investigação — vazamento causado por RECORRENCIA ocupando um horário e
  nunca reabrindo — tem UMA linha comprovada (grupo C, slot
  `751d725f-a307-4023-b800-26d7b75892fa`). As outras 338 (95% do total de 355)
  nunca tiveram nenhum booking sobrepondo aquele horário, em nenhum status:
  são desativação deliberada do professor, não dano do bug.

  **DECIDIDO (2026-09-15): tela de reativação sai de escopo.** Construir uma
  superfície nova (UI + fluxo de "reativar horário despublicado") para
  resolver um único caso comprovado não se paga. Registrado aqui com os
  números acima para que ninguém reabra essa ideia sem ver primeiro que o
  vazamento real é de 1 linha em 355, não de centenas.

  **A Opção B (derivar ocupação de `bookings`, nunca mais escrever sobre
  ocupação) continua — mas o motivo mudou.** Não é mais reparar dano
  acumulado (não há dano acumulado relevante a reparar — ver números acima);
  é impedir que o problema cresça. O bug está contido hoje porque o volume de
  uso ainda é pequeno (1 vazamento real); com mais alunos e mais
  cancelamentos, a proporção muda — e corrigir a mecânica agora, antes do
  volume crescer, é barato, depois não é.

  **A única linha do grupo C será corrigida à mão** (UPDATE pontual por id em
  `751d725f-a307-4023-b800-26d7b75892fa`, a entregar quando a migration da
  Opção B estiver pronta) — não por script de backfill.

  **Nenhum backfill nas 338 do grupo D.** Ficam como estão — esse é o estado
  correto; reabri-las republicaria em massa horários que o professor tirou de
  propósito.

  **Diagnóstico de concorrência RODADO e limpo (2026-09-15): 0 pares
  sobrepostos, 0 professores afetados** (a primeira leitura do usuário tinha
  sido a aba errada do SQL Editor — o arquivo sempre esteve correto). A
  exclusion constraint pôde ser criada sem violar nenhuma linha existente.

  **IMPLEMENTADO (2026-09-15), cinco migrations, uma por etapa:**
  - `0025` — `schedule_booking`: sai o `update ... is_active = false`; a
    guarda contra double-booking troca `slot_id` (que RECORRENCIA nunca
    preenche) por sobreposição de intervalo contra qualquer booking ativo do
    professor, nos dois status. Insert protegido por bloco aninhado com
    `exception when exclusion_violation` (dormente até a `0028`). Achado ao
    mexer aqui: a mutation de agendar no app (`Agendar.tsx`) nunca teve
    `onError` — toda falha de `schedule_booking`, sempre, era silenciosa; e os
    códigos que a função levanta (`slot_already_booked` etc.) nunca tinham
    tradução para português. Os dois corrigidos juntos, no mesmo commit —
    senão a mensagem legível da constraint não chegaria a lugar nenhum.
  - `0026` — view `available_slots`: igualdade exata de horário e só
    `scheduled` viram sobreposição de intervalo e os dois status. Mesmas
    colunas, mesmo único consumidor (`getAvailableSlotsForDay`); não passou a
    filtrar `is_active` — isso nunca foi decidido, então não mudou.
  - `0027` — `gerar_pacote_recorrencia` e `reagendar_aula` ganham o mesmo
    bloco aninhado com `exclusion_violation` (resposta à pergunta (b) do
    usuário: sem isso, a rejeição da constraint apareceria como erro cru de
    Postgres nesses dois lugares). De caminho: `reagendar_aula` tinha a MESMA
    lacuna que `schedule_booking` tinha antes da `0025` — sua checagem de
    sobreposição só olhava `status = 'scheduled'`, nunca
    `pending_confirmation`. Corrigida junto, mesma lacuna, não escopo extra.
  - `0028` — a exclusion constraint em si
    (`bookings_sem_sobreposicao_por_professor`, `EXCLUDE USING gist`,
    `tstzrange(start_time, end_time, '[)')`, `btree_gist` novo nesta base).
    **Decisão sobre ordem (pergunta (a) do usuário): vem POR ÚLTIMO, de
    propósito.** As três migrations anteriores já sabem traduzir
    `exclusion_violation` em mensagem legível ANTES desta existir — nesta
    ordem, a constraint nunca chega a mostrar erro cru pra ninguém, nem por
    um instante. A ordem inversa (constraint primeiro) protegeria a mesma
    coisa alguns minutos mais cedo, mas abriria uma janela real em que uma
    colisão rejeitada apareceria como texto cru do Postgres — o resultado
    "confuso" que a pergunta (a) queria evitar.
  - `0029` — `UPDATE` pontual por id, reabre só o slot do grupo C
    (`751d725f-a307-4023-b800-26d7b75892fa`). As 338 do grupo D não são
    tocadas.

  **Achado ao revisar `getAvailability`/`getAdminAgendaForDay` (item 3 do
  pedido original do usuário): NENHUMA das duas precisou de mudança.**
  Confirmado por grep em todas as migrations: `schedule_booking` (`0001:424`)
  sempre foi o ÚNICO lugar em todo o banco que escrevia `is_active = false`
  por causa de uma reserva — nenhuma das duas funções lê `is_active` como
  sinal de ocupação; as duas já derivavam "ocupado" direto de `bookings`
  (contagem por hora / busca por hora exata), só que por outro motivo
  (`bookedCount`, timeline). Bastou a `0025` parar de escrever `is_active`
  errado para a leitura ficar automaticamente correta nos dois — inclusive
  corrige de brinde um bug lateral do `getAvailability`: hoje, reservar UM
  horário dentro de um dia com vários horários publicados fazia aquele
  horário sumir do editor de disponibilidade do professor (parecia
  despublicado), porque `is_active = false` o tirava do filtro `relevant`.

  **Migrations 0025-0029 aplicadas sem erro (2026-09-16).** A `0028` passar
  confirma o que o diagnóstico já indicava: zero sobreposição na base real no
  momento da criação da constraint. **Testado na aplicação de verdade pelo
  usuário, quatro cenários:**
  - agendar por AUTOSSERVICO some da lista do aluno mas continua publicado no
    editor do professor — o bug lateral do `getAvailability` descrito acima,
    confirmado corrigido;
  - cancelar devolve o horário sozinho, sem nenhuma ação manual do professor
    — é a prova direta de que a Opção B funciona (ocupação deriva de
    `bookings`, não fica presa em `is_active`);
  - colisão entre RECORRENCIA e AUTOSSERVICO recusa com mensagem legível, não
    erro cru;
  - falha de `schedule_booking` agora aparece na tela (`Agendar.tsx`), o que
    nunca acontecia antes desta migration.

  **Dívida fechada.**
- **Trial que nunca expira, revisitado e mantido em aberto (2026-09-15).**
  Reabrimos a "consequência aceita conscientemente" registrada acima (Etapa 1)
  — continua sem solução, de propósito. `grant_trial_credit` dispara `after
  insert on students` (`0001:750-773`), antes de qualquer `aluno_recorrencia`
  poder existir — então "não conceder trial a aluno em recorrência" não é
  implementável ali; a versão que corresponderia ao mecanismo seria revogar o
  trial no momento em que a recorrência é configurada, não negar a concessão
  na origem. Das três opções levantadas (expirar por data / não conceder /
  consumir o trial antes do pacote de recorrência), a terceira foi descartada
  — desfaz de propósito a correção da Etapa 1 que fez `pacote_id` ser fonte
  direta pro débito de recorrência. Sobra expirar por data, que depende de
  duas respostas de negócio ainda em aberto, sem data pra decidir:
  1. **A partir de quando conta a expiração** — cadastro do aluno, ou primeira
     aula/uso?
  2. **O que acontece com o crédito não utilizado ao expirar** — some do saldo
     sem rastro, ou vira uma entrada explícita no ledger explicando o sumiço?

  Sem cron/scheduler neste projeto, qualquer expiração só pode ser aplicada
  NA LEITURA (`available_credits_for_student` excluindo trial vencido), nunca
  como transição de status ativa. **Não implementar até essas duas perguntas
  serem respondidas — o crédito parado não degrada nada sozinho, só infla um
  número que ninguém usa pra decidir.**
- ~~**Desfazer só existe por 9 segundos**~~ — RESOLVIDO (2026-09-15). `admin/AulaDetalhe.tsx` ganhou
  um botão "Desfazer conclusão"/"Desfazer falta" (com `ConfirmDialog`, mesmo padrão das outras ações
  da tela), visível sempre que `booking.status` for `completed`/`no_show` — sem janela de tempo,
  igual à RPC. O toast continua existindo do mesmo jeito (ação imediata, sem confirmação — faz
  sentido logo após a própria ação); o botão é o caminho permanente pra quando o professor fecha o
  toast, troca de tela ou só percebe o erro depois.
- ~~**UX da lista de dias fixos**~~ — RESOLVIDO POR COMPLETO (2026-09-15, `AlunoRecorrencia.tsx`).
  Faltava o agrupamento/ordenação desde a correção parcial de 2026-09-09 (que só tinha resolvido a
  exclusão). Agora: ativos antes de inativos (duas seções, só rotuladas quando as duas existem —
  com uma lista só, o rótulo é ruído); dentro de cada uma, agrupado por dia da semana (ordem do
  calendário) com um cabeçalho por dia em vez de repetir o nome do dia em cada linha; dentro do dia,
  ordenado por horário.
- ~~**Rota órfã `/app/perfil-lutador/comparacao`**~~ — REMOVIDA (2026-09-15). Sem nenhuma entrada na
  interface desde que a comparação virou inline no histórico/perfil (achados de uso, 2026-09-11) —
  só acessível digitando a URL direto. Decisão: remover, não dar um caminho visível novo. Argumento:
  o conteúdo é 100% redundante com o que já aparece em `PerfilLutador.tsx` quando as duas avaliações
  existem (mesmo `BoxingProfileComparisonView`, mesmos dados) — manter a rota separada só duplicaria
  pra sempre a lógica de loading/erro/skeleton das duas telas, por zero valor novo pro usuário.
  `PerfilLutadorComparacao.tsx` apagado, rota e import removidos de `App.tsx`.

### Limpeza de dados de teste antes de produção — diagnóstico rodado, decisões tomadas (2026-09-09)

Três categorias de dado acumulado ao testar as Etapas 1-7, levantadas pelo usuário ao fechar a
Etapa 7. **`supabase/diagnostico_limpeza_teste.sql` (somente leitura) já rodou contra o banco
real** e as três decisões abaixo já foram tomadas pelo usuário a partir do resultado — mas **nada
de DELETE/UPDATE foi executado ainda**; esta seção documenta a decisão e o roteiro, não a
execução.

**Bug achado na v1/v2 do script, corrigido antes do resultado valer algo:** o bloco 0 (ON DELETE
das FKs) não aparecia na saída, sem erro nenhum. Causa: o filtro comparava
`con.conrelid::regclass::text` contra uma string QUALIFICADA (`'public.bookings'`). O cast
`regclass::text` do Postgres devolve o nome mais curto que resolve sem ambiguidade dado o
`search_path` da sessão — como `public` está no search_path por padrão, o valor real era
`'bookings'` (sem prefixo), a comparação nunca batia, e a CTE devolvia 0 linhas **silenciosamente**
(união vazia não é erro, e as outras seções continuaram aparecendo normalmente). Corrigido
filtrando por `pg_namespace.nspname` + `pg_class.relname` direto — mesmo padrão que
`introspect.sql` já usava e por isso nunca teve esse problema. Lição generalizável, mesma família
do aviso já registrado no cabeçalho do `introspect.sql` sobre o SQL Editor só mostrar a última
instrução: **nunca comparar `::regclass::text` contra um nome qualificado — comparar por
namespace + relname**, ou usar `pg_get_constraintdef` (como o `introspect.sql` original já fazia)
em vez de reconstruir o texto column a column. A v3 do script também ganhou uma contagem de
conferência no próprio bloco 0 (se der 0 nessa contagem, o bloco tem outro problema — não
interpretar silêncio como "nenhuma FK existe").

**Resultado do diagnóstico (resumo):**
- **(A) LK:** as 24 linhas são todas `cancelled`/`regeneracao`, `credit_transactions_apontando=0`
  e `referenciada_como_original_de=0` em TODAS — nenhuma FK trava nada aqui.
- **(B) horário artificial:** só uma linha achada, a própria `32d4c001...`, `scheduled` em
  07/09 21:59 (passado) — **não é do LK, é do aluno de teste `b12decb8`** (as duas categorias (b) e
  (c) se sobrepõem nesta linha específica). É `replacement_for_booking_id` de `863d420d...`
  (criada por `reagendar_aula`, Etapa 6). Zero FKs apontando pra ela (nem `credit_transactions`,
  nem outra `bookings.replacement_for_booking_id`).
- **(C) aluno de teste `b12decb8`:** 1 `students`, 3 `aluno_recorrencia`, 10 `bookings`, 3
  `packages`, 2 `credit_transactions`, 1 `purchase_request`. Nenhuma referência cruzada de outro
  aluno.

**(a) As 24 aulas `cancelled`/`cancelado_por='regeneracao'` do aluno real LK
(`4cd0e555-728b-47ba-ba3c-073b54d28af3`).**

**DECISÃO: deixar como está**, confirmando a recomendação original — o diagnóstico não achou
nenhuma `credit_transaction` nem `replacement_for_booking_id` apontando pra nenhuma das 24, então
nem o argumento de FK entraria em jogo; a razão de fundo continua sendo histórico real de aluno
real, já invisível em toda tela (`SEM_DESCARTE_DE_REGENERACAO`) e fora de qualquer saldo (decisão
4). Nada a fazer aqui.

**(b) A aula `32d4c001...`, replacement de `863d420d...`, pacote `585c88ac...`.**

**DECISÃO: concluir pela aplicação (`complete_booking`), não mexer por SQL.** Mecânica confirmada
lendo `0013_calcular_saldo_pacote.sql` e `0020_reagendar_cancelar_aula.sql` (não assumida — as
duas migrations foram relidas pra esta resposta):

- `calcular_saldo_pacote` agrupa `bookings` por `cadeia_id` e só aplica a regra de crédito no
  **terminal** de cada cadeia (a linha que nenhuma outra referencia via
  `replacement_for_booking_id`) — `863d420d` (original, agora `rescheduled`) nunca conta sozinha,
  só `32d4c001` conta, porque é ela o terminal (confirmado: `referenciada_como_original_de=0`).
- `complete_booking` (0020) checa `pacote_id is not null` **antes** de checar `is_replacement` —
  comentário da própria migration: "RECORRENCIA primeiro... `is_replacement` é irrelevante". Como
  `32d4c001.pacote_id = 585c88ac` (herdado do original por `reagendar_aula`), concluir cai direto
  no ramo de recorrência: marca `status='completed'`, recalcula `calcular_saldo_pacote(585c88ac)` e
  grava o resultado em `packages.used_classes`/`status` — **nenhum `credit_transactions` é criado**
  (esse insert só acontece no ramo `pacote_id is null`, que este booking não é).
- Efeito líquido: `585c88ac.used_classes` sobe em 1 (a cadeia de `863d420d`→`32d4c001`, que hoje
  não conta porque o terminal está `scheduled`, passa a contar); `status` vira `finished` se isso
  atingir o total, senão continua `active`. `863d420d` permanece `rescheduled` para sempre, sem
  mudança — já não contava antes, não passa a contar agora.
- É seguro: nenhuma FK aponta para `32d4c001` (diagnóstico bloco B), a UI (gate client-side de
  "só concluir aula já passada") deixa passar porque `start_time` já é 07/09 (passado), e o efeito
  é idêntico ao de concluir qualquer aula normal de recorrência — a manipulação manual do
  `start_time` não introduz nenhum caminho especial, só destravou a UI pra alcançar o mesmo botão
  que uma aula de verdade alcançaria sozinha com o tempo.
- Como o pacote `585c88ac` e o aluno `b12decb8` inteiro estão marcados pra remoção total (decisão
  (c) abaixo), esse ajuste de saldo é transitório — não precisa reconciliar nada depois, ele some
  junto no passo 3 do roteiro de (c).

Nenhuma outra linha com horário artificial foi encontrada além desta.

**(c) O aluno de teste `b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8` — roteiro de remoção completa.**

**DECISÃO: remover por completo.** Diagnóstico v3 rodado, bloco 0 completo (20 FKs) — o roteiro
abaixo não tem mais nenhum "a confirmar", é a versão final. Mapa relevante, do bloco 0:

| coluna (quem referencia) | tabela referenciada | on_delete |
|---|---|---|
| `bookings.pacote_id` | `packages` | NO ACTION |
| `bookings.recorrencia_id` | `aluno_recorrencia` | NO ACTION |
| `bookings.replacement_for_booking_id` | `bookings` (self) | NO ACTION |
| `bookings.student_id` | `students` | CASCADE |
| `credit_transactions.booking_id` | `bookings` | NO ACTION |
| `credit_transactions.package_id` | `packages` | NO ACTION |
| `credit_transactions.student_id` | `students` | NO ACTION |
| `credit_transactions.reverses_transaction_id` | `credit_transactions` (self) | NO ACTION |
| `credit_transactions.created_by` | `profiles` | NO ACTION |
| `packages.recorrencia_id` | `aluno_recorrencia` | NO ACTION |
| `packages.student_id` | `students` | CASCADE |
| `purchase_requests.student_id` | `students` | CASCADE |
| `aluno_recorrencia.aluno_id` | `students` | CASCADE |
| `students.profile_id` | `profiles` | CASCADE |
| `profiles.id` | `auth.users` | CASCADE |

Regra usada pra montar a ordem: uma FK só bloqueia apagar a linha REFERENCIADA enquanto existir
referência viva — nunca bloqueia apagar a linha que faz a referência. Então "o que preciso apagar
antes de X" = "o que tem uma FK `NO ACTION`/`RESTRICT` apontando PARA X". As `CASCADE` (todas a
partir de `students` ou de `auth.users`) são bônus — apagam sozinhas — mas não dispensam apagar os
`NO ACTION` na ordem certa primeiro, porque um `DELETE` que dispara CASCADE ainda falha se o que
sobrou no caminho tiver uma referência `NO ACTION` pendente (ex.: apagar `students` cascateia pra
`packages`, mas isso falha se `credit_transactions`/`bookings` ainda apontarem pra esses pacotes).
Por isso o roteiro continua manual e explícito, mesmo com tanta CASCADE por trás:

1. **(SQL)** `update bookings set replacement_for_booking_id = null where student_id =
   'b12decb8-...'` — quebra o vínculo interno `32d4c001 → 863d420d` antes de apagar qualquer uma
   das duas. Só afeta as 10 bookings deste aluno; o diagnóstico já confirmou que nenhuma booking de
   OUTRO aluno aponta pra dentro deste conjunto (`C_REFERENCIA_CRUZADA`: nenhuma encontrada).
2. **(SQL)** `delete from credit_transactions where student_id = 'b12decb8-...'` (2 linhas) —
   `reversao_cruzada` já confirmou que nenhuma OUTRA transação as reverte
   (`reverses_transaction_id`). Precisa vir antes de `bookings`/`packages` (as duas colunas
   `NO ACTION` que apontam pra eles).
3. **(SQL)** `delete from bookings where student_id = 'b12decb8-...'` (10 linhas — self-ref já
   nulo pelo passo 1; nada de fora aponta pra dentro, confirmado).
4. **(SQL)** `delete from packages where student_id = 'b12decb8-...'` (3 linhas — nada mais aponta
   pra elas depois dos passos 2-3).
5. **(SQL, opcional)** `delete from purchase_requests`/`delete from aluno_recorrencia` deste aluno
   — **ambas `on delete cascade` a partir de `students`** (confirmado no bloco 0), então o passo 6
   já as remove sozinhas. Fazer aqui só antecipa a conferência do número; não é obrigatório.
6. **(SQL) 🛑 PARE E CONFIRA AQUI antes de seguir** — antes de apagar `students`, rodar:
   `select count(*) from credit_transactions where created_by = 'a4ad5883-4ed2-44a2-9cd3-b239b70f9658'`.
   Único item do mapa acima ainda não verificado nesta sessão: `credit_transactions.created_by`
   é `NO ACTION` contra `profiles`, e o passo 8 (apagar o profile) esbarraria nele se alguma
   transação (de QUALQUER aluno, não só deste) tiver sido criada com esse profile como
   `created_by` — estruturalmente não deveria acontecer (`created_by` só é preenchido por
   `complete_booking`/`mark_no_show`, que exigem `is_admin()`, e este profile é `role=student`),
   mas "não deveria" não é "confirmado". Se vier 0 (esperado), seguir. Se vier > 0, é um achado
   novo — parar e decidir antes de continuar, não é coberto por este roteiro.
7. **(SQL)** `delete from students where id = 'b12decb8-...'` — com os passos 1-4 feitos, isto
   cascateia sozinho sobre `purchase_requests`/`aluno_recorrencia`/`student_profiles`/
   `boxing_profile_assessments` (todas `on delete cascade` a partir de `students`, as duas últimas
   confirmadas direto nas migrations `0004:10`/`0006:39`, fora do bloco 0 mas com o mesmo
   `on delete cascade`).
8. **(painel do Supabase, não SQL)** `students.profile_id = a4ad5883-4ed2-44a2-9cd3-b239b70f9658`
   (`profiles.role='student'`, `name='teste'` — confirmado no bloco E, não é mais reconstrução de
   commit antigo). Apagar o login em **Authentication → Users** — `profiles.id -> auth.users` é
   `CASCADE`, então apagar o usuário ali já remove a linha de `profiles` sozinho; não precisa (nem
   faz mal) apagar `profiles` via SQL antes. Só rodar isto depois do passo 7 — antes dele,
   `students.profile_id` ainda aponta pro profile (`CASCADE` nessa direção apagaria `students`
   também, o que não é o problema, mas inverteria a ordem sem necessidade).

**Sobre o `purchase_request` (pergunta do usuário): confirmado, não quebra nada — e nem está
pendente hoje.** O diagnóstico trouxe o status: `bbbad2b6...` = **`approved`**, decidido em
02/09/2026 — não `pending`. `getPurchaseRequests` (`api.ts:1127`) só busca `status='pending'`, logo
esse pedido **não aparece** em `/admin/solicitacoes` hoje, independente de qualquer limpeza — a
preocupação levantada antes (pedido fictício visível no inbox do professor) não se aplica. E
mesmo que estivesse pendente, a tela não quebraria: `nameOf.get(r.student_id) ?? "Aluno"` é um
`Map` com fallback, não um join que estoura se o aluno sumir.

**Achado tangencial, sem ação:** o bloco 0 revelou `bookings.slot_id -> availability_slots`
(`NO ACTION`), FK que não fazia parte do que se sabia antes desta rodada. Não afeta este roteiro
(não estamos apagando `availability_slots`), mas é outro dado a favor do item já registrado em
"Pontos ainda em aberto" sobre `availability_slots.is_active` nunca voltar a `true` — o vínculo
formal entre aula e slot existe via FK, reforçando que a coluna certa pra saber "este horário está
ocupado" seria essa relação, não o campo `is_active` hoje sobrecarregado com dois significados.

**Status real (2026-09-09): EXECUTADO.** `supabase/limpeza_aluno_teste_b12decb8.sql` rodou
completo, confirmado pelo usuário — todos os passos, nenhuma guarda abortou. O aluno de teste
`b12decb8` e tudo que ele tinha acumulado (packages, bookings — inclusive `32d4c001`, concluída ou
não, tanto faz pro `DELETE` — credit_transactions, aluno_recorrencia, purchase_request,
student_profiles, boxing_profile_assessments, login) não existem mais no banco. A decisão (a)
também segue de pé (LK: nenhuma ação, deixado como estava). **As três categorias de limpeza de
dados de teste estão fechadas.**

### Excluir dia fixo de recorrência (2026-09-09)

Resolve a pendência de UX registrada em "Pontos ainda em aberto": até aqui só existia o toggle
`ativo` — a lista de dias fixos só crescia, sem forma de remover uma linha criada por engano.

**FKs verificadas antes de decidir** (`diagnostico_limpeza_teste.sql`, bloco 0, introspecção real):
`bookings.recorrencia_id -> aluno_recorrencia` e `packages.recorrencia_id -> aluno_recorrencia` são
as duas `NO ACTION`, nunca `CASCADE` — apagar uma `aluno_recorrencia` referenciada falha, nunca
apaga aulas em cascata. Isso descarta o cenário catastrófico, mas não decide a regra de negócio.

**Regra decidida:** excluir só é permitido quando a recorrência nunca gerou **nada** — nenhum
`booking` nem `package` com esse `recorrencia_id`, em **qualquer status**, inclusive
`cancelled`/`regeneracao`. Rastreabilidade de "por que esta aula existe" vale mesmo pra aula
descartada — mesmo raciocínio já aplicado às 24 aulas de regeneração do LK (seção acima). Se já
gerou algo, o caminho é desativar, nunca excluir. **Sem exigir desativar antes de poder excluir**
quando nunca houve uso — decisão explícita do usuário: duas ações pro mesmo fim seria fricção sem
propósito.

**Imprecisão conhecida sobre `packages.recorrencia_id`, registrada aqui por pedido explícito do
usuário — vale além desta feature, não é bug desta migration:** `gerar_pacote_recorrencia` (0019)
grava em `packages.recorrencia_id` só o `recorrencia_id` do **primeiro slot** do array
(`set recorrencia_id = (p_slots->0->>'recorrencia_id')::uuid`). Um pacote que combina dois dias
fixos (recorrência A e B) referencia só A no próprio `package` — mas cada `booking` individual
carrega o `recorrencia_id` correto por linha. **`packages.recorrencia_id` não é uma lista completa
de "de quais recorrências este pacote veio" quando há mais de um dia fixo envolvido** — não
corrigido agora (fora do escopo desta migration), só não deixar ninguém confiar nesse campo achando
que é completo. Consequência pra esta feature: a checagem em `bookings` é a **autoritativa**; a
checagem em `packages` é defesa redundante e, sozinha, seria incompleta — as duas juntas continuam
corretas porque `bookings` nunca erra (é aplicado a cada slot individualmente, na geração).

**Implementação (migration `0023_excluir_aluno_recorrencia.sql`):**
- RPC `excluir_aluno_recorrencia(p_recorrencia_id)` — professor dono do aluno, checa `exists` em
  `bookings` OU `packages` com esse `recorrencia_id` (sem filtro de status); se achar, levanta
  exceção com mensagem amigável em vez de deixar o erro cru de FK subir; se não achar, apaga.
- **RLS de `aluno_recorrencia` deixou de ser uma policy única `for all`** (0009) — virou 4
  policies (select/insert/update idênticas ao que já era; delete ganha a MESMA condição de negócio
  da RPC). Backstop fail-closed: mesmo princípio já registrado pra `_create_package`/pro bloqueio
  por ação da Etapa 7 ("esconder o botão não é a única proteção") — um `.delete()` direto pelo
  client, bypassando a RPC, fica igualmente bloqueado pela RLS, com o mesmo critério.
- Frontend: `getAlunoRecorrencias` ganhou um campo derivado `temUso` (duas queries companheiras,
  `bookings`/`packages` por `student_id`, sem filtro de status, mescladas client-side — não é
  coluna do banco). `AlunoRecorrencia.tsx` mostra um ícone de excluir sempre visível ao lado do
  toggle; desabilitado com uma linha explicando ("Já gerou aula ou pacote — desative em vez de
  excluir") quando `temUso`, habilitado com `ConfirmDialog` (`tone="destructive"`, componente já
  usado nesta mesma tela) quando não. **Mensagem única para os dois motivos de bloqueio (bookings
  OU packages), de propósito** — diferenciar exigiria expor qual dos dois bloqueou, o que o usuário
  considerou desnecessário para um caso "improvável, mas possível" (packages sem bookings); a
  mesma frase é usada no cliente e no texto da exceção da RPC, para não divergir.
- Verificado: `tsc --noEmit` limpo, `vitest run` 39/39, `vite build` sem erro. **Status real
  (2026-09-09): migration `0023` aplicada no banco real e testada na aplicação, confirmado pelo
  usuário ("feito e testado").** O caso "package sem booking" (packages referencia só o primeiro
  slot, ver imprecisão acima) continua não exercitado de propósito — cenário "improvável" que
  ninguém construiu pra testar, não é uma lacuna de verificação, é a mesma decisão de escopo já
  registrada.

### Achados de uso pós-lançamento (2026-09-11) — três corrigidos, mediação em aberto

Fora do escopo RECORRENCIA — achados testando o app já em uso real. Oito no total, três levas
implementadas nesta rodada (as mais graves); os outros três (média entre as duas avaliações de
Perfil de Boxe, teste curto vs. completo, arte compartilhável) ficaram de fora, a trazer depois.

**LEVA 1 — Agenda não navegava pro passado.** Não era limite deliberado: `Agenda.tsx` gerava
sempre "hoje + 6 dias" (`addDays(new Date(), i)`), sem estado de semana nem botão de retroceder —
a query (`getAdminAgendaForDay`) sempre aceitou qualquer data. Consequência real, não só de UX:
aula esquecida sem concluir nunca consome crédito, inflando o saldo do aluno em silêncio. Corrigido:
`weekStart`/`selectedDate` navegáveis por blocos de 7 dias, sem limite; o banner "aguardando
confirmação" do Dashboard passa a levar direto pra data da pendência mais ANTIGA (`awaitingConfirmation[0]`,
já ordenada); dias da semana visível com pendência ganham um marcador visual, usando uma query nova
(`getAwaitingConfirmationBookings` — mesma condição de `getAdminDashboard`, sem limite de dias
atrás, custo baixo: é sempre um conjunto pequeno de exceções, não volume normal).

**LEVA 2b — aluno não descobria a avaliação do professor.** Não era RLS nem query — as duas já
permitiam o aluno ler a avaliação `'coach'` desde as migrations `0006`/`0007`. Era descoberta: o
lado do professor mostra a comparação inline automaticamente quando as duas avaliações existem
(`AlunoPerfilBoxe.tsx`); o lado do aluno escondia atrás de um botão secundário, e nada notificava.
Corrigido: `PerfilLutador.tsx` (aluno) ganhou os mesmos 4 ramos que o professor já tinha —
comparação **inline** quando as duas existem, sem clique — e `deriveNotifications` passou a avisar
quando o professor avalia (`entity: "boxing_profile"`, rota `/app/perfil-lutador`).

**Pergunta em aberto, ainda não decidida — mediação da comparação:** o usuário perguntou se a
tela de comparação precisa de mais enquadramento antes do aluno ver a leitura do professor sem
contexto, já que a autoavaliação e a avaliação técnica podem divergir bastante. **O que a tela já
mostra hoje** (`BoxingProfileComparisonView.tsx`, existia antes desta rodada, não foi alterado pela
correção de inline — só passou a aparecer sem precisar de clique): intro neutra ("duas leituras
sobre o mesmo momento"), os dois perfis lado a lado com score, radar sobreposto, tabela das 8
dimensões comparadas, uma frase de "concordam"/"divergem" já escrita sem hierarquia ("é normal, pode
ser um bom tema pra conversar no treino" — nunca "seu professor está certo"), e um disclaimer final
explícito ("nenhuma das duas leituras anula a outra: uma é autopercepção, a outra é observação
técnica externa"). Avaliação registrada, não é decisão: a tela já evita ativamente o enquadramento
"nota vs. correção" — o texto já foi escrito assim de propósito desde que essa tela existe. Ampliar
a mediação (ex.: sugerir explicitamente "converse com seu professor sobre isso" de forma mais
proeminente, ou avisar o aluno ANTES de abrir a comparação pela primeira vez) é possível, mas é
acréscimo sobre uma base que já não é fria/numérica pura — não implementado, aguardando decisão.

**LEVA 3 — questionário de Perfil de Boxe não retomava o índice.** `BoxingProfileQuestionnaire.tsx`
restaurava `answers` do rascunho em `localStorage` corretamente, mas fazia `setIndex(0)`
incondicional no mesmo efeito — nunca calculava a posição certa. Corrigido: retoma na primeira
pergunta sem resposta (`questions.findIndex`), ou na última se tudo já estiver respondido (revisar/
enviar). Confirmado que gaps no meio do rascunho não são possíveis pela UI atual (`goNext` só avança
uma pergunta por vez, exige a atual respondida) — `findIndex` cobre esse caso também, se um dia
deixar de ser verdade.

Verificado: `tsc --noEmit` limpo, `vitest run` 39/39, `vite build` sem erro, nas três levas. **Não
testado na aplicação real ainda** — nenhuma migration nova nesta rodada (mudança só de frontend),
mas nenhum dos três foi confirmado em uso real.

### Resultado combinado de Perfil de Boxe (2026-09-11) — implementado

Retomando o achado "média entre as duas avaliações" (citado como fora de escopo na rodada anterior).
Decisões confirmadas antes de qualquer código:

- **Média simples 50/50**, sem peso pro professor — mesmo enquadramento de "duas perspectivas" que
  `BoxingProfileComparisonView.tsx` já usa, não "nota e correção".
- **Combinação por dimensão, não por arquétipo**: média de cada uma das 8 competências primeiro; o
  arquétipo do resultado combinado é derivado dessa média, nunca média dos arquétipos individuais.
- **Derivar, não armazenar** — mesmo padrão de `calcular_saldo_pacote`: função pura sobre os dois
  `BoxingProfileAssessmentSummary` que já existem, recalculada a cada leitura.
- **Convive, não substitui** — aluno e professor continuam vendo o resultado individual normalmente;
  o combinado aparece como seção adicional.
- **Se só um dos dois respondeu**: mostra a avaliação disponível como resultado, marcado como
  PARCIAL — não esconde, não força esperar o outro lado.
- **Se divergem muito**: convida a conversar ou refazer; não esconde o resultado nem o marca como
  "menos confiável".

**Correção de premissa durante a discussão do limiar:** a escala de cada dimensão é 0-100 (inteiro,
arredondado), não 0-10 nem 1-5 — o 1-5 é só a escala de resposta Likert. `computeDimensionScores`
converte via `score = ((média - 1) / 4) * 100` (`src/lib/boxingProfile/scoring.ts`).

**Contagem de perguntas por dimensão — é mista, como o usuário suspeitava:** attack, defense,
movement, reading e conditioning têm 4 perguntas cada; precision, power e speed têm 3
(`src/lib/boxingProfile/questions.ts`). Isso muda o **passo mínimo** de cada dimensão (100/4/n):
8,33 pontos de score para as de 3 perguntas, 6,25 para as de 4 — mas **não muda o significado de um
limiar fixo**, porque `score = 25×média − 25` tem inclinação constante (25 pontos de score por 1
ponto Likert de diferença média), **independente de n**. Ou seja: um limiar de 25 pontos de score já
equivale exatamente a "1 ponto Likert de diferença média" em qualquer dimensão, tenha ela 3 ou 4
perguntas — não é preciso (nem faz diferença numérica) reescrever a fórmula em termos de Likert, só
nomear a constante dessa forma no código pra deixar isso explícito e não depender de alguém redescobrir
a álgebra depois. A única imprecisão real é o arredondamento de cada lado antes da subtração (± 1 no
diff, igual pra todas as dimensões, não diferencial por n).

**Limiares de divergência — ponto de partida, não validados por dados:**
- Isolado por dimensão: diferença > 25 pontos de score (= 1 ponto Likert de diferença média).
- Agregado: média das 8 diferenças > 15 pontos de score.
- Dispara com `OR` entre os dois — desacordo espalhado OU concentrado numa única competência.

**Os dois números (25 e 15) são derivados da mecânica da escala, não de casos reais observados.**
Revisar quando houver avaliações duplas suficientes pra checar se disparam com a frequência certa —
sem isso, esses números vão parecer validados daqui a alguns meses sem nunca terem sido.

**Ressalva levantada e resolvida:** a contagem de perguntas por dimensão é mista (attack, defense,
movement, reading, conditioning têm 4; precision, power, speed têm 3) — o que muda é só o passo
mínimo de cada dimensão (100/4/n: 8,33 ou 6,25), não o significado do limiar de 25, porque a
inclinação score/média-Likert (`likertScoreFromAverage`) é constante e independente de n. Por isso a
constante do limiar isolado é computada como `likertScoreFromAverage(2) - likertScoreFromAverage(1)`
em vez de um `25` solto (`src/lib/boxingProfile/combined.ts`) — se a fórmula de conversão mudar um
dia, o limiar acompanha automaticamente, e o nome no código já diz o que ele representa.

**Textos aprovados** (com uma correção: "desta vez" removido do aviso de divergência — sugeria haver
histórico comparável, o que não existe na primeira avaliação dupla, e carregava tom de "saiu
diferente do esperado" que o resto da frase evita):
- Parcial (4 variantes, viewer × lado faltante — mesma frase-molde, troca só quem falta e quem age):
  "Por enquanto, este resultado usa só {a avaliação disponível}. Assim que {o outro lado avaliar},
  o combinado passa a considerar as duas leituras." Quando quem lê é quem pode preencher o lado que
  falta (aluno sem autoavaliação, professor sem avaliação), o botão de ação já fica logo abaixo.
- Divergência (texto único, viewer-simétrico — "as leituras se distanciam" trata o desacordo como
  propriedade da comparação, nunca erro de alguém): "As duas leituras se distanciam mais do que o
  normal{ em <Dimensão>}. Não significa que uma esteja certa e a outra errada — são ângulos
  diferentes sobre o mesmo momento. Pode valer a pena conversar sobre isso no próximo treino." O
  trecho "em <Dimensão>" só aparece quando o gatilho ISOLADO disparou; quando é só o agregado
  (desacordo espalhado, nenhuma dimensão isolada estoura), a frase não nomeia nenhuma.

**Implementação:**
- `src/lib/boxingProfile/combined.ts` (novo, com `combined.test.ts`, 8 casos): `combineAssessments`
  pura, testável isoladamente como `scoring.ts` já é. Arquétipo combinado calculado pelos mesmos
  pesos de `computeProfileScoresRaw`, **sem** o bônus comportamental (Q30-Q32) — essa camada só
  recebe `dimensionScores` já calculados de cada avaliação, não as respostas brutas; o bônus vale no
  máximo +12 num score de 0-100, então a ausência dele não muda o perfil predominante na prática
  esperada. Tipo aceito é um `CombinableAssessment` mínimo (só `dimensionScores`), não
  `BoxingProfileAssessmentSummary` direto — evita um ciclo de import, já que `integrations/backend/
  types.ts` importa `Dimension` deste mesmo pacote.
- `BoxingProfileComparisonView.tsx`: ganhou uma 3ª coluna "Combin." na tabela por dimensão (atende o
  pedido original de "ver a nota individual de cada um ao lado da combinada"), um card de "Resultado
  combinado" com o arquétipo derivado, e o aviso de divergência quando `combined.isDivergent`. Nunca
  parcial aqui — as duas avaliações sempre existem quando este componente monta.
- `BoxingProfilePartialNotice.tsx` (novo, componente compartilhado): badge "RESULTADO PARCIAL" +
  texto — usado nos 4 pontos onde só um lado existe (`PerfilLutador.tsx` × 2, `AlunoPerfilBoxe.tsx`
  × 2). `AlunoPerfilBoxe.tsx` ganhou uma 4ª ramificação que não existia (`!latestCoach && latestSelf`
  — aluno já se autoavaliou, professor ainda não): antes, esse caso caía no mesmo estado vazio
  genérico de "nada existe ainda", escondendo a autoavaliação do aluno do professor; agora mostra a
  leitura do aluno com o aviso parcial e o CTA "Avaliar como professor", espelhando exatamente o que
  `PerfilLutador.tsx` já fazia pro caso inverso.

Verificado: `tsc --noEmit` limpo, `vitest run` 48/48 (9 novos em `combined.test.ts`), `vite build`
sem erro. **Não testado na aplicação real ainda.**

### Reforma do questionário de Perfil de Boxe — versão curta/completa (2026-09-11) — implementado

**Diagnóstico que motivou a reforma:** as 29 perguntas Likert originais são todas de competência
positivamente ancorada ("consigo X") — medem NÍVEL TÉCNICO, não estilo. Um iniciante pontua baixo em
tudo, um avançado pontua alto em tudo, e o arquétipo saía de diferenças relativas pequenas e
ruidosas entre dimensões. Só as perguntas de escolha forçada (Q30-Q32) mediam estilo de verdade
(obrigam a uma troca), mas contribuíam no máximo 12 de 100. Correção: separar as duas saídas — score
por dimensão = competência = Likert = evolução; arquétipo = preferência = escolha forçada = estilo.

**1) Versão curta — as 8 perguntas Likert.** Uma por dimensão, critério explícito: o item menos
contaminado por nível técnico geral e mais ligado a uma tendência de estilo (fraseado como hábito —
"uso X" — em vez de capacidade — "consigo X" — quando havia opção assim):

| Dimensão | Escolhida | Por quê |
|---|---|---|
| Ataque | Q3 | Iniciativa (liderar vs. esperar), não execução técnica. |
| Defesa | Q7 | "Uso diferentes recursos... dependendo da situação" — variedade/adaptação, não capacidade. |
| Movimentação | Q11 | "Uso passos laterais e mudanças de ângulo" — tendência de estilo clássica. |
| Precisão | Q15 | Timing de contragolpe (bate com o maior peso da dimensão: counterpuncher). |
| Potência | Q16 | Mais fraca no critério (potência é traço físico, não estilo) — a menos misturada com OUTRA habilidade entre as 3. |
| Velocidade | Q21 | Flexibilidade de alternância entre ataque/defesa, não velocidade de mão pura. |
| Leitura tática | Q24 | "Uso fintas... pra provocar reações" — manipulação tática, marca de counterpuncher/boxer-puncher. |
| Condicionamento | Q29 | Também mais fraca no critério (capacidade física) — a menos misturada com técnica entre as 4. |

Potência e Condicionamento resistem ao critério de propósito — são dimensões inerentemente sobre
capacidade física, não sobre estilo; isso é limitação da dimensão, não da escolha.

**2) Peso da escolha forçada sobe — mecânica trocada, não só a constante.** A v1 somava o bônus
comportamental (até +4/questão) direto ao score de dimensões e cortava tudo no clamp de 100 — pra um
aluno tecnicamente avançado (dimensões perto de 100), isso absorvia quase todo o bônus exatamente
onde ele deveria pesar mais. Simplesmente subir a constante pioraria isso. v2 troca por uma
**mistura ponderada de dois sinais normalizados independentemente**:
`score = (1 − w) × scoreDimensões + w × scoreEscolhaForçada`, onde `scoreEscolhaForçada` é
`100 × (votos recebidos ÷ votos máximos possíveis nos itens aplicáveis)` — normalizado pelo NÚMERO de
itens de cada voz/variante, não um total fixo (`src/lib/boxingProfile/scoring.ts`,
`computeProfileScoresRaw`). `w = 0.24` completa, `0.30` curta (`FORCED_CHOICE_WEIGHT`,
`assessmentLength.ts`). Isso garante que a escolha forçada sempre vale essa fração do score final,
não importa o nível técnico — e resolve de graça a exclusão dos itens self-only na voz do professor:
com menos itens aplicáveis, o mesmo `w` continua valendo o mesmo percentual, só dividido entre menos
perguntas.

**Ressalva do usuário, resolvida:** a contagem de perguntas por dimensão é mista (3 ou 4), o que
muda o passo mínimo de cada dimensão, mas não muda o significado de um limiar fixo, porque a
inclinação score/média-Likert é constante — mesmo raciocínio já registrado na seção "Resultado
combinado" acima, reaproveitado aqui.

**3) Cinco itens novos de escolha forçada — FC-A a FC-E (ids q33-q37).** FC-A (fadiga), FC-B (depois
de machucar o adversário) e FC-C (contra desvantagem física) são compartilhados entre aluno e
professor. FC-D (fonte de satisfação) e FC-E (treino preferido) são **self-only** — motivação
interna, que o professor observa mal ("ele vê o que o aluno faz, não o que o aluno gosta"; também
mais estável que técnica e menos sujeita a desejabilidade social, porque nenhuma opção é "a resposta
certa"). Nunca ganham entrada em `COACH_TEXT` — `buildQuestions` filtra por presença de texto, então
`COACH_QUESTIONS` nunca as inclui, sem precisar de uma lista de exclusão redundante.

As opções de FC-A/B/C tiveram que ser reescritas em infinitivo neutro (mesmo padrão de Q30-Q32) —
vieram do usuário conjugadas em 1ª pessoa, o que quebraria a voz do professor (pergunta em 3ª pessoa
seguida de uma opção na voz do aluno). Um ajuste veio do próprio usuário durante a revisão: a opção C
de FC-C mudou de "esperar o adversário se abrir e golpear com força" pra "...e punir o erro" — a
versão anterior misturava dois sinais (timing = counterpuncher, força = puncher), ambíguo contra a
opção "trocar mesmo assim" (também puncher). O que define o contragolpe é o timing, não a potência.

**Resolução da "trava do professor"** (curta vs. completa dele usando os mesmos itens de escolha
forçada): por decisão do usuário, a curta e a completa do professor usam exatamente as mesmas 6
perguntas forçadas (todas, exceto as 2 self-only) — o que diferencia as duas variantes na voz dele é
só o número de perguntas Likert (8 vs. 29), que é a diferença que importa de qualquer forma.

Totais finais: aluno completa 37 (29+8), aluno curta 14 (8+6 — inclui FC-D, não inclui FC-B/FC-E),
professor completa 35 (29+6), professor curta 14 (8+6, mesmas 6 da completa).

**4) Âncora física — envergadura ÷ altura, só bônus (decisão revisada).** `student_profiles.wingspan_cm`
(nova coluna, nullable, mesma política de `height_cm`). Índice ≥ 1,03 (envergadura longa): Out-Boxer
+5, Counterpuncher +3. Índice ≤ 0,97 (envergadura curta): Pressure Fighter +5, Puncher +3. Entre os
dois, zona morta, sem efeito. **Proposta original tinha penalidade simétrica (±5 nos dois pares) —
o usuário cortou isso**: antropometria favorece um estilo, não desqualifica outro; penalizar Pressure
Fighter por braço longo afirmaria que ele não pode pressionar, o que é falso — só rema contra a
biomecânica. O efeito assimétrico (só bônus) já produz a separação sem essa afirmação. `null` quando
falta altura ou envergadura — nunca estima uma a partir da outra (`src/lib/boxingProfile/
physicalAnchor.ts`). Só se aplica na versão completa, aplicado sobre o score já misturado do ponto 2,
antes do arredondamento final (um único clamp no fim da pipeline, não vários acumulando).

Snapshot obrigatório: `boxing_profile_assessments.wingspan_index_used` (nova coluna, nullable) grava
o índice usado NAQUELE momento — sem isso, um resultado antigo mudaria de leitura silenciosamente se
o aluno crescer ou corrigir uma medida depois. Mesma disciplina de imutabilidade da migration 0006.

**5) Avaliações antigas — marcadas, nunca recalculadas.** A infraestrutura já existia
(`questionnaire_version`/`scoring_version` por avaliação, imutável desde a migration 0006) — só
faltava a parte visual. `QUESTIONNAIRE_VERSION`/`SCORING_VERSION` bumped pra `-v2`.
`scoringVersion` foi promovido de "só no registro completo" pra também estar em
`BoxingProfileAssessmentSummary` (é uma string barata, listas/comparação precisam dela sem buscar o
registro inteiro). `BoxingProfileScoresSummary` mostra um selo "Calculado pela fórmula anterior"
quando `scoringVersion !== SCORING_VERSION` — aparece automaticamente em toda tela que usa esse
componente (resultado individual, professor, comparação), sem precisar repetir a lógica em cada uma.

**6) Compatibilidade entre curta e completa.** Novo eixo ortogonal ao do ponto 5:
`boxing_profile_assessments.assessment_length` ('short'/'full', default 'full' pras linhas
existentes — todas eram do questionário único da v1). `BoxingProfileAssessmentSummary.assessmentLength`
no tipo. A tela "Minha evolução" (`PerfilLutadorHistorico.tsx`) filtra o gráfico de "Evolução por
dimensão" pra só avaliações `full` — a curta tem 1 pergunta por dimensão em vez de 3-4, uma medição
bem mais ruidosa, misturar as duas sugeriria uma precisão que a curta não tem. A lista "Avaliações
realizadas" abaixo continua mostrando as duas, com um selo "Rápida" nas curtas. `BoxingProfileComparisonView`
ganhou um aviso quando `self.assessmentLength !== coach.assessmentLength` (ou `scoringVersion`
diferente): "essas duas avaliações usam versões diferentes... não são diretamente comparáveis" —
continua mostrando os números, só com a ressalva em destaque, em vez de esconder o resultado.

**Dívida registrada, não implementada:** `combineAssessments` (resultado combinado, seção anterior)
ainda ignora o componente de escolha forçada — era uma aproximação pequena na v1 (bônus de ~12
pontos), mas agora que escolha forçada é 24%-30% do score de cada avaliação, essa aproximação ficou
bem maior: o arquétipo combinado pode divergir do que sairia se a escolha forçada de cada lado
entrasse na conta. Corrigir isso exigiria persistir o score de escolha forçada de cada avaliação
separadamente (hoje só o score final misturado é salvo) — mudança de schema maior que o pedido desta
rodada. Registrado em `src/lib/boxingProfile/combined.ts`.

**Novo fluxo de UI:** as duas páginas de questionário (`PerfilLutadorQuestionario.tsx`,
`AlunoPerfilBoxeQuestionario.tsx`) ganharam uma tela de escolha (`BoxingProfileLengthChoice.tsx`)
antes de começar a responder — rápida ou completa, com o aviso de que os resultados não são
diretamente comparáveis. `draftKey` do rascunho em `localStorage` passou a incluir a variante
(`....self.<id>.<length>`), senão um rascunho curto e um completo colidiriam na mesma chave.
`StudentPerfil.tsx` ganhou o campo "Envergadura (cm)", opcional, ao lado de altura/peso.

Verificado: `tsc -b --noEmit` limpo, `vitest run` 73/73 (25 novos: `physicalAnchor.test.ts` completo
+ reescrita de `scoring.test.ts`/`questions.test.ts` pra v2), `vite build` sem erro. **Não testado na
aplicação real ainda** — inclui uma migration nova (0024), então precisa rodar no Supabase antes de
qualquer teste end-to-end.

### Resultado combinado — corrigindo a lacuna da escolha forçada (2026-09-11) — implementado

Retomando a dívida registrada na seção anterior: com escolha forçada valendo 24%-30% do score de
cada avaliação (era ~12% na v1), ignorá-la no resultado combinado deixou de ser uma aproximação
pequena e virou um bug visível — o arquétipo combinado pode divergir dos dois individuais e a tela
de comparação mostra os três lado a lado, sem explicação possível ("você: Out-Boxer, professor:
Out-Boxer, combinado: Counterpuncher").

**O que precisou ser persistido: nada.** As respostas de escolha forçada já são gravadas em
`boxing_profile_assessments.answers` (jsonb) desde a migration 0006 — o score de escolha forçada é
recalculável a partir dali, não precisava de coluna nova. O que faltava era só PASSAR essa informação
pra `combineAssessments`, que hoje só recebia `dimensionScores`.

**Correção (`src/lib/boxingProfile/combined.ts`):**
- `behavioralScoreRaw` (a mesma fórmula usada em `scoring.ts`) foi exportada em vez de duplicada —
  nunca deveria haver uma segunda cópia dessa conta.
- `CombinableAssessment` ganhou `answers`, `assessmentType`, `assessmentLength` e `profileScores`.
  Como consequência, o tipo que satisfaz essa forma deixou de ser `BoxingProfileAssessmentSummary`
  (o resumo leve de `getBoxingProfileHistory`, sem `answers`) e passou a ser `BoxingProfileAssessment`
  (o registro completo) — de propósito: obriga quem chama a buscar o registro completo, não dá pra
  esquecer silenciosamente.
- Caso os dois existam: o score de escolha forçada de cada lado é recalculado a partir de `answers` +
  as perguntas aplicáveis daquela voz/variante (`getQuestions(assessmentType, assessmentLength)`) —
  os dois já saem normalizados 0-100, então se combinam pela média, mesma filosofia já usada pra
  dimensão. O peso da mistura (`forcedChoiceWeight`) usado na combinação é a média dos dois pesos de
  origem (`FORCED_CHOICE_WEIGHT[self.length]`/`[coach.length]`).
- **Achado da revisão, não pedido originalmente:** o caso PARCIAL (só um dos dois respondeu) tinha a
  MESMA omissão, e ali a correção é ainda mais direta — o `profileScores` certo (com escolha forçada
  e tudo) já existia, calculado no momento em que aquela avaliação foi enviada. A versão anterior
  descartava isso e recalculava do zero só com peso de dimensão. Agora usa `only.profileScores`
  direto, sem recalcular nada.

**Registrado por pedido explícito, não decisão própria:** a média dos dois pesos (`forcedChoiceWeight`)
quando aluno e professor usam variantes diferentes (curta com professor, completa com aluno, etc.) é
**convenção por ausência de razão melhor, não uma calibração**. Não existe um peso "certo" pra
combinar uma leitura de 14 itens com uma de 37 — o aviso de "não diretamente comparável" já existente
na tela cobre o usuário sobre isso; a média é só o que o código faz quando não há uma resposta
fundamentada melhor. Registrado aqui pra ninguém, daqui a alguns meses, ler esse número e achar que
foi calibrado.

**Efeito colateral descoberto e tratado — carregamento da tela de comparação:** como
`BoxingProfileComparisonView` agora exige o registro completo (com `answers`), e a lista de
histórico só traz o resumo leve, as três telas que montam essa comparação (`PerfilLutador.tsx`,
`AlunoPerfilBoxe.tsx`, e a rota órfã mas ainda ativa `PerfilLutadorComparacao.tsx`) precisaram de 2
requisições novas cada (`getBoxingProfileAssessment` pros dois ids), disparadas só quando as duas
avaliações já existem — não em toda visita à tela. Antes, a comparação renderizava assim que o
resumo do histórico chegava, sem espera adicional; agora há uma janela real de carregamento entre o
resumo resolver e os dois registros completos chegarem. Tratado com skeleton (`SkeletonList`, mesmo
padrão já usado em todo o app) nessa janela, e um `ErrorState` com retry se alguma das duas
requisições falhar — em vez de deixar a tela piscar entre "nada" e a comparação.

Verificado: `tsc -b --noEmit` limpo, `vitest run` 75/75 (2 novos testes em `combined.test.ts`
demonstrando o bug corrigido: com dimensões empatadas entre os 6 perfis, respostas de escolha
forçada favorecendo o mesmo perfil dos dois lados agora decidem o arquétipo combinado — sem elas,
cai no desempate fixo), `vite build` sem erro. **Não testado na aplicação real ainda.**

### Arte compartilhável do Perfil de Boxe — cancelada (2026-09-14)

Cogitada em duas versões: primeiro 6 combinações (2 formatos — story/feed — × 3 conteúdos —
arquétipo só / +radar / +3 pontos fortes), geração via SVG próprio rasterizado (Canvas 2D e
`html2canvas` descartados nesse meio-tempo — o segundo especificamente por reimplementar CSS sem o
motor do navegador, arriscado neste app porque o tema inteiro usa `hsl(var(--accent))`); depois um
pivô pra um template único com foto realista fixa de atleta (nome, arquétipo e uma pontuação
agregada nova sobrepostos por cima). O Story B (arquétipo + radar) chegou a ser implementado e
revisado visualmente antes do pivô.

**Cancelada, não pausada** — bloqueio real: o template com foto dependia de um arquivo PNG final que
precisaria vir de fora (nenhuma ferramenta de geração de imagem fotorrealista disponível), e ao
tentar fechar os detalhes desse template (cidade da unidade, fórmula da pontuação "92", critério das
estrelas) apareceram inconsistências com o que já está estabelecido no app (nenhum conceito de
"unidade"/cidade existe no schema; o app é de um tenant só, Salvador/Bahia) sem uma resposta clara o
suficiente pra seguir. Se a ideia do card com foto voltar um dia, o bloqueio a resolver primeiro é
esse arquivo-base, não o conceito em si.

Nada disso chegou a ser commitado — toda a implementação (Story B incluso) foi revertida do working
tree antes de qualquer commit, sem impacto em produção. Nenhuma migration foi criada em nenhum
momento (a feature era 100% front-end desde o plano original).

### Home do aluno: rodadas de crítica de design, sugestão de horário e segurança de `bookings` (2026-09-28)

Sessão de design da Home do aluno (`src/pages/student/Home.tsx`) com o skill `/impeccable`: 6
críticas (nota 23 → 25 → 25 → 27 → 26 → 27 de 40), cada achado corrigido em um commit próprio na
`dev`, um passo por vez, com push só depois do ok do Lucas. Relatórios em `.impeccable/critique/`
(um por rodada); contexto de produto em `PRODUCT.md` (raiz). Não repetir aqui o que os commits já
contam — só o que é decisão, fato do banco ou armadilha.

**Página de amostras `/dev/amostras` (`src/dev/Amostras.tsx`).** Renderiza a Home real em ~10
situações com dados inventados, sem login e sem Supabase (QueryClient pré-preenchido + perfil falso
via `AuthContext`, exportado só pra isso). Só existe em `npm run dev`: `main.tsx` a importa atrás
de `import.meta.env.DEV` — conferido que não entra no build. É o jeito de revisar UI sem credencial.
**Armadilha já paga:** amostra precisa imitar o que o banco produz de verdade. Uma amostra "pacote
ativo com 0 aulas" (estado que o banco nunca gera — usar a última aula muda o pacote pra
`finished`, 0001:498) escondeu uma regressão: aluno veterano com pacote terminado via as
boas-vindas de aluno novo. Corrigido com `lastPackage` em `getStudentHome`.

**Decisões do Lucas nesta sessão (não reabrir sem ele):**
- Cartão de saldo: número grande = **aulas restantes no pacote** (total − usadas), não "créditos
  para agendar". Pro aluno, a frase de baixo só diz o que ainda dá pra agendar.
- Arquétipos do Perfil de Boxe: nome em inglês **com tradução em português embaixo**
  (`FIGHTER_PROFILE_GLOSS_PT`, traduções sugeridas pelo Claude, aceitas sem ajuste).
- Um verbo só pro aluno pedir aulas: **"Pedir"**. Link "Pedir mais aulas" no alerta de poucas aulas,
  mesmo antes de acabar — o professor é avisado na aprovação (ver abaixo).
- Recusar sugestão de horário **registra a recusa** (aula fica `rejected`) e tem "Desfazer".
- Brilho vermelho dos botões primários mantido: é identidade definida no spec.
- Canal do aluno com o professor: **WhatsApp**, guardado por professor (0032, ver abaixo).

**Fato do banco: `approve_purchase_request`** (lida via `pg_get_functiondef` — não está nas
migrations deste repo). Aprovar um pedido **encerra o pacote ativo do aluno**:
- pedido de pacote → `assign_package_from_template` → fecha os ativos **não-trial**;
- pedido de **aula avulsa** → `update packages set status='finished' where status='active'`,
  **sem filtro de origem: fecha também a aula experimental**, e insere um pacote de 1 aula sem
  passar por `_create_package`.
As aulas já agendadas não se perdem (a conclusão debita do pacote novo pela busca "mais antigo
ativo com vaga"); o que se perde é o que sobrava pra agendar. `Pedidos.tsx` agora mostra quantas
aulas o aluno perderia e pede confirmação antes de aprovar (`classesLostOnApprove`).
**Decidido pelo Lucas e corrigido na 0031:** aprovar aula avulsa **não** encerra a aula experimental (ver abaixo).

**Fato do banco: o que o aluno pode alterar em `bookings`** (`pg_policies`,
`information_schema.column_privileges`, lidos em 2026-09-28). Única policy de UPDATE do aluno,
`bookings_student_update`: USING = aula dele, `status = 'scheduled'`, início ≥ 6h; WITH CHECK =
status novo `scheduled`/`cancelled` e, se não for cancelamento, horário igual a um
`availability_slot` publicado. O grant de UPDATE pra `authenticated` cobre **todas** as colunas.
Dois problemas saíram disso:
1. **Aceitar/recusar sugestão nunca funcionaram** pro aluno: eram UPDATE direto numa aula
   `rejected_with_suggestion`, fora do USING — 0 linhas afetadas, sem erro, e o app mostrava uma
   mensagem enganosa. (A spec original listava essa tela como débito; ela foi construída sem
   nunca ter passado pela RLS.)
2. **Furo de crédito:** o aluno podia cancelar gravando `cancelado_por = 'professor'` (nunca
   consome na recorrência), mover a aula de horário sem aprovação, ou mexer em
   `pacote_id`/`cadeia_id`/`teacher_note` — tudo pelo cliente, fora do app.

**Migration 0030 (`0030_sugestao_rpcs_e_guarda_update_aluno.sql`) — APLICADA e VERIFICADA
(2026-09-28), 8/8 OK em `supabase/verify_0030_sugestao_e_guarda.sql`** (transação com rollback,
testa como aluno e como professor trocando `role` e `request.jwt.claims`):
- RPCs `aceitar_sugestao` / `recusar_sugestao` / `desfazer_recusa_sugestao`, `security definer`,
  com checagem de posse e de estado. Aceitar exige aula disponível
  (`available_credits_for_student`) e traduz a colisão da 0028 em `slot_taken`. Recusar guarda o
  horário sugerido nas colunas `suggested_*` (a aula fica `rejected` com elas preenchidas), então
  desfazer não recebe horário do cliente.
- Trigger `_guarda_update_booking_pelo_cliente` (BEFORE UPDATE): quando a escrita vem direto do
  cliente (`current_user` ∈ `authenticated`/`anon`) e quem escreve **não** é o professor dono da
  aula, só aceita cancelar (`scheduled` → `cancelled`, sem mexer em outra coluna) e **carimba
  `cancelado_por = 'aluno'`**. RPCs passam direto porque, em `security definer`, `current_user` é
  o dono da função.
- **Consequência de crédito, deliberada:** cancelamento pelo aluno deixa de gravar NULL. No
  autosserviço não muda nada (quem manda é o ledger); na recorrência, cancelar passa a consumir
  crédito se `falta_consome_credito` — que é a regra documentada em "Crédito — regra única". O NULL
  anterior caía no `else 0` da whitelist da 0013 (fail-open). **Se o aluno de recorrência deveria
  poder cancelar é a decisão da Etapa 8 — continua em aberto; a 0030 manteve o comportamento de
  permitir.**
- Os dois triggers antigos de `bookings` (`trg_validate_booking_status_time`,
  `trg_prevent_future_completed`) não estão neste repo e não foram lidos; o script de verificação
  passou por eles sem erro nas transições usadas.

**Lição pra próxima sessão:** toda escrita do aluno em `bookings` precisa ir por RPC — desde a
0034 inclusive cancelar. Um UPDATE direto novo do lado do aluno vai ser barrado pela guarda da 0030
(erro `not_allowed`) — isso é intencional, não um bug a contornar abrindo a guarda.

**Migrations 0031–0034 (2026-09-28) — todas APLICADAS e VERIFICADAS por script com rollback.**
Mesmo formato da 0030: arquivo em `supabase/migrations/`, script `supabase/verify_00NN_*.sql` que
testa como aluno e como professor trocando `role`/`request.jwt.claims`. **Atenção ao aplicar:**
duas vezes nesta sessão o script de verificação foi rodado antes da migration (erro "function ...
does not exist"); a migration fica em `supabase/migrations/`, o script direto em `supabase/`.

- **0031 — aula avulsa preserva a experimental.** Decisão do Lucas. `approve_purchase_request` (corpo
  copiado do banco) passa o ramo de aula avulsa por `_create_package(..., 'purchase', 'single')`, o
  caminho único da decisão 6, que fecha só os ativos não-trial. A linha criada é a mesma de antes.
  `Pedidos.tsx` deixa de contar a experimental como aula perdida. Verify: 4/4 OK.
- **0032 — WhatsApp do professor.** Decisão do Lucas: o canal do aluno com o professor é o WhatsApp,
  **por professor** (produto multi-professor, cada um com a própria marca — nunca fixo no código).
  `profiles.whatsapp` (só dígitos, CHECK 10–15), RPC `whatsapp_do_professor` no padrão de
  `modo_agendamento_efetivo` (o aluno não lê `profiles` do professor), preenchido com
  +55 11 94703-4983 só porque havia um único professor sem número. Editável em Configurações
  (`src/lib/whatsapp.ts` normaliza). Aparece na Home do aluno como "Falar com o professor" (link
  wa.me com o primeiro nome do aluno, sem citar marca) e no detalhe da aula quando faltam < 24h.
  Sem número cadastrado, nada aparece.
- **0033 — aluno de recorrência pede remarcação.** Decisões do Lucas: pode pedir pra **qualquer**
  hora cheia livre do professor entre **06h e 22h** (São Paulo), **todos os dias**, com **24h** de
  antecedência (da aula e do horário novo); o pedido fica **pendente até o professor aprovar**; **um
  pedido pendente por aula**; o aluno **pode cancelar o próprio pedido**.
  - O pedido é uma linha nova `pending_confirmation` ligada à original (replacement_for_booking_id,
    cadeia_id e pacote_id herdados) — reserva o horário na constraint da 0028. A original segue
    `scheduled` até a decisão.
  - `aprovar_remarcacao` = o que `reagendar_aula` faz (original -> `rescheduled`, pedido ->
    `scheduled`, ressincroniza `used_classes`).
  - **Recusar ou cancelar o pedido tira ele da cadeia** (replacement_for_booking_id = null,
    cadeia_id = o próprio id, pacote_id = null). Obrigatório: ligado, ele viraria o terminal da
    cadeia e `calcular_saldo_pacote` aplicaria a regra de crédito ao pedido, não à aula real.
  - Funções auxiliares (`_desligar_pedido_da_cadeia`, `_original_para_remarcacao`,
    `_inicio_hora_sp`) com REVOKE, como `_create_package` — `_desligar_...` não checa quem chama.
  - No app: `approveBooking`/`rejectBooking` reconhecem "pendente com antecessor" e chamam as RPCs
    (só mudar o status deixaria a original e a nova agendadas juntas). Numa recusa de remarcação a
    sugestão de horário é ignorada. `VinculoAula` ganhou `pedido_remarcacao` ("Pedido de remarcação").
  - O detalhe da aula do aluno (`getBookingDetail`) passou a ler a aula da TABELA: a view
    `booking_history_app` não expõe `pacote_id`/`replacement_for_booking_id`.
  - Verify: 11/11 OK.
- **0034 — o aluno cancela a própria aula por RPC.** Bug anterior à sessão: a policy do aluno só
  alcança `scheduled`, então cancelar uma aula **pendente** (autosserviço, antes da aprovação)
  nunca funcionou e o app culpava o prazo de 6h. `cancelar_minha_aula`: pendente cancela até o
  início; agendada até 6h antes; grava `cancelado_por = 'aluno'`; na recorrência ressincroniza o
  pacote; se for pedido de remarcação, desiste do pedido. Verify: 3 OK + 1 AVISO (o caso "< 6h" não
  montou a aula de teste porque o horário real estava ocupado).

**Etapa 8, parcialmente decidida:** o aluno de recorrência **pode pedir remarcação** (0033) e
**continua podendo cancelar** (comportamento de sempre, agora pela 0034, consumindo crédito se o
pacote tiver `falta_consome_credito`). O `aviso_ausencia` original da Etapa 8 não foi implementado
nem rediscutido.

### Painel do professor: redesenho por crítica de design (2026-09-28) — sem migration nova

Três críticas `/impeccable` do painel (`src/pages/admin/Dashboard.tsx`): **20 → 27 → 30 de 40**.
Relatórios em `.impeccable/critique/*admin-dashboard*`. Tudo só de frontend (nenhuma migration),
um passo por commit na `dev`, cada um testado pelo Lucas. Não repetir aqui o que os commits contam.

**Estrutura do painel (decisões do Lucas — não reabrir sem ele):**
- **"Hoje" primeiro**, como destaque: aula em andamento ou próxima (contagem "em 40 min", relógio de
  1 min), resto do dia abaixo, passadas apagadas. "Dia livre" + "Próxima aula" quando não há mais
  aula hoje. Os quadrinhos "Hoje N aulas"/"Alunos N ativos" **saíram** (decisão explícita).
- **"Resolver agora" logo abaixo** (não acima — decisão explícita): grupos recolhíveis que lembram
  na sessão se estavam abertos (`sessionStorage`, `painel.grupo.*`):
  - pedidos de horário (Aprovar/Recusar via `usePendingActions`);
  - aulas sem registro (Aconteceu/Faltou via `useLessonActions`) e **"Todas aconteceram"** (2+ aulas;
    confirma listando; registra uma por vez — várias podem ser do mesmo pacote; um só "Desfazer");
  - pedidos de aulas (link para Solicitações);
  - o que **falta configurar** (WhatsApp sempre; horários e pacotes só no autosserviço) — continua
    aparecendo depois do primeiro aluno. Sem aluno nenhum, os mesmos passos viram "Comece por aqui"
    (+ "Convidar o primeiro aluno"), com "N de M passos feitos".
- Tocar numa aula "Sem registro" na agenda de hoje **leva ao item** em "Resolver agora" (abre o
  grupo, rola, destaca, foca "Aconteceu"); se o item não estiver lá, abre o detalhe.
- Foco: resolver um item leva o foco pro próximo item/título do grupo/"Resolver agora"/"Hoje" —
  nunca pro começo da página. Os avisos (Sonner) já são `aria-live`; Alt+T alcança o "Desfazer".
- "Alunos em risco" = pacote acabando (≤2 restantes) ou 2 faltas seguidas; máx. 3 no painel;
  "Ver todos" abre `/admin/alunos?filtro=risco` (filtro na URL).

**Registrar aula (decisões do Lucas, valem no painel, na Agenda e no detalhe da aula):**
- **"Aconteceu" registra direto, sem janela** — tem "Desfazer" no aviso e o botão permanente
  "Desfazer conclusão" no detalhe. Não recolocar a confirmação.
- **"Faltou" só confirma quando a falta DESCONTA aula** (ou quando a regra não pôde ser lida).
- Botões se chamam **"Aconteceu"/"Faltou"** em todas as telas (antes "Concluir"/"Falta").

**Bug de texto corrigido — a janela prometia a regra errada:** a janela de falta lia sempre
`profiles.no_show_consumes_class`. A regra real (`getRegraDeConsumo`, `api.ts`) espelha o banco:
- aula com `pacote_id` → `coalesce(pacote.falta_consome_credito, configuração)` (decisão 3) — vale
  pra falta e pra "o aluno cancelou";
- sem pacote: falta segue a configuração; **reposição nunca desconta** (`mark_no_show`, 0020);
  **cancelamento nunca desconta** (`cancelar_aula` não lança nada no ledger).
Qualquer texto novo sobre "desconta ou não" deve sair dessa função, nunca da configuração direto.

**Cor com significado (decisão do Lucas) e selo único:**
- `StatusBadge` (`src/components/StatusBadge.tsx`) é o ÚNICO selo de status — as 9 telas que
  montavam o seu passaram a usá-lo. Não montar `<Badge className={cfg.badgeClass}>` de novo.
- **"Concluída" = neutro com ✓** (era dourado, quase igual ao âmbar no selo pequeno). **Âmbar = depende
  do professor** ("Sem registro", "Pendente"). Vermelho = falta/recusa. **Dourado = ação positiva**
  (botão `variant="soft"`: Aconteceu/Aprovar — sem o brilho vermelho, que fica pra UMA ação
  principal por tela). Horários futuros em branco, não dourado.
- **"Sem registro"** é o nome de aula `scheduled` que já passou, em todas as telas (antes a Agenda
  dizia "Aguardando confirmação").

**"Restantes", não "créditos", nas telas do professor:** "créditos para agendar"
(`available_credits_for_student`) desconta as aulas já marcadas — na recorrência dá 0 por
construção e todo aluno aparecia em vermelho. Lista de alunos, "Alunos em risco" e cartão do aluno
mostram **aulas restantes** (total − usadas; `saldo_pacotes` na recorrência, número e "usadas").
`creditsByStudent()` foi removida (único uso era a lista).

**Página de amostras:** ganhou o painel em 4 situações e a lista de alunos. Em dev, cada conjunto de
dados de exemplo fica em `window.__amostrasAdmin` (o StrictMode cria dois por conjunto — usar o que
tem observador) para simular "item resolvido" pelo console.

**Deixado para depois (registrado, não pedido):** desfazer uma remarcação aprovada (precisaria de
RPC nova); "há N dias" ao lado de aula sem registro; "Convidar o primeiro aluno" abrir o convite
direto em vez da lista.

### Agenda do professor: duas rodadas de crítica (2026-09-28) — sem migration nova

`src/pages/admin/Agenda.tsx`: críticas **22 → 27 de 40**, depois mais 5 correções (relatórios em
`.impeccable/critique/*admin-agenda*`). Mesma disciplina do painel: um passo por commit, testado
pelo Lucas. As regras de cor, `StatusBadge`, "Aconteceu"/"Faltou" e `getRegraDeConsumo` da seção
anterior valem aqui igualmente.

**Decisões do Lucas (não reabrir sem ele):**
- **Semana de segunda a domingo** (`startOfWeek`, `weekStartsOn: 1`), não "os próximos 7 dias". Botão
  **"Hoje"** quando fora de hoje; trocar de semana mantém o dia da semana. Setas e período numa linha
  própria, pros 7 dias caberem na largura (44px cada) sem rolagem.
- **Botões no cartão só quando a aula pede ação:** pedido pendente (Aprovar/Recusar) e aula passada
  sem registro (Aconteceu/Faltou). Aula futura ou já registrada só mostra (nome, horário, selo, ›);
  Remarcar, Cancelar e "Marcar como reposição" ficam no **detalhe da aula** (`AulaDetalhe.tsx`).
- **Pendência fora da semana na tela vira uma linha com atalho** acima dos dias ("1 aula sem registro
  na semana passada ›" / "… depois desta semana ›") — resolve o ponto cego da segunda-feira.

**Estrutura e armadilhas:**
- O cartão **não é um botão** — só o cabeçalho (nome/horário/selo) abre o detalhe. Antes o cartão
  inteiro era `<button>` com as ações dentro (HTML inválido). Não voltar a envolver ações num botão.
- Coluna do cartão e bloco de texto precisam de `min-w-0`: sem isso uma etiqueta de vínculo ou a linha
  "de → para" empurrava o cartão pra fora da tela (regressão real, corrigida no mesmo dia).
- `getAdminAgendaForDay` mostra **uma aula por hora** e agora **exclui recusadas**
  (`rejected`/`rejected_with_suggestion`, além de `cancelled`/`rescheduled`): uma recusada podia
  esconder a aula real do mesmo horário. Havendo mais de uma na hora, a ativa ganha.
- Bolinhas marcam aula sem registro **e** pedido pendente (`getPedidosPendentes`, chave
  `agenda-pedidos-pendentes` — invalidada também pelo painel).
- Estados de tempo: `StatusBadge` ganhou **"Agora"** (aula em andamento); pedido cujo horário já
  começou mostra "O horário deste pedido já passou."; horários livres que já começaram (hoje) ou de
  dias passados não aparecem.
- Dia vazio: aviso próprio; "Publicar horários" só no autosserviço e em dia que não passou.
- `formatQuando` (`dateUtils.ts`) é a data de começo de linha ("Amanhã, 07:00" / "Terça-feira,
  06 out · 07:00"), usada pelo painel e pela agenda. Variant `destructive` do botão usa `--red-text`
  (o vermelho puro dava 4,0:1).

**Página de amostras:** a agenda está lá com ±3 semanas de dados (hoje com todos os estados, amanhã
com pedidos, depois de amanhã sem horários). Os horários de hoje são relativos à hora atual — tarde da
noite, as aulas "futuras" aparecem como passadas.

**Deixado para depois (sugerido pela crítica, não pedido):** "Todas aconteceram" também na agenda;
"ir para data"; tocar num horário livre pra marcar aula ali.

### Agendar (aluno): rodada de crítica (2026-09-28) — sem migration nova

`src/pages/student/Agendar.tsx`: crítica **24/40** (relatório em `.impeccable/critique/*student-agendar*`),
seis passos na `dev`, testados pelo Lucas.

**FATO DO BANCO (conferido pelo Lucas em 2026-09-28, não é suposição): a aula do autosserviço já
nasce CONFIRMADA.** `schedule_booking` (0025) grava `status = 'scheduled'`, e `bookings` não tem
nenhum gatilho de INSERT — os três gatilhos (`trg_guarda_update_booking_pelo_cliente`,
`trg_prevent_future_completed`, `trg_validate_booking_status_time`) são todos BEFORE UPDATE. Todas as
aulas com `slot_id` estavam `completed`, nenhuma `pending_confirmation`. Consequências:
- O aviso depois de confirmar NÃO fala em aprovação ("Aula agendada · Amanhã, 19:00").
- Hoje o "Aprovar/Recusar" do painel e da agenda só recebe **pedido de remarcação** (0033). O caminho
  de aprovar um "novo horário" do autosserviço continua no código, mas nada o alimenta — não remover
  sem decisão; só não escrever texto novo supondo que o aluno espera aprovação.
- Resolve a dúvida registrada em `supabase/README.md` ("não dá para ver com que status a aula nasce").

**Decisões do Lucas:**
- A tela **abre no primeiro dia com horário livre** (senão, amanhã). Antes abria sempre em depois de
  amanhã (`useState(1)` com a lista já começando amanhã).
- **Horários ocupados não aparecem** pro aluno — só os livres.
- Vocabulário: "Você pode agendar mais N aulas" (nunca "crédito(s) disponível(is)").

**O que mudou e armadilhas:**
- Horários da semana numa busca só: `getAvailableSlotsForDays` (chave `available-slots-semana`,
  agrupado por dia "yyyy-MM-dd" em São Paulo). A faixa de dias é a mesma da agenda do professor
  (7 dias na largura, ponto nos dias com horário, número apagado nos sem), com o dia por extenso e a
  contagem embaixo.
- Sem aula para agendar (`credits === 0`), a tela inteira vira um aviso com o motivo — todas
  agendadas / aulas acabaram ("Pedir mais aulas"), nunca teve pacote ("Pedir pacote"), pedido já com
  o professor (sem botão). Antes deixava escolher e só errava no "Confirmar".
- Dia sem horário aponta o próximo dia que tem ("Ver Quinta-feira, 01 out"), em botão secundário
  (`EmptyState` ganhou `ctaVariant`).
- **Armadilha resolvida, vale pro app inteiro:** `.page-container` usava `animation-fill-mode: both`;
  a transformação final (identidade) ficava aplicada e transformava o container na referência de
  qualquer `position: fixed` dentro dele — a barra "Confirmar" rolava junto com a lista. Agora é
  `backwards` (`index.css`). Não voltar pra `both`, e desconfiar de qualquer `transform`/`filter`
  permanente num ancestral de elemento fixo.
- `PageHeader`: foco visível no voltar; subtítulo 13px (vale pra todas as telas que o usam).

### Detalhe da aula (professor e aluno): rodada de crítica (2026-09-29) — migration 0035

`src/pages/admin/AulaDetalhe.tsx` (crítica **24/40**) e `src/pages/student/AulaDetalhe.tsx` (**25/40**),
relatórios em `.impeccable/critique/*auladetalhe*`. Sete passos na `dev`, testados pelo Lucas. As duas
telas estão na página de amostras (professor: 4 situações; aluno: 4).

**Migration 0035 (`0035_cancelar_desconta_aula.sql`) — APLICADA e VERIFICADA (4/4 OK,
`supabase/verify_0035_cancelamento_desconta.sql`):** `cancelamento_desconta_aula(p_booking_id)`,
`security definer`, só leitura, só a aula do aluno logado (`not_allowed` pra outro). Aula com
`pacote_id`: `coalesce(pacote.falta_consome_credito, profiles.no_show_consumes_class, true)` — o que
`calcular_saldo_pacote` aplica a "cancelada pelo aluno"; sem pacote (autosserviço): `false` (cancelar
nunca lança nada no ledger). O aluno não lê `profiles` nem a cópia da regra, por isso uma função só com
a resposta (mesmo padrão de `whatsapp_do_professor`).

**Decisões do Lucas (não reabrir sem ele):**
- **Aluno a menos de 6h de aula agendada:** o botão "Cancelar aula" **sai** e entra o quadro "Faltam
  menos de 6 horas" com o botão do **WhatsApp** do professor — recorrência **e** autosserviço.
  `cancelar_minha_aula` (0034) já recusava; o botão só errava depois de confirmar. Pedido pendente
  continua cancelável até o início.
- **Janela de cancelar do aluno (recorrência) diz a consequência:** "Pela regra do seu pacote, cancelar
  desconta 1 aula" / "não desconta aula" (0035).
- **Detalhe do professor, aula passada sem registro:** só **Aconteceu/Faltou** + botão **"Outras
  ações"** (abre Remarcar, Cancelar aula e "Marcar como reposição"). Aula futura mantém as três à vista.
- **Pedido pendente no detalhe do professor tem Aprovar/Recusar** (`usePendingActions`, com o "Antes:"
  riscado) — antes era beco sem saída pra quem chegava por notificação.
- **Detalhe do aluno segue o momento da aula:** com pedido de outro horário pendente o quadro sobe pra
  logo abaixo da data e o selo ganha "Pedido em análise"; depois da aula o recado do professor vem
  primeiro e endereço/chegada/equipamento/orientações saem.

**Armadilhas e detalhes:**
- `getAdminBookingDetail` devolve `antecessorInicio` e **não conta o pedido ainda pendente** em
  "Remarcada Nx" (o pedido entra na cadeia ao ser feito — 0033 —, contá-lo mostrava "Remarcada 1x"
  antes de qualquer aprovação). `vinculoPorAntecessor` foi removida; use `antecessores()`.
- `RescheduleSheet` (professor) abre no primeiro dia em que a hora da aula ainda é futura e não é a
  própria aula ("Atual: …"), rola até o dia/hora escolhidos, apaga as horas passadas de hoje. **Não**
  marca horários livres/ocupados (exigiria consulta por dia; o banco já recusa colisão com mensagem
  legível) — ficou de fora.
- Avisos do professor sem a palavra "crédito" ("o aluno não perde a aula", "não desconta outra aula").
- Seções do detalhe do aluno são `<h2>` de verdade; `RemarcacaoSheet` tem "Tentar de novo" no erro.
- O `CancelLessonSheet` e o botão "Cancelar aula" usam a variant `destructive` (não `!text-destructive`).

**Deixado para depois (registrado, não pedido):** marcar horários livres/ocupados na janela Remarcar do
professor; pontos nos dias com horário livre na janela "Pedir outro horário" do aluno; confirmação em
"Cancelar pedido" do aluno.

### Entrada: convite e criar conta — rodada de crítica (2026-09-29) — sem migration nova

`Convite.tsx`, `CriarConta.tsx`, `ConfirmarEmail.tsx`: crítica **~18/40** no caminho do convite (a revisão
leu só o código; a varredura mediu as telas). Relatório em `.impeccable/critique/*convite*`. Cinco passos
na `dev`. As quatro telas estão na página de amostras ("Entrada"), sem sessão (`SemLogin`).

**FATO DO PAINEL DO SUPABASE (informado pelo Lucas em 2026-09-29): "Confirm email" está ATIVO.** Toda
conta nova nasce **sem sessão** até o aluno abrir o link do e-mail. Consequência que era um erro real: o
Convite chamava `supabase.auth.signUp` direto e seguia para `accept_invite` (que exige usuário logado)
sem sessão — falhava no meio, deixando **conta criada e convite não usado** (e "já cadastrado" na segunda
tentativa). Corrigido:
- `Convite` usa `signUpWithPassword` (o mesmo de Criar conta, que já tratava `needs_confirmation`).
- Sem sessão: o token vai para `localStorage` (`src/lib/convitePendente.ts`) e o aluno segue para
  `/confirmar-email?…&convite=1`. **O `AuthProvider` conclui o convite** (`acceptInvite`) assim que há
  usuário logado — pelo link do e-mail ou por login normal —, e limpa o token de qualquer jeito (convite
  usado/expirado não tenta de novo a cada abertura).
- Aluno que já tem conta: erro "Já existe uma conta…" + "Entrar com esta conta"; o convite fica guardado e
  conclui no login.
- **Não desfazer:** qualquer fluxo que dependa de sessão logo depois de `signUp` está errado neste
  projeto.
- ⚠️ Alunos convidados ANTES da correção podem ter conta sem vínculo com o professor. Se aparecerem,
  preparar uma consulta para achá-los e ligá-los (não foi feito; nenhum caso relatado até agora).

**Decisões do Lucas:**
- **Sem o nome do professor no convite** ("seguir só com o texto"): `validate_invite` devolve só
  `(is_valid, reason)` e quem abre o link não tem login (`supabase/README.md`). Texto: "Seu professor
  convidou você… agende suas aulas e acompanhe seu pacote por aqui."
- Convite e Criar conta usam **um formulário só** (`ContaForm`): regras da senha ao vivo com ✓ e texto
  pro leitor de tela, "Mostrar senha", confirmar, erro por campo, autocomplete, e o botão desativado
  explica o porquê. Não voltar a duplicar o formulário.
- Convite inválido diz o que fazer ("Peça um novo link ao seu professor" + "Já tenho conta · Entrar"),
  usa `reason` só para escolher a frase (o valor vem do banco, não está no repositório — genérica quando
  não reconhece) e **falha de conexão é "SEM CONEXÃO" com "Tentar de novo"**, nunca "CONVITE INVÁLIDO".
- "Confirme seu e-mail": instrução + dica do spam desde o início; **"Já confirmei, entrar" é o botão
  principal**, "Reenviar" o secundário; vindo de convite, avisa que conclui sozinho e esconde "Usar outro
  e-mail".
- Botão desativado mantém a aparência global (opacity 50%): controles desativados são isentos de
  contraste e agora a explicação é por texto. Não mexer no `Button` por causa disso.

**Deixado para depois:** WhatsApp do professor na tela de convite inválido (não dá: exige login);
"Já confirmei" verificar a confirmação de fato antes de mandar ao login.

### Pedidos (professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/Pedidos.tsx` (rota `/admin/solicitacoes`, aba "Pedidos"): crítica **20/40**, relatório em
`.impeccable/critique/*pedidos*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras
("Solicitações (professor)", 2 casos). **Nome único da tela: "Pedidos"** (menu, título e subtítulo; o
endereço fica `/admin/solicitacoes`) — não voltar a "Solicitações" nem "pedidos de aulas" na interface.

**REGRA DE NEGÓCIO (não desfazer): num pacote de RECORRÊNCIA, as aulas restantes já nascem todas
MARCADAS e continuam valendo depois que o pacote é encerrado** (a conclusão debita pelo `pacote_id`).
Aprovar um pedido encerra os pacotes ativos não-trial do aluno, mas isso só "tira" aulas dos pacotes que
NÃO são de recorrência (as que sobravam para agendar). Antes o aviso somava tudo com `used_classes`
(cópia defasada depois de um desfazer) e dizia "essas aulas deixam de valer" também na recorrência.
Agora `getPurchaseRequests` separa: `classesLostOnApprove` (só pacotes normais) e
`recorrenciaRestantes` (de `saldo_pacotes`, a autoridade — decisão 4), mostrada como linha informativa
cinza ("N aulas marcadas na recorrência. Elas continuam valendo."), nunca como alarme âmbar.

**Decisões do Lucas:**
- **Aprovar SEMPRE confirma**, sem desfazer: cria pacote/mexe em dinheiro e reverter exigiria migration e
  mexer em saldo (descartado). Janela curta ("Pacote de 8 aulas para Ana… Não dá para desfazer depois");
  com perda de aulas, a janela destrutiva de antes ("Aprovar mesmo assim").
- **Recusar NÃO confirma** — tem só o "Desfazer" de 8s (o lado reversível). Não recolocar a janela.
- Avisos citam o primeiro nome do aluno; o painel invalida a contagem de pedidos ao decidir.

**O que mudou / armadilhas:**
- Cartão: "Pedido há 4 dias · 3 aulas restantes" (todos os pacotes ativos, experimental incluída;
  recorrência via `saldo_pacotes`; "sem pacote ativo") e o recado do aluno (`notes`, que já vinha do
  banco e nunca aparecia).
- Trava por cartão (`approve.variables?.id`): só o cartão decidido trava ("Aprovando…"/"Recusando…");
  botões com `aria-label` com o nome do aluno.
- Selo de tipo ("Pacote"/"Aula avulsa") **neutro**: é rótulo, não estado (o vermelho falhava no
  contraste). "Aprovar" em `variant="soft"`.
- "Decididos recentemente" (últimos 5, `getPedidosDecididos`); estado vazio com "Ver agenda".
- **Aviso do aluno (`deriveNotifications`):** aprovado diz "Suas aulas já estão disponíveis para
  agendar" só no autosserviço; na recorrência, "Seu professor liberou o pacote. As aulas são marcadas
  por ele." (lê o modo via `getModoAgendamentoEfetivo`). Recusado leva à tela inicial (novo
  `NotificationEntity` `{ type: "home" }`, onde mora o "Falar com o professor").

**Deixado para depois:** desfazer uma aprovação (exigiria função no banco e cuidado com saldo);
WhatsApp direto no cartão do pedido; motivo da recusa.

### Login: rodada de crítica (2026-09-29) — sem migration nova

`src/pages/auth/Login.tsx`: crítica **24/40** (a revisão leu só o código; a varredura mediu). Relatório em
`.impeccable/critique/*login*`. Cinco passos na `dev`. Na página de amostras é o primeiro quadro de
"Entrada"; o e-mail com "naoconfirmado" simula o erro de e-mail não confirmado.

**ERRO REAL corrigido (consequência do "Confirm email" ativo — ver "Entrada"):** o Supabase devolve
"Email not confirmed" como HTTP **400**, igual a senha errada, e `signInWithPassword` mapeava todo
400/401/422 para "E-mail ou senha incorretos.". Era o caminho de **todo aluno novo que entra antes de
abrir o link do e-mail** — e o botão "Já confirmei, entrar" o mandava exatamente pra cá. Ele concluía que
errou a senha e a redefinia em círculos. Agora:
- `AuthError` tem `code`; `signInWithPassword` reconhece `email_not_confirmed` (por `error.code` ou pela
  mensagem) e lança "Seu e-mail ainda não foi confirmado. Abra o link que enviamos para você.".
- O Login mostra esse aviso com o botão **"Reenviar e-mail de confirmação"** (o mesmo
  `resendConfirmationEmail` de "Confirme seu e-mail") e o resultado do reenvio.
- **Não voltar a agrupar todo 400 como credencial errada** sem checar esse caso.

**Decisões do Lucas:**
- Legenda sob "BAHIA BOXE": **"Suas aulas de boxe"** (era "Gestão de aulas", que falava com o
  professor). Exemplo de e-mail neutro **"voce@email.com"** (também em Recuperar senha).
- A marca fixa "BAHIA BOXE" **não** foi mexida: marca por professor é um caminho ainda não
  implementado (PRODUCT.md). Não tentar resolver isso na tela de Login.

**O que mudou / detalhes:**
- Com convite guardado neste aparelho (`lerConvitePendente`), o Login mostra "Entre para concluir seu
  convite" + "Voltar ao convite"; sem convite, nada muda.
- Botão do olho com 44px, `aria-pressed`, foco visível e ícones `aria-hidden` (igual ao `ContaForm`);
  e-mail com `inputMode="email"`, `autoCapitalize="none"`, `spellCheck` off.
- Textos ≥ 12px, logo `aria-hidden`, foco nos links, e o erro (e o reenvio) some ao começar a corrigir.

**Deixado para depois:** "manter conectado"/aviso de sessão; comprimir o topo em telas muito baixas
(hoje cabe em 375×667); marca por professor no Login.

### Horários fixos (Recorrência do aluno): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/AlunoRecorrencia.tsx` (rota `/admin/alunos/:studentId/recorrencia`): crítica **19/40**,
relatório em `.impeccable/critique/*alunorecorrencia*`. Seis passos na `dev`, testados pelo Lucas. Na página
de amostras ("Recorrência do aluno (professor)", 3 situações: em uso, primeira vez, professor em Autosserviço).

**Decisões do Lucas (não reabrir sem ele):**
- **Nome único para o professor: "Horários fixos"** (título, seção, sheet, avisos, cartão em `AlunoDetalhe`).
  "Recorrência" continua sendo só o nome do **modo** em Configurações (e no aviso do Autosserviço).
- **"Gerar" mostra o efeito ANTES do toque:** resumo acima do botão (dias/horários, período) e linha âmbar
  com as aulas que serão canceladas; o botão vira "Gerar N e cancelar M". A janela de confirmação continua,
  agora listando as datas (`getAulasCancelaveisRecorrencia` devolve as datas; antes só a contagem).
  `previewRecorrenciaAulas` reaproveita `computeRecorrenciaSlots` — o preview é o MESMO cálculo da geração.

**O que mudou / armadilhas:**
- Em modo Autosserviço o cartão de gerar some (botão e campos) e entra um aviso com o link "Abrir
  Configurações"; sem horário ativo, o motivo fica acima do botão e ligado a ele (`aria-describedby`).
- Uma frase única sob "Horários fixos da semana" explica que desativar/excluir não muda as aulas já marcadas;
  saiu o aviso de 11px repetido por cartão. Depois de gerar, o aviso tem "Ver na agenda".
- Acessibilidade: Switch e lixeira com nome por linha ("Horário fixo de segunda às 18:00"), lixeira 44px,
  `aria-pressed` nos botões de data/dia/hora, texto selecionado com `--red-text` (era 3,25:1), esmaecimento
  da linha inativa só no texto. **O `Switch` (`ui/switch.tsx`) ganhou anel de foco por teclado no app inteiro.**
- Campo de aulas é texto numérico (1–52): dá para apagar e digitar; sheet só com 05h–22h (horários já
  cadastrados fora disso continuam aparecendo); aluno sem horário fixo vê "Adicionar o primeiro horário" e
  não o cartão de gerar.

**Deixado para depois (registrado, não pedido):** editar um horário fixo existente; visão semanal (D S T Q Q S S)
dos horários; avisar o aluno quando aulas são canceladas e substituídas ao gerar; mostrar no sheet se o horário
colide com outro aluno (hoje só falha ao gerar); confirmar o anel de foco com Tab real.

### Perfil de Boxe (resultado, aluno e professor): rodada de crítica (2026-09-29) — sem migration nova

`PerfilLutador.tsx` (aluno) e `AlunoPerfilBoxe.tsx` (professor), mais os componentes `BoxingProfile*`: crítica
**24/40**, relatório em `.impeccable/critique/*perfillutador*`. Seis passos na `dev`, testados pelo Lucas. Na
página de amostras ("Perfil de Boxe (aluno)" e "(professor)", 4 estados cada; as notas de amostra agora
variam por competência e entre aluno e professor). O questionário em si NÃO foi criticado.

**Decisões do Lucas (não reabrir sem ele):**
- **Com as duas avaliações, o RESULTADO COMBINADO abre a tela** (destaque com nome, tradução, descrição —
  descrição só na voz do aluno — e a linha "Vem da média das duas leituras, competência por competência");
  aviso de divergência logo abaixo; depois "As duas leituras", os próximos passos e, por último, radar e tabela.
- **Aluno com as duas avaliações volta a ter "o que faço com isso":** `BoxingProfileNextSteps` (pontos fortes,
  prioridades, foco) calculado sobre o COMBINADO, e "Conversar com o professor" (WhatsApp de `getWhatsappDoProfessor`)
  quando os estilos predominantes diferem ou as leituras divergem. O professor não vê nada disso (a voz é do aluno).
- **Aluno que abre a tela com só a avaliação do professor continua vendo a leitura dele** (decisão anterior mantida;
  a alternativa de exigir a autoavaliação antes foi oferecida e recusada).
- **Estilo em inglês com tradução embaixo em TODAS as telas de resultado** (`FighterProfileGloss`, mesma tradução
  da Home) e **"afinidade"** no lugar de "compatibilidade".

**O que mudou / armadilhas:**
- Selo "Resultado parcial": sempre logo abaixo do destaque (prop `notice` de `BoxingProfileScoresSummary`/`ResultView`);
  **âmbar só quando falta a avaliação do PROFESSOR**, cinza quando falta o aluno (`waiting="coach" | "student"`).
  As quatro frases do aviso, aprovadas antes, NÃO foram reescritas.
- O estado vazio dizia "32 perguntas" (resquício da v1): agora usa `getQuestions("self", ...)`, hoje 14 ou 37.
- "Ver todos os perfis" e "Ver a nota de cada competência" recolhidos (botões com `aria-expanded`); o radar segue
  `aria-hidden` e o botão das notas é o caminho de leitor de tela até os números.
- Radar: nome das competências em 12; o traço do professor é claro (`--foreground`), não mais cinza fraco.
  Tabela com `role="table"` e colunas `w-14` (o cabeçalho vazava 4px). Coluna "Prof." com o mesmo peso da do aluno.
- Todo texto das telas de Perfil de Boxe ficou >= 12px.

**Deixado para depois (registrado, não pedido):** amostra com combinado que diverge de verdade (as de hoje têm quatro
perfis empatados); ilustração ou identidade de boxe no destaque do estilo (a crítica achou a tela genérica);
mostrar a leitura do professor só depois da autoavaliação (recusado, ver acima); professor sem atalho para a evolução
do aluno.

### Configurações (professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/Configuracoes.tsx` (rota `/admin/configuracoes`; acessível por "Minha conta" e pelo aviso do
modo Autosserviço em Horários fixos): crítica **18/40** (a revisão de design leu só o código, o navegador negou
o acesso; as medições vieram da varredura). Relatório em `.impeccable/critique/*configuracoes*`. Cinco passos na
`dev`, testados pelo Lucas. Na página de amostras ("Configurações (professor)": Autosserviço com WhatsApp,
Recorrência sem WhatsApp, "Não carregou").

**Decisões do Lucas (não reabrir sem ele):**
- **Trocar o modo de agendamento pede CONFIRMAÇÃO** (janela com Cancelar/Trocar) e diz o que o ALUNO passa a ver
  ("deixam de ver 'Agendar' e passam a ver 'Ver minhas aulas'…"); só grava depois do "Trocar". Tocar no modo que
  já está ativo não faz nada. A alternativa "trocar na hora, com Desfazer" foi oferecida e recusada.
- **Tela em seções por assunto, nesta ordem:** "Como os alunos agendam" (modo), "Regras do pacote" (falta),
  "Contato" (WhatsApp), "O que o aluno vê" (Orientações da aula). As três primeiras só aparecem com os dados
  carregados; "O que o aluno vê" sempre.

**O que mudou / armadilhas:**
- **Falha de gravação agora avisa** (o switch da falta e o modo não tinham `onError`; só o WhatsApp avisava):
  `toast.error`, switch travado enquanto grava. Se a busca das configurações falha, aparece `ErrorState` com
  "Tentar novamente" — antes o switch mostrava "ligado" (`?? true`) como se fosse o valor real.
- **Vocabulário:** "Falta desconta uma aula" (não "consome crédito"). A explicação diz que pacotes de
  **Recorrência já gerados mantêm a regra de quando foram criados** — é a única situação em que a regra é
  "congelada" (decisão 3/5); nos demais pacotes ela vale na hora da falta. Não escrever "vale só para pacotes
  novos" de forma geral. O aviso "trocar não migra dados" virou "as aulas e os pacotes que já existem não mudam".
- Acessibilidade: switch ligado ao título e à descrição (`aria-labelledby`/`describedby`); os dois botões de modo
  formam um `role="group"` nomeado, com 44px e foco visível; **o modo selecionado é neutro invertido com ✓, não
  vermelho** (vermelho fica para a ação principal de cada tela); erro do WhatsApp com `role="alert"`; título e
  descrição do WhatsApp com os mesmos tamanhos dos outros cartões; nenhum texto < 12px.
- Na galeria, `SeededAdmin` só preenche `admin-settings` se a consulta ainda não existe (`getQueryState`), para as
  amostras poderem definir o próprio modo ou simular erro. O `Toaster` do Sonner não existe na galeria, então
  avisos (`toast`) não aparecem lá.

**Deixado para depois (registrado, não pedido):** resumo do estado atual dos ajustes de relance; nome/e-mail do
professor ficam em "Minha conta" (decisão de deixar lá); campo do WhatsApp pode ser sobrescrito se outra gravação
atualizar a tela enquanto o professor digita; nome da tela igual ao item de menu.

### Disponibilidade (professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/Disponibilidade.tsx` (rota `/admin/disponibilidade`; acessível por "Minha conta" e pela Agenda):
crítica **19/40**, relatório em `.impeccable/critique/*disponibilidade*`. Seis passos na `dev`, testados pelo Lucas.
Na página de amostras ("Disponibilidade (professor)": semana em uso, nada publicado, professor em Recorrência).
O horizonte real é **12 semanas** (`HORIZON_WEEKS`), não 8.

**Decisões do Lucas (não reabrir sem ele):**
- **Dias sem horário viram uma LINHA compacta** (nome, "Sem horários", botão +), sem interruptor (não há o que
  ligar; antes ligar um dia vazio dava erro) e sem o quadro tracejado repetido. Dias com horários seguem como cartões.
- **Resumo em uma frase** ("Seg, ter e sex abertos para agendamento. Aulas já marcadas não são afetadas por
  mudanças aqui."), no lugar do cartão dourado com "N intervalos".
- **Em modo Recorrência, uma FAIXA âmbar explica** que a grade só vale no Autosserviço, com "Abrir Configurações";
  **não bloqueia nada** (regra "bloquear a criação, nunca o acesso"; a decisão de não ter gate nesta tela continua).

**O que mudou / armadilhas:**
- **Falha de gravação agora avisa** (P0 da crítica): `saveSlot` não tinha `onError` (o sheet ficava aberto sem aviso),
  `deleteSlot` também não, e o "Desfazer" (`restoreAvailabilityInterval`) não tratava erro. Agora: mensagem
  `role="alert"` dentro do sheet, `toast.error` ao remover, e "Desfazer" com sucesso/erro.
- **Sheet de horário:** rola até o horário escolhido ao abrir (antes o valor atual abria fora da tela), faixa 05h–22h
  início / 06h–23h fim (madrugada só aparece se o horário JÁ existe), fins inválidos apagados, fim acompanha o
  início (+1h), resumo vivo ("Segunda, 06:00 às 09:00 (3 horas)"), `aria-pressed`, foco visível, "Todo domingo/sábado".
- **A lista vai de segunda a domingo** (`ordenados`), como a Agenda; o banco devolve começando no domingo.
- Acessibilidade: nome do dia é `<h2>`; interruptor "Receber agendamentos na segunda"; lápis/lixeira com dia e
  horário; contornos com `muted-foreground/70` e `destructive/70` (eram 1,2–1,6:1); esmaecimento do dia pausado só no
  horário (o texto "Pausado…" tinha 3,02:1).
- Texto: plural de verdade (`plural()`), "horário" em vez de "intervalo", "Repete toda semana · próximas 12 semanas".

**Deixado para depois (registrado, não pedido):** o trilho do `Switch` desligado tem 1,28:1 (componente global; muda o
app inteiro, então foi deixado); "copiar para outros dias" / escolher vários dias no mesmo sheet; quantas vagas
restam por horário; traduzir mensagens cruas de erro do servidor no sheet; confirmar o anel de foco com Tab real.

### Modelos de pacote (Pacotes do professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/Pacotes.tsx` (rota `/admin/pacotes`; chega-se por "Minha conta > Modelos de pacote" e pelo passo
"Criar um pacote de aulas" do painel; **não está na barra inferior**): crítica **19/40**, relatório em
`.impeccable/critique/*pacotes*`. Cinco passos na `dev`, testados pelo Lucas. Na página de amostras ("Pacotes
(professor)": com modelos e pedidos pendentes, e sem nenhum). A tela do ALUNO (`student/Pacotes.tsx`) não foi criticada.

**FATO (não desfazer sem decisão): `package_templates.validity_days` NÃO é aplicado por nada.** Não é copiado para
`packages` e o banco não tem data de expiração (`supabase/README.md:45-46`). O campo "Validade (dias)" prometia um
vencimento que não existe (e a edição gravava 60 em modelo sem prazo).

**Decisões do Lucas (não reabrir sem ele):**
- **O prazo fica, como INFORMATIVO:** rótulo **"Prazo sugerido (dias)"**, opcional (vazio = `null`), com a frase "o
  pacote não vence sozinho"; o aluno vê "Sugestão: use em até N dias" em `student/Pacotes.tsx`. Nada expira. A
  alternativa "tirar o campo" foi oferecida e recusada. Se um dia a validade valer de verdade, precisa de regra no
  banco (coluna em `packages` + função), e o texto muda.
- **Remover mantém a lixeira e a confirmação, e ganha "Desfazer" de 8s + aviso de erro.** É exclusão lógica
  (`is_active = false`); `restorePackageTemplate` reativa. A alternativa "Ocultar com lista de ocultos" foi recusada.

**O que mudou / armadilhas:**
- **Nº de aulas** é texto numérico de 1 a 99 (vazio, 0, negativo e decimal não passam; erro no blur com
  `role="alert"`); o botão "Criar/Salvar" explica por que está apagado (`motivoBloqueio`); ao editar, avisa que "vale
  para os próximos pedidos, os já aprovados não mudam".
- **Cartão:** mostra "N aulas" (do dado, não do nome), descrição só se houver, nome com `line-clamp-2` (`min-w-0`) e
  "N pedidos esperando" em âmbar (âmbar = depende do professor) que leva a Pedidos — usa a mesma consulta e o mesmo
  cache de `Pedidos.tsx` (`["purchase-requests", id]`), sem consulta nova.
- **Cabeçalho padrão** (`PageHeader`, "MODELOS DE PACOTE" com voltar); "Novo modelo" fica ABAIXO do cabeçalho: ao lado
  do título ele quebrava em 3 linhas no celular. No estado vazio quem convida é o `EmptyState`.
- Acessibilidade: nomes por modelo ("Editar Pacote 8 aulas"), nome do modelo é `<h2>`, foco visível, contornos
  legíveis, ícone da lixeira em `--red-text`, quadrado de "Preço a combinar" 20px.

**Deixado para depois (registrado, não pedido):** ocultar/reativar modelos sem apagar; duplicar modelo; ordenar; a tela
do aluno (`student/Pacotes.tsx`); em modo Recorrência esta tela continua igual (o aluno nem chega a pedir pacote).

### Minha conta (aluno): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/student/MinhaConta.tsx` (rota `/app/minha-conta`): crítica **21/40**, relatório em
`.impeccable/critique/*minhaconta*`. Cinco passos na `dev`, testados pelo Lucas. Na página de amostras ("Minha conta
(aluno)": autosserviço e Recorrência). A Minha conta do PROFESSOR (`admin/MinhaConta.tsx`) tem a mesma estrutura por
cópia e NÃO foi mexida (só herdou o diálogo de nome e o `Avatar`).

**Decisões do Lucas (não reabrir sem ele):**
- **Nomes das linhas** (cada uma diz o que abre): "Meu nome" (edita o nome), "Meu Perfil de Boxe" (o RESULTADO do estilo,
  `/app/perfil-lutador`), "Meus dados físicos" (formulário de altura/peso/envergadura/guarda; a tela passou a se chamar
  "MEUS DADOS FÍSICOS"), "Meu pacote" (`/app/pacotes`, **some em Recorrência**, onde o aluno não pede pacote) e
  "Alterar senha". Todas com ícone (o desalinhamento vinha do ícone opcional).
- **O que o aluno encontra:** e-mail da conta (só leitura), **"Falar com o professor"** (WhatsApp de
  `getWhatsappDoProfessor`, mesma mensagem da Home; a linha só existe com número cadastrado) e a frase
  **"Na academia desde set/2026"** — SEM gênero (era "Aluna" fixo para todos) e com o ano. Não usar o campo `sex` do
  perfil físico para adivinhar gênero: é medida esportiva, não identidade.
- **"Sair da conta" é discreto** (ghost, sem preenchimento, texto `--red-text`, ícone, 44px), no fim da tela; a
  confirmação continua. O vermelho cheio fica para a ação principal de cada tela.

**O que mudou / armadilhas:**
- **`EditProfileDialog` é COMPARTILHADO com o professor:** virou `<form>` (Enter salva), `maxLength` 80, `onError` com
  aviso (antes a falha era muda), botão que explica por que está apagado ("Escreva seu nome…" / "Você ainda não mudou o
  nome."), título "EDITAR NOME". O professor herdou tudo isso; a linha dele ainda se chama "Editar perfil".
- **iPhone/Safari não dispara `beforeinstallprompt`:** o banner nunca aparecia. `PWAInstallBanner` (placement `settings`)
  agora mostra a orientação "Compartilhar > Adicionar à Tela de Início" quando é iPhone/iPad e o app não está instalado
  (`navigator.standalone`). Só simulado na galeria (UA trocado + eventos); não testado em aparelho.
- `Avatar` (`ui/avatar.tsx`) ganhou `aria-hidden` no app inteiro (as iniciais repetem o nome ao lado); iniciais com
  `filter(Boolean)`. Sem `profile`, a tela mostra título + esqueleto em vez de `null`. Título com `PageHeader`.
- Linhas com foco visível; divisórias com `border-border` (era `#232323`).

**Deixado para depois (registrado, não pedido):** aplicar o "Sair da conta" discreto e as linhas com ícone na Minha conta
do professor; extrair `AccountRow` (copiado nos dois arquivos); notificações / excluir conta / trocar e-mail;
esqueci a senha a partir daqui (só existe no Login).

### Aulas (antigo "Histórico" do professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/Historico.tsx` (rota `/admin/historico`, item **"Aulas"** da barra inferior) e `BookingFilters`: crítica
**20/40**, relatório em `.impeccable/critique/*historico*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras
("Histórico (professor)": a busca e os filtros funcionam sobre 18 aulas de amostra; e "Sem aulas").

**ERRO REAL corrigido (P0): a busca e o filtro só enxergavam as 200 aulas mais recentes.** `getAdminBookingHistory` fazia
`limit(200)` e filtrava status e nome NO APARELHO; aulas futuras já ocupavam vaga da janela. Um aluno antigo (ou "Faltas")
sumia sem aviso — o professor concluía "ele nunca teve aula". Agora `getAdminBookingHistoryPage` faz busca e status NA
CONSULTA, em páginas de 30 (`HISTORICO_PAGINA`, pede 31 para saber se há mais), com "Ver mais aulas" e "Mostrando as N mais
recentes / N aulas no total". A busca é sem acento/maiúscula (`semAcento`) e só sai ~0,3 s depois da última tecla.
**Não voltar a filtrar no cliente sobre um `limit`.**

**Decisões do Lucas (não reabrir sem ele):**
- **A tela se chama "AULAS"** (igual ao menu) e tem duas partes, **Anteriores** (abre primeiro; da mais recente para a mais
  antiga) e **Próximas** (da mais próxima); `end_time` decide a parte. Cabeçalho `<h2>` por dia ("Hoje", "Amanhã", "Ontem",
  "Quinta-feira, 01 out", com ano se não for o atual). Os filtros mudam por parte e voltam a "Todas" ao trocar:
  Anteriores = Todas, Sem registro, Concluídas, Faltas, Canceladas, Remarcadas; Próximas = Todas, Agendadas, Pendentes.
- **Busca com espera de ~0,3 s** (não botão Buscar), com botão de limpar.

**O que mudou / armadilhas:**
- **"Sem registro"** (âmbar, `StatusBadge semRegistro`) no lugar de "Agendada" em aula passada não registrada; "Agora" na que
  está em andamento. `sem_registro` e `scheduled` são o mesmo `status = 'scheduled'`; o que os separa é a PARTE (`end_time`).
- **Esta continua sendo a tela de auditoria:** não aplica `SEM_DESCARTE_DE_REGENERACAO` (as aulas descartadas na regeneração
  aparecem, com "Substituída ao gerar novas aulas").
- **Cartão com contexto:** "Cancelada por você / pelo aluno / Substituída…" (`canceladoPor`), "Remarcada para …" (sucessor) e
  "Veio de …" + etiqueta Remarcada/Reposição (antecessor via `antecessores()`): UMA consulta de antecessores e UMA de
  sucessores por página, nunca uma por cartão. Nome longo com `line-clamp-2`.
- **`BookingFilters` é compartilhado com `Alunos.tsx`:** busca `type="search"` com nome acessível e botão de limpar (44px),
  chips de 44px com `aria-pressed`, foco, contornos ≥ 3:1 e o chip escolhido rola para a vista.
- Estados vazios que dizem a verdade: "Nenhuma aula anterior ainda", "Nenhuma aula marcada" (+ "Ver agenda") e "Nenhuma aula
  encontrada" (+ "Limpar busca e filtro") — antes todos diziam "Ajuste a busca ou o status".
- Na galeria a consulta de cada busca/filtro é preenchida no `QueryCache` (`subscribe` no evento `added`), porque a tela passa
  o próprio `queryFn` (que vence o `setQueryDefaults`); a galeria NÃO pagina, então o botão "Ver mais aulas" só aparece no app real.

**Deixado para depois (registrado, não pedido):** filtro por período/mês e "faltas do aluno X em setembro" (contagens por
filtro); cabeçalho por mês além do dia; atalho para o perfil do aluno; o filtro "Recusadas".

### Detalhe do aluno (professor): rodada de crítica (2026-09-29) — migration 0036

`src/pages/admin/AlunoDetalhe.tsx` (rota `/admin/alunos/:studentId`): crítica **20/40**. Seis passos na `dev`, testados
pelo Lucas. Na página de amostras ("Detalhe do aluno (professor)": pacote comprado, em recorrência, aluno novo).

**Migration 0036 (`0036_email_do_aluno.sql`) — APLICADA e VERIFICADA (4/4 OK, `supabase/verify_0036_email_do_aluno.sql`):**
`email_do_aluno(p_student_id)`, `security definer`, só o professor dono do aluno (`only_admin`/`not_allowed`). O e-mail só
existe em `auth.users`, que o cliente não lê. `revoke ... from public, anon; grant execute ... to authenticated`.

**Decisões do Lucas (não reabrir sem ele):**
- **Contato = e-mail do aluno** (link `mailto:` sob o nome). Se a consulta falha, a linha some (é um extra, não derruba a tela).
  O app **não tem telefone do aluno**; WhatsApp do aluno só existiria com campo novo.
- **Atribuir pacote tem confirmação:** tocar num modelo só ESCOLHE (`role="radio"`); quem atribui é o botão "Atribuir <modelo>".
  Com pacote ativo não-experimental, faixa âmbar: "Atribuir um novo encerra o atual. As aulas já marcadas continuam valendo."
- **Ações do pacote moram DENTRO do `ActivePackageCard`** (prop `actions`): "Atribuir novo pacote" (secundário) e "Encerrar pacote"
  (ghost, `--red-text`); sem pacote, "Atribuir primeiro pacote" (o principal). O botão vermelho no topo saiu.
- **"Encerrar pacote" some para o pacote experimental** (`remove_active_package` só encerra não-trial). A janela diz o que acontece
  de verdade: aulas SEM data são perdidas, as JÁ MARCADAS continuam valendo (`descricaoEncerrar`).
- **Próxima aula no topo** ("Próxima aula: Amanhã, 07:00" ou "Sem aula marcada") e a lista virou **Próximas aulas / Aulas anteriores**
  (3 de cada, `getAdminStudentDetail` devolve `proximas`/`anteriores` no lugar de `history`), cada linha abre `/admin/aula/:id`, mais
  "Ver todas as aulas de <nome>" → `/admin/historico?busca=<nome>` (a tela Aulas lê `?busca=`).
- **Estatísticas sem alarme:** Frequência "—"/"Sem aulas ainda" para aluno novo, com base ("75% · 6 de 8 aulas"); Faltas em `--red-text`
  só quando > 0 ("Nenhuma falta" / "N faltas registradas").

**Armadilhas:** `ActivePackageCard` é compartilhado com a Home do aluno e Horários fixos; a prop `actions` só é usada aqui.
`ConfirmDialog` continua global (não mexido).

**Deixado para depois (registrado, não pedido):** telefone/WhatsApp do aluno; histórico de pacotes do aluno; "renovar com o mesmo
modelo" em um toque; estado dentro do cartão do Perfil de Boxe ("Ainda não avaliado"); contraste do botão "Encerrar" do `ConfirmDialog`
(global).

### Alunos (lista do professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/Alunos.tsx` (rota `/admin/alunos`, item "Alunos" da barra inferior): crítica **23/40**, relatório em
`.impeccable/critique/*admin-alunos*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras ("Lista de alunos").

**Decisões do Lucas (não reabrir sem ele):**
- **Triagem por chips com contagem:** "Todos N", "Em risco N", "Sem pacote N", sobre TODOS os alunos (a contagem não muda ao
  digitar na busca). Filtro na URL (`?filtro=risco` | `?filtro=sem-pacote`; "Ver todos" do painel continua caindo em "risco").
  Não há seletor de ordem: a lista é sempre por nome (`localeCompare("pt-BR")`); "Em risco" segue a ordem de urgência do painel.
- **Aluno sem pacote = selo âmbar "Sem pacote"** no lugar do número (âmbar = depende do professor), igual em Todos/Em risco/Sem pacote.
- **Cartão sem avatar de iniciais**, nome até 2 linhas (`line-clamp-2`), subtítulo só com o nome do pacote (o "5/8 usadas" saiu:
  o número de restantes já está à direita e o detalhe do aluno mostra o resto). Altura mínima 70px.

**O que mudou / armadilhas:**
- **A busca filtra EM MEMÓRIA:** a consulta é uma só (`["admin-students", id]`, sem o texto na chave) e `semAcento` (agora exportada de
  `api.ts`) filtra na tela. Com o texto na chave, cada letra trocava a chave, virava esqueleto e refazia 3 consultas. **Não voltar a
  pôr a busca na `queryKey`.** A consulta de "Em risco" agora roda sempre (o chip mostra a contagem).
- Título com `PageHeader`. Lista é `<ul aria-label="Alunos">`; cada botão tem `aria-label` falado ("Nome. Pacote 8 aulas. 3 aulas
  restantes"; em "Em risco" só o motivo, sem repetir); `<p role="status" class="sr-only">` anuncia "N alunos [em risco|sem pacote]".
  `BookingFilters` (compartilhado com Aulas) ganhou `filtersLabel` (padrão "Filtrar por status"; aqui "Filtrar alunos").

**FATO (não é bug desta tela): o app NÃO tem como o professor criar um convite.** O código só faz `validate_invite`/`accept_invite`
(`api.ts`); a criação do link é feita fora do app (provavelmente direto no Supabase). Por isso o "Convidar aluno" sugerido pela crítica
ficou de fora: não há para onde o botão levar. Criar convite dentro do app é uma rodada própria (função nova no banco, guardar o
link, mostrar/copiar/compartilhar). A frase do vazio ("Convide um novo aluno para começar.") continua só texto.

**Deixado para depois (registrado, não pedido):** criar convite no app (ver acima); próxima aula / "há N dias sem vir" no cartão;
estilo do lutador (Perfil de Boxe) no cartão; ordenar por aulas restantes; abrir o cartão em nova aba (é botão, não link).

### Minhas aulas (aluno): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/student/Historico.tsx` (rota `/app/historico`, aba "Aulas" do aluno): crítica **21/40**, relatório em
`.impeccable/critique/*student-historico*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras ("Minhas aulas
(aluno)": autosserviço, Recorrência, sem aulas e Recorrência sem aulas — a galeria não tinha nenhuma amostra desta tela antes).

**Decisões do Lucas (não reabrir sem ele):**
- **Duas abas, Próximas e Anteriores; a aba "Todas" saiu** (era a soma das duas e mudava a ordem das mesmas aulas entre as abas).
  `getStudentBookingHistory` aceita só `"proximas" | "anteriores"`.
- **Data no título do cartão** com `formatQuando` ("Amanhã, 19:00" / "Sexta-feira, 02 out · 19:00"); o bloco "30 / set" saiu (mês em
  10,5px). A hora final fica só no detalhe da aula.
- **Próximas = o que ainda vai acontecer OU acontece agora** (`end_time > agora`) **e está de pé** (`scheduled`,
  `pending_confirmation`, `rejected_with_suggestion`); **Anteriores = todo o resto** — nenhuma aula some das duas abas (antes uma
  cancelada com data futura não aparecia em lugar nenhum). Remarcada e recusada saem de Próximas.
- **A primeira de Próximas ganha cartão em destaque** ("Próxima aula", ou "Acontecendo agora" se já começou): tom dourado, título 17px,
  rótulo acima (`destaque` no `BookingCard`).

**O que mudou / armadilhas:**
- **`StatusBadge` ganhou a voz do aluno:** aula `scheduled` cujo horário passou sem registro mostra **"Aguardando registro"** (âmbar) para o
  aluno e continua "Sem registro" para o professor; "Agora" para aula em andamento. Vale também no detalhe da aula do aluno.
- **Subtítulo verdadeiro** ("N aulas marcadas" em Próximas, "As mais recentes primeiro" em Anteriores; some sem aulas) — o antigo
  "Histórico completo do seu pacote" era falso. **Vazio por aba e por modo:** Próximas/autosserviço → "Agendar aula"; Próximas/Recorrência →
  "Seu professor marca as suas aulas" com "Falar com o professor" (WhatsApp, só se houver número; **nunca "Agendar aula" em Recorrência**,
  a rota redireciona); Anteriores → sem botão.
- Acessibilidade: abas com foco visível e `aria-label="Filtrar aulas"`, lista dentro de `TabsContent` (o painel que as abas apontam),
  `<ul>`/`<li>`, `aria-label` falado por cartão (data por extenso + horário + estado) e `role="status"` ao trocar de aba. `TabsContent`
  (`ui/tabs.tsx`) agora tem foco visível; `BookingCard` só é usado nesta tela.

**Deixado para depois (registrado, não pedido):** a borda do `card-dark` (1,48:1, estilo global do app); distinguir "Cancelada" de
"Remarcada" pela cor e dizer quem cancelou (pesa no crédito); agrupar por mês; resumo "seg e qua, 19h" para o aluno de recorrência;
explicar "Aguardando o professor"/"Remarcada" ao aluno.

### Pacotes (aluno): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/student/Pacotes.tsx` (rota `/app/pacotes`, "Meu pacote" em Minha conta; **só no autosserviço**, em Recorrência redireciona): crítica
**16/40** (a mais baixa das rodadas — envolve dinheiro), relatório em `.impeccable/critique/*student-pacotes*`. Seis passos na `dev`,
testados pelo Lucas. Na página de amostras ("Pacotes (aluno)": com pacote ativo, sem pacote, pedido em análise, sem modelos e erro).

**Decisões do Lucas (não reabrir sem ele):**
- **Com pedido pendente, TODOS os "Pedir" ficam desativados, com o motivo escrito** ("Você já tem um pedido com o professor. Espere a resposta
  para pedir outro.") e um cartão âmbar no topo ("Pedido de pacote enviado · <modelo>", "Enviado em …. Aguardando o professor responder.").
  A tela já recebia o pedido (`home.pendingRequest`, o mesmo da Home) e o ignorava: o aluno podia pedir de novo, e **cada pedido aprovado
  encerra o pacote atual**. Também ficam desativados enquanto a Home não chegou (sem ela não dá para saber se há pedido).
- **Pedir tem janela de confirmação:** tocar em "Pedir" só ESCOLHE o modelo; quem envia é "Enviar pedido". A janela diz o modelo e o preço,
  que **o professor combina o pagamento e libera as aulas**, e — se o aluno tem pacote não experimental com aulas SEM data — que **liberar o
  novo pacote encerra o atual e essas aulas deixam de valer (as já marcadas continuam)**; a aula experimental não é afetada (0031).
  Aviso de sucesso: "Pedido enviado: <modelo>. O professor vai responder."
- **Cartão de pacote = `ActivePackageCard` (`audience="student"`, `hideAlert`)**, o mesmo da Home; usa `home.package ?? home.lastPackage`
  (pacote esgotado mostra "0 aulas restantes · Pacote de N aulas concluído", sem o selo "Ativo" que dizia "8 de 8 usadas"). **Não voltar a
  desenhar um cartão próprio aqui** (era a terceira cópia; ver "Unificação do card de pacote").

**O que mudou / armadilhas:**
- **Erro e vazio:** falha nas consultas → `ErrorState` "Tentar novamente" (modelos e Home; sem a Home os botões ficariam desativados para
  sempre); sem modelos → "Seu professor ainda não cadastrou pacotes" com "Falar com o professor" (WhatsApp, só se houver número).
- Botões com `aria-label="Pedir <modelo>"`; "Preço a combinar" em cinza (é ausência de preço, não um preço dourado); nome com `line-clamp-2` e
  descrição com `line-clamp-3` (**a descrição longa aparece cortada e a janela de confirmação não a mostra**); lista é `<ul aria-label="Modelos
  de pacote">`; o conteúdo só aparece depois de saber o modo (`aguardandoModo`, esqueleto) para não piscar antes do redirecionamento em
  Recorrência; espaço reservado (`SkeletonCard`) enquanto o pacote carrega.
- O aviso de "desde <data>" do cartão antigo saiu (o cartão padrão não o mostra).

**Deixado para depois (registrado, não pedido):** cancelar o próprio pedido pendente (hoje o aluno só espera); campo de recado ao professor no pedido
(a RPC já tem `notes`; hoje vai "Pedido a partir de …" na aula avulsa); mostrar a descrição completa na janela de confirmação; "R$/aula" para
comparar modelos; "Pedir de novo o mesmo pacote"; "Sugestão: use em até N dias" pode ser confundido com validade (segue só informativo).

### Meus dados físicos (aluno): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/student/Perfil.tsx` (rota `/app/minha-conta/perfil`, linha "Meus dados físicos" em Minha conta): crítica **20/40**, relatório em
`.impeccable/critique/*student-perfil*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras ("Meus dados físicos (aluno)": em
branco, preenchido e erro — a galeria não tinha amostra desta tela).

**ERRO REAL corrigido (P0, perda de dados): falha ao carregar abria o formulário VAZIO e o "Salvar" gravava tudo em branco por cima dos dados
verdadeiros.** A tela só tratava `isLoading`. Agora, se a consulta falha (`erroId`/`erroDados`), aparece `ErrorState` "Seus dados não foram
alterados… Tentar novamente" **sem formulário**; enquanto não há `data` mostra o esqueleto; e o Salvar exige `data`. **Não voltar a mostrar
formulário sem os dados carregados.**

**Decisões do Lucas (não reabrir sem ele):**
- **Validação por campo** (no blur, `role="alert"`, `aria-invalid`): altura 100–250 cm, peso 30–300 kg, envergadura 100–260 cm; vazio vale (a tela é
  opcional). Peso: até 3 dígitos, **um** separador e **uma** casa (o banco é `numeric(5,1)`; antes "60,5,5" virava `NaN`); exemplo "59,5".
  Um "168" digitado em Altura mudaria o estilo do Perfil de Boxe (envergadura ÷ altura, `physicalAnchor.ts`).
- **Salvar só quando mudou e válido**, com o motivo escrito embaixo ("Nenhuma alteração para salvar." / "Corrija os campos em vermelho…").
  A comparação com o salvo é **por valor** ("59,5" digitado = 59.5 salvo). **Aviso ao sair com alterações:** a seta de voltar
  (`PageHeader` ganhou `onBack`) e o link do Perfil de Boxe abrem "SAIR SEM SALVAR?"; `beforeunload` cobre fechar/recarregar a aba.
  **Limite conhecido: as abas de baixo do app não são interceptadas** (o app usa `BrowserRouter`, sem `useBlocker`).
- **O banner "Novo desafio" saiu do topo** (154px, cordas/poste/anel girando, textos de 9px, empurrava o Sexo para 439px): virou uma linha discreta
  **no fim**, depois do Salvar ("Descobrir meu estilo de lutador"), com o aviso acima se houver alterações.
- **Por que pedimos, só com fatos verdadeiros:** subtítulo "Opcional — deixe em branco o que preferir" e uma caixa: "Seu professor vê só médias e
  contagens do conjunto dos alunos, não os seus números. Altura e envergadura também entram no cálculo do seu Perfil de Boxe." **Conferido no
  código:** a única tela do professor que usa esses dados é `PerfilAlunos` (`getStudentProfileStats`: média/mín/máx e contagens); nenhuma mostra o
  número de um aluno; só altura e envergadura entram no Perfil de Boxe. **NÃO conferido no banco:** se a RLS de `student_profiles` deixaria o
  professor ler o dado individual por outro caminho — o texto descreve o que o APP mostra (uma primeira versão dizia "No app, seu professor vê…", encurtada para caber). Se essa promessa precisar valer também no banco, pedir a consulta das policies.
- **Guardas** (`GUARD_INFO` tem **7**, não 6): cartão inteiro selecionável (`role="radio"`, grupo `aria-labelledby`), resumo em 12px, "O que é essa
  guarda?" com **44px** e nome próprio por guarda (`aria-label`), dica "Não sabe? Pode deixar em branco… pé esquerdo à frente costuma ser ortodoxa;
  direito, southpaw… Toque de novo para desmarcar". **Sem cartão "Ainda não sei"** (gravaria o mesmo `null` de "não preencheu"; foi oferecido).

**O que mudou / armadilhas:** Sexo, Guarda e Lateralidade são `radiogroup` com `aria-checked`; pills com foco visível; "Informações pessoais"/"Boxe" são
`<h2>`; contornos de campos/pills/cartões com `border-muted-foreground/60–70` (o do tema dava 1,48:1); marcada usa `--red-text`; esqueleto com 5 blocos
do tamanho do formulário. `PageHeader` agora aceita `onBack` (substitui o `navigate(-1)` quando a tela precisa confirmar).

**Deixado para depois (registrado, não pedido):** aviso ao sair pelas abas de baixo (exige trocar para roteador de dados); "salvar campo a campo";
aviso "preencha altura e envergadura juntas" (sem uma das duas o índice é `null`); motivo por campo (sexo/peso são só estatística do conjunto);
"Prefiro não dizer" em Sexo; barra "Salvar" fixa numa tela de ~1800px; a borda global do `card-dark`/inputs (1,48:1) segue no tema.

### Minha conta (professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/MinhaConta.tsx` (rota `/admin/minha-conta`, aba "Conta" da barra do professor): crítica **19/40**, relatório em
`.impeccable/critique/*admin-minhaconta*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras ("Minha conta (professor)" — a
galeria só tinha a do aluno). É o que a rodada da Minha conta do aluno deixou como "aplicar o mesmo estilo à do professor" e "extrair `AccountRow`".

**Decisões do Lucas (não reabrir sem ele):**
- **Duas listas com título, em vez de uma lista de 6:** **"O que você oferece"** (Minha disponibilidade, Modelos de pacote, Perfil dos alunos) e
  **"Minha conta"** (Configurações, Meu nome, Alterar senha). Antes "onde mudo meus horários?" dependia de adivinhar que era em "Conta" (a barra de
  baixo tem Painel, Agenda, Alunos, Aulas, Pedidos e Conta — **sem** Horários nem Pacotes). **A barra NÃO mudou**; a alternativa de renomear a aba
  "Conta" para "Ajustes" foi oferecida e recusada. Frases nas linhas ambíguas: Configurações → "Modo de agendamento, WhatsApp e regra de faltas"
  (o WhatsApp ficava escondido atrás de um nome genérico); Perfil dos alunos → "Médias de altura, peso e guarda dos alunos".
- **Cartão do topo mostra o e-mail da conta** ("com qual conta eu entrei?", como no aluno). **"Professor · desde 13 mar" saiu:** sem ano e era a
  data de criação da CONTA, não de quando começou a dar aula (`profile.createdAt`). Alternativas "e-mail + Professor" e "manter" foram oferecidas.
- **"Sair da conta" discreto** (ghost, `--red-text`, ícone, 44px), igual ao do aluno: a tela não tem ação principal e o vermelho cheio de 56px
  colado ao banner de instalar era o elemento mais forte para uma ação rara. **"Editar perfil" → "Meu nome"** (ícone `UserRound`; só edita o nome).

**O que mudou / armadilhas:**
- **`src/components/AccountRow.tsx` é a linha ÚNICA de aluno e professor** (antes cada tela tinha a sua cópia e a do professor ficou para trás). Ícone
  obrigatório (uma linha sem ícone desalinha o texto das outras), `min-h-[52px]`, anel de foco, divisor `border-border` (o do professor era
  `#232323`, 1,11:1), `aria-hidden` nos ícones; **cada linha é um `<li>`**, então o container TEM que ser um `<ul>` — aluno (`aria-label="Minha conta"`) e
  professor (`aria-labelledby` dos `<h2>` dos blocos). **Não voltar a copiar a linha para dentro de uma tela.**
- **Antes `return null` deixava a tela em branco sem título** enquanto o perfil não chegava: agora `PageHeader` + esqueleto (`SkeletonCard`). Título com
  `PageHeader`. Iniciais com `filter(Boolean)` + maiúsculas; nome e e-mail com `min-w-0` + quebra (um nome de 60 letras sem espaço estourava para 712px).

**Deixado para depois (registrado, não pedido):** resumo do estado nas linhas ("Seg, ter, sex abertos", "3 modelos" — exige dados em cache);
link de ajuda/suporte e versão do app (útil com o aviso do service worker); "Perfil dos alunos" talvez pertença à aba Alunos; trocar a aba "Conta" por
"Ajustes"; WhatsApp do professor visível na própria conta.

### Recuperar senha e Nova senha: rodada de crítica (2026-09-29) — sem migration nova

`src/pages/auth/RecuperarSenha.tsx` (`/recuperar-senha`, "Esqueceu a senha?" do Login) e `src/pages/auth/ResetPassword.tsx`
(`/auth/reset-password`, aberta pelo link do e-mail): crítica **16/40**, relatório em `.impeccable/critique/*recuperarsenha*`. Sete passos na
`dev`, testados pelo Lucas com uma conta de teste. Na página de amostras, seção "Entrada" (Recuperar senha, enviado, Nova senha, link expirado,
verificando).

**ERRO GRAVE corrigido — o fluxo era uma MAQUETE (achado por leitura de código, confirmado por duas avaliações independentes):**
`RecuperarSenha` esperava 0,6s e mostrava "LINK ENVIADO" **sem enviar e-mail nenhum**; `ResetPassword` esperava 0,7s e mostrava "SENHA REDEFINIDA"
**sem alterar nada**. Nunca existiu `resetPasswordForEmail`/`PASSWORD_RECOVERY` no código (`updateUser` só em `changePassword`, que exige a senha
atual). Quem esquecia a senha ficava trancado fora achando que o e-mail caíra no spam. **Regra: nenhuma tela de autenticação pode dizer "enviado"
ou "alterada" sem a chamada real ter dado certo.** Ao implementar, a falha de verdade (limite, conexão, servidor) NÃO é engolida.

**O que foi implementado (`src/integrations/backend/auth.ts`):**
- `sendPasswordResetEmail(email)`: `resetPasswordForEmail` com `redirectTo: <origem>/auth/reset-password`. Sucesso é sempre neutro (não revela se o
  e-mail existe); erros: limite ("Aguarde um momento…"), conexão, e-mail inválido, e um genérico. Cartão "LINK ENVIADO": e-mail em negrito, "olhe a
  caixa de spam", "Reenviar e-mail" com espera de 60s, "Usar outro e-mail", um só "Voltar para o login", foco no título (`role="status"`).
- `redefinirSenhaPeloLink(senha)`: `updateUser({ password })` **sem pedir a senha atual** (a pessoa não a tem) e depois `signOut()`.
  **Decisão do Lucas: depois de redefinir, volta ao LOGIN com o aviso "Senha alterada. Entre com a nova senha."** (não entra direto no app).
- **`estadoDoLinkDeRecuperacao()` lê o `#…type=recovery` (ou `#error=…`) UMA vez, quando o módulo é avaliado**, porque o Supabase (fluxo implícito)
  troca o hash por sessão e o LIMPA logo depois. **Decisão de segurança:** uma sessão comum NÃO basta para redefinir sem a senha atual — quem está
  logado usa "Alterar senha". Sem link de recuperação válido (ou link expirado/já usado, ou página aberta digitando o endereço) a tela mostra
  **"LINK EXPIRADO"** com "Pedir novo link". **Limite conhecido:** recarregar a página depois de abrir o link perde o hash e mostra "LINK EXPIRADO".
- Nova senha: "Mostrar senha", regras com ✓ via **`PasswordRule`** (componente único, agora também usado por `ContaForm`/Criar conta/Convite), botão
  desativado que explica o motivo, "Voltar para o login", esqueleto anunciado ("Verificando o link…"), foco no aviso do link expirado.
  Campo de e-mail: `autoComplete`/`inputMode="email"`/`autoCapitalize="none"`/`spellCheck={false}`, foco no campo com erro, erro em `--red-text`.
  As duas telas aceitam props só para a galeria (`amostra`, `amostraEnviado`), sem efeito no app.

**CONFIGURAÇÃO NO PAINEL DO SUPABASE — depende do Lucas, não do código (registrar aqui para não se perder):**
1. **Authentication → URL Configuration → Redirect URLs:** `<endereço do app>/auth/reset-password` para produção, para o alias de preview
   (`https://bahia-boxe-git-dev-designlferreiras-projects.vercel.app/auth/reset-password`) e para `http://localhost:5173/auth/reset-password`. Sem isso o
   Supabase ignora o `redirectTo` e manda a pessoa para a **Site URL**. Conferir também a **Site URL**. (O Lucas testou o caminho completo no preview, então as URLs do preview
   funcionam; o endereço de **produção** ainda precisa ser confirmado quando o app for a produção.)
2. **Authentication → Emails → modelo "Reset Password": ainda em inglês (texto padrão do Supabase) — traduzir** e manter a variável `{{ .ConfirmationURL }}`,
   com assunto em português. **PENDENTE.** O texto do cartão diz só "pouco tempo" para a validade do link; **o tempo real (padrão 1h) é uma configuração do painel
   que não foi conferida.**
3. **Cota de e-mails:** o SMTP padrão do Supabase tem limite baixo por hora; o "Reenviar" e testes seguidos podem bater nele ("Aguarde um momento…").
   Um SMTP próprio evita e-mails perdidos.
4. Quem nunca confirmou o e-mail e pede recuperação recebe o mesmo e-mail e, ao redefinir, passa a ter a conta usável ("Confirm email" está ativo, ver "Entrada").

**Deixado para depois (registrado, não pedido):** WhatsApp do professor nestas telas (a RPC `whatsapp_do_professor` exige login, então não serve aqui: precisaria de um
contato público); "Esqueci a senha" como bloco do próprio Login; entrar direto depois de redefinir (foi oferecido e recusado); a mensagem do link expirado
distinguir "expirado" de "já usado"; amostras de "erro de rede" e "reenviar aguardando" com o servidor.

### Orientações da aula (professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/OrientacoesAula.tsx` (rota `/admin/orientacoes`, aberta pelo cartão em Configurações): crítica **17/40**, relatório em
`.impeccable/critique/*orientacoesaula*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras ("Orientações da aula (professor)":
preenchidas, vazias e erro — a galeria não tinha amostra desta tela). O que o professor preenche é o que o ALUNO vê no detalhe da aula.

**ERRO REAL corrigido (P0, perda de dados — o MESMO padrão de "Meus dados físicos"):** a tela só tratava `isLoading`; com a consulta FALHANDO o
formulário abria VAZIO e "Salvar orientações" fazia `upsert` de tudo em branco por cima do endereço, equipamento e recado que os alunos veem (o cartão
"Onde será" e "Leve para esta aula" sumiriam para todos, sem aviso). Agora, sem resposta do servidor (`isSuccess`) não há formulário: `ErrorState`
"O que você já salvou não foi alterado… Tentar novamente". **`data === null` (nunca salvou) é resposta válida e mostra o formulário vazio.** Regra
geral do projeto: **toda tela que salva por `upsert` o que veio de uma consulta precisa distinguir "falhou" de "vazio".**

**Decisões do Lucas (não reabrir sem ele):**
- **Antecedência sem valor padrão:** antes "15 min" já vinha marcado e era GRAVADO sem o professor escolher (o aluno passava a ver "chegue 15 minutos
  antes" que ninguém decidiu). Agora começa sem nenhuma; tocar de novo na marcada desmarca; a frase muda ("O aluno vê: …" / "Nenhuma marcada: o aluno não
  vê aviso…"). **Não dá para distinguir** um "15" que o professor escolheu de um "15" gravado como padrão antes desta rodada: fica como está salvo.
- **Prévia "Como o aluno vai ver" no fim da tela**, com avisos âmbar do que o aluno NÃO verá: sem rua não há local (nem mapa) — só avisa quando há outros campos
  de endereço; luvas/bandagem só aparecem com pelo menos um tamanho/comprimento marcado (antes o professor marcava "Obrigatório", esquecia o tamanho e o aluno
  simplesmente não via as luvas). **`src/components/OrientacoesDaAula.tsx` é o componente ÚNICO** dessas orientações, usado na prévia E no detalhe da aula do
  aluno (`student/AulaDetalhe.tsx`) — a prévia nunca diverge da realidade. **Não voltar a duplicar** os blocos "Onde será"/chegada/"Leve para esta aula"/"Orientações".
- **Salvar só quando mudou** (comparado por valor: sem espaços nas pontas, listas ordenadas), com o motivo escrito ("Nenhuma alteração para salvar.") e, depois de
  salvar, "Salvo às HH:MM. Os alunos já veem estas orientações."; erro de salvar em português (antes o texto cru do banco); aviso ao sair pela seta de voltar
  (`onBack`) e por `beforeunload`. **Limite conhecido: as abas de baixo do app não são interceptadas** (`BrowserRouter`, sem `useBlocker`).

**O que mudou / armadilhas:**
- **REGRA DOS HOOKS (bug meu, achado no passo 5):** o `useEffect` do aviso de saída tinha ficado DEPOIS dos `return` antecipados de erro/esqueleto. Isso muda
  a quantidade de hooks entre o esqueleto e a tela pronta e o React lança "Rendered more hooks than during the previous render" — a galeria não mostrava (os
  dados já vêm prontos). Está corrigido (hooks acima dos `return`, com comentário no código). **Ao pôr hooks numa tela com esqueleto/erro, fique ACIMA dos returns.**
- **CEP:** máscara `00000-000`; avisos ("O CEP tem 8 números.", "CEP não encontrado. Preencha o endereço à mão.", falha de rede); "buscando…" 12px; depois de achar,
  o foco vai ao Número. **Não sobrescreve mais o digitado:** a busca só preenche campos VAZIOS ou que ela mesma preencheu antes e o professor não editou
  (`veioDoCep`). Número aceita "S/N" (`inputMode="text"`, 10 caracteres); Estado 2 letras maiúsculas.
- Rótulos de todos os campos ligados (`useId`; antes nenhum tinha nome), textareas com `aria-label` e limite (200/500). Botões de escolha: grupos nomeados
  (`radiogroup` para Não recomendado/Recomendado/Obrigatório; `aria-pressed` para antecedência, tamanhos e proteções), 44px, contorno `muted-foreground/60`,
  marcado em `--red-text`, foco visível; a antecedência quebra em duas linhas em vez de rolar (escondia "20 min" e "30 min").

**Deixado para depois (registrado, não pedido):** "Salvar" automático por campo; separar endereço/equipamento/recado em telas ou salvamentos independentes;
"Não recomendado" renomear para "Não pedir"; "outra" vira "12oz ou outra" na tela do aluno; `mapsUrl` sem CEP; atualização funcional (`setEquipment(prev => …)`)
para dois toques no mesmo instante (não reproduzível por uma pessoa); o cartão em Configurações não cita os "recados".

### Questionário do Perfil de Boxe (aluno e professor): rodada de crítica (2026-09-29) — sem migration nova

`src/components/BoxingProfileQuestionnaire.tsx` (o questionário passo a passo, ÚNICO para as duas vozes), `BoxingProfileLengthChoice.tsx` (escolha da versão) e as
páginas `student/PerfilLutadorQuestionario.tsx` / `admin/AlunoPerfilBoxeQuestionario.tsx`: crítica **20/40**, relatório em
`.impeccable/critique/*boxingprofilequestionnaire*`. Seis passos na `dev`, testados pelo Lucas. Na página de amostras ("Questionário do Perfil de Boxe": escolha
do aluno e do professor, pergunta de escala, pergunta de escolha, última pergunta, resumo final, pergunta do professor — a galeria grava um RASCUNHO no
`localStorage` para abrir na pergunta desejada). **As notas/regras de pontuação NÃO foram tocadas** (só a interface; ver "Reforma do questionário").

**Decisões do Lucas (não reabrir sem ele):**
- **Pergunta de ESCALA (5 níveis) avança sozinha** 0,35s depois de tocar (antes: dois toques por pergunta, 28 na rápida e 74 na completa); dá para voltar e mudar (a
  resposta continua marcada) e o botão "Avançar" continua lá. **Nunca avança sozinho** na última pergunta (concluir é uma decisão) nem nas perguntas de ESCOLHA entre
  situações (exigem ler opções longas). Dica na primeira pergunta. O foco vai para a pergunta nova a cada troca (antes caía no `<body>`).
- **Tela de resumo antes de enviar** ("Confira suas respostas": N de N + a lista com a resposta de cada pergunta): o botão da última pergunta virou **"Revisar respostas"**
  (antes "Concluir" ENVIAVA direto); tocar numa linha reabre aquela pergunta com "Voltar ao resumo" (e uma resposta de escala, ao ser mudada, volta ao resumo
  sozinha); **"Enviar avaliação"** só ativa com tudo respondido. Rótulo do progresso "Revisão final".
- **Escolha da versão:** a **rápida é a recomendada** ("Recomendada para a primeira vez" no aluno, "…para começar" no professor); a completa "mais detalhada e mais demorada";
  **SEM tempos em minutos** (ninguém mediu — a opção "cerca de 3 min/8 min" foi oferecida e recusada; se um dia forem medidos, entra aqui). Link "Preencher altura e
  envergadura em Meus dados físicos" só na voz do aluno (a completa usa altura e envergadura: `physicalAnchor.ts`); no professor a frase fala dos dados do aluno.
  O rodapé deixou de ser aviso solto: "escolha a mesma versão nas próximas vezes para acompanhar a evolução — as duas não são comparáveis".
- **Título e contexto em todas as telas** (`BoxingProfileHeading`): "PERFIL DE BOXE" + "Sua autoavaliação · versão rápida" (aluno) ou **"Ana Beatriz Souza · versão
  rápida" (professor, nome SEMPRE visível — antes o "Avaliando <nome>" de 12,5px sumia depois de escolher a versão e quem avalia o 5º aluno da noite não via de quem se
  tratava)**; `return null` (tela em branco) virou esqueleto.

**O que mudou / armadilhas:**
- **Opção marcada:** texto normal em negrito + ✓ (`Check`) e contorno `border-primary`; antes `text-primary` sobre `bg-primary/15` dava **3,51:1**. Desmarcada com
  `border-muted-foreground/50` (era 1,48:1). Anel de foco na opção INTEIRA (`has-[input:focus-visible]`) e em Voltar/X/cartões; ícones `aria-hidden`.
- **Rascunho:** lido no `useState` preguiçoso (ANTES do primeiro render). Antes um `useEffect` o restaurava depois: piscada na pergunta 1 e o pulo tirava o foco.
  Aviso "Continuando de onde você parou." com **Recomeçar** (pede confirmação, apaga o rascunho). Texto de sair: "ficam salvas neste aparelho" (só vale neste aparelho e se o
  `localStorage` funcionar). **O foco só se move quando o índice muda de fato** (`indiceAnterior`): em desenvolvimento o React roda os efeitos duas vezes e "já montou" roubava o foco.
- Barra de progresso com `aria-label` e `aria-valuetext`; "Escolha uma resposta para continuar." explica o botão desativado; erro de envio em português com "suas respostas
  continuam salvas" (o rascunho só é apagado no sucesso); `studentId!` no envio do aluno virou espera com esqueleto.

**Deixado para depois (registrado, não pedido):** glossário/"não sei" para quem não conhece "jab"/"aparadores"/"guarda"; nomear as 8 dimensões durante o questionário ("Defesa, 2 de 4");
um texto de que "não existe resposta certa"; "usar a mesma versão da última vez" para o professor; trocar de versão sem sair; uma frase de "o que vem depois" ao concluir; a escala
"Quase nunca…Quase sempre" mistura capacidade e frequência ("Consigo iniciar ataques…") — é conteúdo do questionário, não da interface; medir o tempo real das duas versões.

### Resultado do Perfil de Boxe (aluno, logo depois de responder): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/student/PerfilLutadorResultado.tsx` (rota `/app/perfil-lutador/resultado/:id`) e os componentes compartilhados `BoxingProfileResultView` /
`BoxingProfileScoresSummary`: crítica **20/40**, relatório em `.impeccable/critique/*perfillutadorresultado*`. Seis passos na `dev`, testados pelo Lucas. Na página de
amostras ("Resultado do Perfil de Boxe (aluno, logo depois de responder)": completa, rápida, fórmula anterior, não encontrada, erro; e o quadro "Perfil de Boxe · recém-enviado").

**Problema de fundo (dois papéis numa tela só):** a rota era ao mesmo tempo "acabei de enviar" e "abri uma avaliação antiga pelo histórico", sem confirmar o envio (nenhum
`toast.success` em lugar nenhum), sem data, e chamando `BoxingProfileResultView` SEM `notice`, sem combinado e sem botões — quem acabou de concluir e cujo professor JÁ avaliou via só a
autoavaliação (contradizia "o combinado abre a tela"). **Correção estrutural:**

**Decisões do Lucas (não reabrir sem ele):**
- **Depois de enviar o questionário o aluno vai para `/app/perfil-lutador` (a tela principal), NÃO para `/resultado/:id`.** Ela já mostra o resultado mais recente, o combinado, o selo de parcial
  e os botões. Vai `navigate(…, { replace: true, state: { avaliacaoEnviada: true } })` e uma faixa `role="status"` "Avaliação enviada — ela já está salva no seu histórico" aparece uma vez; o `state`
  é limpo para não reaparecer ao recarregar; `["boxing-profile-history"]` é invalidado no envio. **A rota `/resultado/:id` ficou só para abrir uma avaliação ESPECÍFICA** (pelo histórico).
- **A avaliação específica diz DE QUANDO é:** subtítulo "20 ago 2026 · versão completa" (`formatDateWithYear`, novo em `dateUtils.ts` — o `formatDateShort` não mostra o ano) e, se existe uma
  avaliação `self` mais recente, o cartão "Esta é uma avaliação antiga. Seu resultado atual pode ser diferente." com "Ver resultado atual". Fim da tela: **"Ver minha evolução" (principal),
  "Ir para o meu Perfil de Boxe" (secundário), "Falar com o professor sobre isso" (discreto, só com WhatsApp cadastrado)**.
- **"82% de afinidade" não é uma nota:** frase neutra "Quanto as respostas se parecem com esse estilo. Não é uma nota." (vale para aluno e professor). **O aviso de autopercepção subiu para logo depois do
  cartão do estilo**, em convite: "É como você se vê hoje, não uma avaliação técnica. Se não se reconheceu, converse com o seu professor: o resultado muda com você." (antes ficava no fim, a mais de 2.000px, em 12px,
  dizendo "treinador"). Só na voz do aluno (`BoxingProfileResultView`); vem ANTES do selo de parcial.

**O que mudou / armadilhas:** o nome do estilo é um `<h2>` (era `<div>`; visualmente idêntico), troféu `aria-hidden`; "Avaliação não encontrada" tem botão ("Ver meu Perfil de Boxe"); erro com texto específico; esqueleto com a forma
do resultado e `role="status"` ("Carregando o resultado…"). `PerfilLutador` ganhou a prop `amostraEnviada` só para a galeria (sem efeito no app). `BoxingProfileScoresSummary` é compartilhado com a tela do professor (`AlunoPerfilBoxe`).

**Deixado para depois (registrado, não pedido):** **a tela ainda tem ~2.500px (quase três telas)** — encurtar exige decidir o que recolher (pontos fortes/prioridades/foco); "Prioridades de evolução" soa técnico ("No que trabalhar"?);
`FIGHTER_PROFILE_DESCRIPTIONS` abre sempre com "Seu perfil atual demonstra…" (soa diagnóstico); explicar o selo "Versão rápida" ("menos preciso que a completa"); compartilhar o resultado (a arte compartilhável foi cancelada, ver acima); caminho para quem discorda do estilo além de refazer.

### A evolução do Perfil de Boxe (aluno): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/student/PerfilLutadorHistorico.tsx` (rota `/app/perfil-lutador/historico`, "Ver minha evolução"): crítica **20/40**, relatório em
`.impeccable/critique/*perfillutadorhistorico*` (gravado à mão no mesmo formato: o comando do skill falhou por erro transitório do verificador de comandos).
Quatro passos na `dev`, testados pelo Lucas. **Era a última tela sem crítica.** Na página de amostras ("Minha evolução (aluno)": nenhuma avaliação, só
rápidas, 1 completa + rápida, 2 completas com uma da fórmula anterior, 3 completas com uma da fórmula anterior, com queda e igual, 3 completas) — a tela
NÃO tinha amostra e nunca tinha sido vista com dados. **O estado de erro não está na galeria** (o histórico já vem semeado; o componente de erro não mudou).

**Decisões do Lucas (não reabrir sem ele):**
- **Sem 2 avaliações completas, o gráfico dá lugar a um CARTÃO que explica** ("Sua evolução ainda não aparece aqui"): diz quantas completas há, que as
  rápidas não entram ("medem menos") e, se houver, que as da fórmula anterior também ficam de fora; o botão "Fazer nova avaliação" mora DENTRO do cartão.
  Antes o gráfico sumia em silêncio e o aluno achava que a tela quebrou.
- **Uma só ação principal por tela:** cartão presente → botão nele; gráfico presente → "Nova autoavaliação" no fim ("Refaça de tempos em tempos…",
  SEM prometer prazo). Estado vazio ganhou "Fazer minha primeira avaliação". O botão vai direto a `/app/perfil-lutador/questionario` (escolha da versão),
  sem o "você fez uma há pouco, refazer?" que a tela do Perfil de Boxe tem.
- **O gráfico só usa autoavaliações COMPLETAS da fórmula ATUAL** (`scoringVersion === SCORING_VERSION`): notas de fórmulas diferentes mostrariam uma "queda"
  que vem do cálculo, não do aluno. As antigas ficam na lista com o selo âmbar "Calculado pela fórmula anterior" (o mesmo do resultado).
- **Duas barras por competência, com data:** primeira avaliação completa × mais recente ("01 jun 2026 · 46", "24 set 2026 · 66"), sem as barras do meio
  (o texto as ignorava). Diferença em palavras — "Subiu N pontos" / "Ficou igual" / "Ficou em X, N a menos" —, **sem vermelho para queda**.
  A tela abre com "Você subiu mais em A e B." (até 2, só quem subiu de fato) e mostra só essas; "Ver as outras N competências" abre o resto (`aria-expanded`).
  Se nenhuma subiu, as 8 aparecem direto. Com alguma queda: "Uma nota mais baixa não quer dizer que você piorou: pode ser uma leitura mais atenta de si
  mesmo. Converse com o seu professor sobre isso." (**texto novo meu, não aprovado palavra por palavra**).

**O que mudou / armadilhas:**
- "Dimensão" virou "competência" (vocabulário do resto do app); "primeira autoavaliação" virou "primeira avaliação completa"; datas com ANO nesta tela.
- Acessibilidade: os dois títulos são `<h2>`; a lista é `<ul>/<li>` com `aria-label`; cada cartão tem nome falado ("Pressure Fighter / Swarmer, 82% de
  afinidade, 24 set 2026, versão completa, a mais recente", + "calculada pela fórmula anterior" se for o caso); anel de foco nos cartões;
  `motion-reduce` desliga o encolher ao tocar; barras `aria-hidden` com o texto ("Potência: de 46 para 66. Subiu 20 pontos.") só para leitor de tela.
  **A lista é ORDENADA de fato** (mais recente primeiro; não depende da ordem do banco) e a mais recente ganha o selo "Mais recente" (só com 2+).
- **A crítica errou uma cor:** disse que "% de afinidade" era vermelho e devia usar `--red-text`. `text-accent` é o DOURADO do tema (contraste 10,9:1): não mudou.
- **`useState` (`verTodas`) fica acima dos `return`** (ver a regra dos hooks em "Orientações da aula").

**Não conferido:** foco com Tab real, leitor de tela, largura no celular (o painel do navegador tinha largura 0: as medições de overflow não valem) e o
estado de erro. As datas com ano ao lado das barras (`w-[86px]`) podem ficar apertadas em telas estreitas.

**Deixado para depois (registrado, não pedido):** mostrar a leitura do professor ao longo do tempo (a autopercepção pode subir por confiança, não por
técnica); um gráfico de linha com mais de duas medições; comparar com a avaliação anterior (e não só a primeira); "Fazer avaliação completa" com a versão já
selecionada; a borda global do `card-dark`/trilho da barra (1,16–1,48:1, estilo global do tema).

### Polish do tema: contorno de controles e botão destrutivo (2026-09-29) — sem migration nova

Fecha três itens registrados como "estilo global" nas rodadas de crítica ("Deixado para depois"). Um passo na `dev`, testado pelo Lucas. **É uma mudança de tema:
aparece em todas as telas.** Arquivos: `src/index.css`, `src/components/ui/switch.tsx`, `src/components/ConfirmDialog.tsx`.

**O que mudou:**
- **`--control-border: 0 0% 40%`** (novo, em `index.css`): contorno de CONTROLE. `.input-dark` (campo de texto, caixa de texto, valor em R$ — todos passam por ela) e o
  interruptor desligado usam esse valor: **3,26:1 contra o fundo** (medido no navegador). O `--border` (20%) dava ~1,2:1 e o campo sumia no escuro. Telas que já tinham
  contorno próprio mais claro (`border-muted-foreground/60–70`) continuam como estavam (a classe de utilidade vence a da camada de componentes).
- **Interruptor desligado:** contorno interno de 2px (`shadow-[inset_0_0_0_2px …]`) na mesma cor, sem mudar o tamanho (31×52) nem a posição da bolinha; NÃO usei
  `border` porque deslocaria a bolinha. O preenchimento escuro continua.
- **`--destructive-solid: 0 72% 45%`** (novo): preenchimento do botão de confirmar em `ConfirmDialog` (tom destrutivo). O `--destructive` (60% de luz) dava ~3,8:1 com
  texto branco; este dá ~5,5:1 (calculado, não medido na tela).

**Decisões do Lucas que continuam de pé (NÃO mexidas nesta rodada):**
- **O brilho vermelho dos botões primários** (identidade do spec). Eu o listei como alvo ao perguntar o que polir e errei: já estava decidido.
- **Botão desativado com 50% de opacidade** (controles desativados são isentos de contraste; a explicação é por texto).
- **Borda dos cartões comuns (`card-dark`, 1,48:1):** cartão que não é controle não precisa de 3:1 (WCAG 1.4.11 fala de limite de CONTROLE). Cartões que são botões receberam
  contorno mais forte tela a tela nas rodadas anteriores.

**Regra para daqui em diante:** contorno de controle novo usa `--control-border`, não `--border`; botão que confirma ação destrutiva com texto branco usa
`--destructive-solid`, não `--destructive`. O `--destructive` continua servindo para fundos translúcidos (`bg-destructive/10`) e bordas.

**Não conferido:** o resultado visual nas telas (o painel do navegador devolve captura preta; só medi os valores computados), aparelhos reais e o `--destructive-solid`
medido na tela (só calculado).

**Deixado para depois (registrado, não pedido):** o trilho do interruptor ligado (vermelho 51%) tem ~4,8:1 e está ok; o contorno do `card-dark` só muda se houver decisão de
identidade; auditar telas que ainda usam `bg-destructive` sólido com texto branco.

### Polish do fluxo do aluno novo: o convite viaja com a conta (2026-09-29) — sem migration nova

Fluxo caminhado por leitura de código: convite → criar conta → confirmar e-mail → login → Home. Um passo na `dev`, **testado pelo Lucas** (conta de teste, link do e-mail aberto em
outro navegador). Arquivos: `integrations/backend/auth.ts`, `context/AuthContext.tsx`, `pages/auth/Convite.tsx`, `pages/auth/ConfirmarEmail.tsx`.

**Emenda achada (complementa "Entrada: convite e criar conta"):** o convite guardado em `localStorage` só existe no aparelho/navegador onde o aluno abriu o link do professor.
Com "Confirm email" ligado, o link do e-mail pode abrir em OUTRO navegador ou aparelho (o app instalado e o navegador do celular não dividem `localStorage`): o
convite se perdia em silêncio — conta criada, sem vínculo com o professor — e a tela "Confirme seu e-mail" prometia "seu convite é concluído sozinho".

**Decisão do Lucas: levar o convite junto com a conta.** `signUpWithPassword(name, email, password, convite?)` grava o token nos METADADOS da conta
(`user_metadata.convite_pendente`) além do `localStorage`. O `AuthProvider` procura o convite nos dois lugares (`lerConvitePendente() ?? lerConviteDaConta()`) assim que há
usuário logado, tenta `acceptInvite` e, de qualquer jeito, apaga o convite dos dois (`limparConviteDaConta`: `updateUser({ data: { convite_pendente: null } })`).
- `lerConviteDaConta` usa `getSession()` (leitura local, **sem chamada de rede**); só `limparConviteDaConta` fala com o servidor, e só quando havia convite.
- Um `useRef` (`conviteEmAndamento`) impede duas conclusões ao mesmo tempo (o `setProfile` do próprio efeito o dispara de novo).
- **Nada muda no painel do Supabase.** Contas criadas ANTES desta mudança não têm o convite gravado: para elas nada muda.
- Não voltar a guardar o convite só no aparelho. Qualquer fluxo que dependa de estado local depois de um `signUp` com confirmação de e-mail falha quando o link abre em outro lugar.

**Também:** o aviso de erro da tela "Confirme seu e-mail" usava `text-destructive` sobre `bg-destructive/10`; passou a `--red-text`.

**AINDA EM ABERTO (aceito, não decidido):** se `accept_invite` falhar (convite já usado/expirado ou falha de conexão) o app continua **calado** e o aluno segue sem vínculo; o convite é
apagado mesmo assim (não dá para distinguir falha definitiva de transitória). E **não foi verificado o que o aluno VÊ no app quando está sem vínculo com um professor.**
Se aparecer aluno assim, é o primeiro lugar a olhar (junto com a consulta para achá-lo e ligá-lo, já registrada em "Entrada").

**Não conferido:** o fluxo em aparelho real além do teste do Lucas; convite que expira entre o cadastro e o primeiro login.

### Alterar senha (aluno e professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/shared/AlterarSenha.tsx` (`/app/minha-conta/alterar-senha` e `/admin/minha-conta/alterar-senha`, mesma tela com a prop `backTo`): crítica **19/40**, relatório em
`.impeccable/critique/*alterarsenha*`. Cinco passos na `dev`, testados pelo Lucas. Na página de amostras ("Alterar senha (aluno e professor)": em branco, senha atual errada,
falha geral, sucesso, professor). **Esta tela NUNCA tinha sido criticada nem estava na galeria** (eu tinha dito que todas as telas já haviam passado pela crítica: era falso).
**Continuam SEM crítica:** Perfil dos alunos (`admin/PerfilAlunos.tsx`), sino de notificações (`NotificationBell`), as duas barras de navegação de baixo e a tela 404 (`NotFound`).

**O que estava errado (achados, complementa "Recuperar senha e Nova senha"):**
- **Texto de maquete visível a usuário real:** "Demo: a senha atual é 123456". Apagado. A troca em si sempre foi real (`changePassword` reautentica e depois `updateUser`).
- **O `<form>` envolvia SÓ o botão:** o Enter num campo (e o "Ir" do teclado do celular) não enviava, e o gerenciador de senhas não reconhecia o formulário. Agora envolve os campos.

**Decisões do Lucas (não reabrir sem ele):**
- **Sucesso: só corrigir o TEXTO, sem mexer na sessão.** "Pronto. Você continua conectado neste aparelho e vai usar a nova senha nos próximos acessos." (antes "Use-a no próximo
  login": impreciso, `changePassword` NÃO faz `signOut`). **Não há opção "Sair dos outros aparelhos":** oferecida e recusada. **O que acontece nas outras sessões/aparelhos depende do
  Supabase e NÃO foi conferido.**
- **"Não lembro minha senha atual" = link que EXPLICA o caminho** (sair da conta e tocar em "Esqueceu a senha? Recuperar" no login), **sem deslogar sozinho.** A alternativa de um
  botão que sai e leva ao Recuperar senha foi oferecida e recusada.
- Escopo: tudo, na ordem (P1 → acabamento).

**O que mudou / armadilhas:**
- **Dois erros, cada um no seu lugar:** o da senha atual fica embaixo do campo dela (`aria-invalid` só nele) e leva o foco; o resto (conexão, limite, senha fraca) fica embaixo do botão.
  Somem ao editar QUALQUER dos três campos. Vermelho em `--red-text` (o `text-destructive` dava 4,2:1 sobre `bg-destructive/10`). O aviso (`toast`) que repetia a mensagem foi removido, nos
  dois sentidos (erro e sucesso).
- **`changePassword` (auth.ts) distingue a falha da conferência:** só credencial inválida (status 400 / "invalid login credentials") vira `AuthError` com `code = "senha_atual_incorreta"` (a tela
  põe no campo); 429 vira "Muitas tentativas…"; o resto, "Não foi possível verificar sua senha atual. Verifique sua conexão…". Antes TODA falha ali virava "Senha atual incorreta".
- **Sucesso:** `role="status"`, o foco vai ao título "SENHA ALTERADA" (`tabIndex={-1}`), "Voltar para a conta" usa `navigate(backTo, { replace: true })`.
- **Botão "Mostrar senhas"/"Ocultar senhas"** (vale para os TRÊS campos; antes "Mostrar" ao lado de "Senha atual"): 44px (margem negativa mantém a linha do rótulo compacta), foco visível,
  `aria-pressed`. **Regras da senha usam `PasswordRule` (componente compartilhado, com ✓ e "— atendido")**; a cópia local `Rule` (só mudava de cor) foi apagada.
- **Botão desativado diz o motivo por texto** (primeiro pendente): "Digite sua senha atual." / "A nova senha ainda não segue todas as regras." / "Escolha uma senha diferente da atual." /
  "As duas senhas precisam ser iguais." **Nova senha igual à atual é bloqueada no cliente** (`igualAtual`).
- **Aviso ao sair com campos preenchidos:** a seta de voltar abre "SAIR SEM ALTERAR?" (`ConfirmDialog`) e `beforeunload` cobre fechar/recarregar a aba. **Limite conhecido, igual às outras telas:
  as abas de baixo não são interceptadas** (`BrowserRouter`, sem `useBlocker`). Nada disso vale na galeria (`amostra`).
- **Campos travados durante o envio** (`<fieldset disabled>`). Como um campo desativado não aceita foco, **o foco volta num `useEffect` que só roda com `loading` falso** (senha atual errada → campo da
  senha atual; falha geral → botão). **Não focar dentro do `catch`:** ainda é `loading`.
- `amostra` é uma prop SÓ para a galeria (`"erro-atual" | "erro-geral" | "sucesso"`, campos já preenchidos com senhas de exemplo diferentes entre si); sem efeito no app.

**Não conferido:** o foco depois de um erro real, o aviso ao sair e o leitor de tela (só a estrutura na galeria, cuja captura do navegador vem preta); o que os outros aparelhos veem depois da troca; a
mensagem do Supabase para senha fraca/igual (`same_password`/`weak_password` não são mapeadas aqui; só em `redefinirSenhaPeloLink`).

**Deixado para depois (registrado, não pedido):** um formulário de senha ÚNICO para esta tela e a Nova senha (hoje só compartilham `PasswordRule`); "Sair dos outros aparelhos" (recusado);
mapear `same_password`/`weak_password` em `changePassword`; placeholder "Sua senha de hoje" (informal).

### Sino de notificações (aluno e professor): rodada de crítica (2026-09-29) — sem migration nova

`src/components/NotificationBell.tsx` (sino com contador + folha "NOTIFICAÇÕES"; usado na Home do aluno e no painel do professor) e `deriveNotifications` em `api.ts`: crítica **22/40**,
relatório em `.impeccable/critique/*notificationbell*`. Quatro passos na `dev`, testados pelo Lucas. Na página de amostras ("Sino de notificações": aluno com avisos, aluno sem avisos,
professor com avisos, consulta falhada — **toque no sino** para abrir a folha).
**Continuam SEM crítica:** Perfil dos alunos (`admin/PerfilAlunos.tsx`), as duas barras de navegação de baixo e a tela 404 (`NotFound`).

**FATOS que mudam a leitura (não desfazer sem decisão):**
- **Não existe tabela de notificações.** Tudo é DERIVADO na hora (`deriveNotifications`) de aulas, pedidos e avaliações do professor.
- **"Lida" e "limpa" moram em `localStorage`** (`bb.notifications.<userId>`), POR APARELHO: não sincronizam entre celular e computador. **"Limpar" só esconde os ids neste aparelho**; em outro
  aparelho os avisos continuam. Guardar "lido até <hora>" no servidor (uma coluna em `profiles`) resolveria os dois aparelhos, mas é mudança de banco: **dívida registrada, não feita**.
- Para o aluno, notificação era sinônimo de ESTADO atual, não de evento: toda aula futura `scheduled` gerava "Aula confirmada".

**Decisões do Lucas (não reabrir sem ele):**
- **"Aula confirmada" só para as aulas que o ALUNO agendou** (`!b.pacote_id`). As aulas que o professor gera na recorrência (têm `pacote_id`) deixam de virar uma notificação cada (o aluno de
  recorrência abria o sino e via 12 "Nova" de uma vez, sem nada a fazer). **Remarcação ("Aula remarcada") e reposição continuam avisando em qualquer modo.** A descrição agora traz a
  DATA da aula ("Sua aula é Sexta, 03 de outubro · 19:00.", no lugar de "Seu horário está garantido"): a hora do cartão é a de quando o aviso nasceu ("há 3 dias"). Notificações antigas de
  "Aula confirmada" de recorrência simplesmente somem da lista (nada é apagado no banco).
- **"Limpar central" virou "Limpar avisos", SEM janela de confirmação**, só com "Desfazer" (8s, `toast(...)` neutro — não `toast.warning`, âmbar é "depende do professor"): "Avisos limpos
  neste aparelho". "Central" saiu do vocabulário. A alternativa de manter a confirmação foi oferecida e recusada.
- Escopo: tudo, na ordem.

**O que mudou / armadilhas:**
- **Falhou ≠ vazio:** a folha mostra esqueleto ao carregar e `ErrorState` ("Não conseguimos carregar suas notificações" + "Tentar novamente") se a consulta falhar; o "Nenhuma notificação" só
  aparece com a consulta OK e a lista vazia. O subtítulo ("N não lidas") só aparece com a lista carregada (na falha "0 não lidas" seria mentira).
- **Tocar numa notificação SEMPRE leva ao destino:** `openNotif` navega em `onSettled` (antes só no `onSuccess`: se a marcação como lida falhasse, o toque não fazia nada). "Marcar todas", "Limpar" e o
  "Desfazer" têm aviso de erro (o Desfazer não tinha `try/catch`) e travam o duplo toque (`isPending`).
- **Estado vazio por papel:** aluno — "Avisos sobre suas aulas e pedidos aparecem aqui."; professor — "Pedidos e horários esperando a sua resposta aparecem aqui."
- Acessibilidade: a lista é `<ul aria-label="Notificações">`/`<li>`; anel de foco nos avisos e no Fechar; ícones `aria-hidden`; ícone de cancelamento em `--red-text`; "Nova" também por
  texto (`sr-only "Nova. "` no título; o selo visual é `aria-hidden`); `SheetDescription` (sr-only) — **`SheetDescription` é um export NOVO de `ui/sheet.tsx`**, só o sino o usa por enquanto;
  `motion-reduce` desliga o encolher ao tocar; **contador do sino 12px (era 10,5px), 20px de altura e "99+"**; subtítulo "2 não lidas" / "1 não lida" / "Tudo lido"; "Marcar todas" SÓ com não
  lidas (`unread > 0`).
- **Galeria:** `SeededAdmin` agora só semeia `["notifications", ADMIN_ID]` = `[]` se a chave NÃO existe (antes sobrescrevia o que a amostra semeava); o erro da consulta é simulado com
  `getQueryCache().build(...).setState({ status: "error", ... })`. O `Toaster` do Sonner não existe na galeria: o aviso "Avisos limpos…" e o "Desfazer" só se veem no app real.

**Não conferido:** o aviso de limpar/desfazer e a marcação real de "lida" (dependem do `localStorage` do app); a regra nova de "Aula confirmada" com dados reais (a galeria não roda `deriveNotifications`);
foco por Tab e leitor de tela (só a estrutura na galeria); o erro de consulta em aparelho real.

**Deixado para depois (registrado, não pedido):** nome do aluno nos avisos do professor ("Um aluno pediu um horário" continua sem nome: exigiria uma consulta a mais); "Toque para ver os detalhes."
genérico na recusa sem recado; "lido/limpo" no servidor (ver acima); agrupar/separar "novas" e antigas; o fundo da folha usa uma cor fixa (`#161616`), não o token do cartão.

### Perfil dos alunos (professor): rodada de crítica (2026-09-29) — sem migration nova

`src/pages/admin/PerfilAlunos.tsx` (`/admin/perfil-alunos`, linha "Perfil dos alunos" em Minha conta do professor; estatísticas do CONJUNTO a partir de "Meus dados físicos" dos alunos):
crítica **19/40**, relatório em `.impeccable/critique/*perfilalunos*`. Quatro passos na `dev`, testados pelo Lucas. Na página de amostras ("Perfil dos alunos (professor)": 12 alunos, poucos
preencheram, ninguém preencheu, sem alunos, a consulta falhou). **Continuam SEM crítica:** as duas barras de navegação de baixo e a tela 404 (`NotFound`).

**FATOS DE DADOS (lidos nas migrations e no código, NÃO no banco real) — resolvem a dúvida antiga de "Meus dados físicos":**
- `getStudentProfileStats` (api.ts) baixa `select("*")` de `student_profiles` de TODOS os alunos do professor e AGREGA NO NAVEGADOR DELE; não há RPC/view de agregados.
- `0004_student_profiles.sql` cria `student_profiles_admin_select`: **o professor pode LER a linha individual de cada aluno seu.** Nenhuma tela mostra o número de um aluno, mas o dado individual chega ao
  aparelho dele. **A promessa ao aluno vale só para a INTERFACE, não para o banco.** Para valer de verdade seria preciso agregar no servidor (RPC `security definer` devolvendo só agregados +
  revogar a leitura da linha): **oferecido, NÃO escolhido (mexe em segurança, exige migration + verificação), dívida registrada.**
- Antes não havia mínimo algum: com 1 aluno, média = mín = máx = o dado dele (e "100% · 1"); com 2, os dois valores ficavam expostos; com 3, o terceiro se deduzia por média×3 − mín − máx.

**Decisões do Lucas (não reabrir sem ele):**
- **Privacidade = mínimo NA TELA + texto do aluno honesto** (a alternativa "agregar no servidor" foi oferecida e recusada). **Mínimo de 5 alunos por cartão** (`MIN_ALUNOS_NA_ESTATISTICA` em
  `lib/studentProfile.ts`): abaixo disso o cartão diz "Poucos alunos preencheram ainda (2 de 8). Os números aparecem a partir de 5, para não expor o dado de cada um." (0 = "Ninguém preencheu ainda.").
  **O texto do aluno em `student/Perfil.tsx` usa a MESMA constante:** "Seu professor vê só a média e as contagens do conjunto dos alunos, e só quando pelo menos 5 alunos preencheram o mesmo dado: nunca os
  seus números." Mudar o 5 muda as duas telas juntas.
- **Uso da tela: equipamento e duplas, com FAIXAS** (não só média): peso (Menos de 60 / 60 a 75 / 75 a 90 / 90 kg ou mais), altura e ENVERGADURA (Menos de 1,60 / 1,60 a 1,70 / 1,70 a 1,80 /
  1,80 m ou mais), lateralidade, guarda, sexo. **Os cortes são uma CONVENÇÃO minha** (`FAIXAS_PESO_KG`/`FAIXAS_ALTURA_CM`, faixa [de, ate): o valor exato da divisa cai na faixa de cima), fáceis
  de trocar num lugar só sem afetar nenhum dado gravado.
- Escopo: tudo, na ordem.

**O que mudou / armadilhas:**
- **Mínimo e máximo SAÍRAM** (são, por definição, o dado de um aluno, mesmo com muita gente): fica a MÉDIA (altura/envergadura sem casa decimal, peso com uma, vírgula em vez de ponto).
  `NumericStats.min/max` ainda existem em `api.ts`, mas a tela NÃO os mostra: **não mostrar de novo.**
- **Grupos com menos de 2 alunos não aparecem** (`MIN_ALUNOS_POR_GRUPO`): "10% · 1" identificava um aluno mesmo numa turma grande. A tela avisa quantos ficaram de fora ("2 alunos estão em
  grupos com menos de 2 pessoas e não aparecem aqui…" / "1 aluno está num grupo sozinho…"), senão as porcentagens pareceriam errar a conta. Limite conhecido: o mínimo protege o caso mais grave,
  não impede alguém de deduzir por eliminação em turmas muito pequenas.
- `numericStats(values, faixas)` devolve também `faixas: {label, count}[]`; `StudentProfileStats` ganhou `wingspanCm` (a envergadura já era coletada em `student_profiles` e não aparecia).
- **Falhou ≠ vazio:** `ErrorState` com "Tentar novamente" (antes uma linha de texto vermelho solto, sem `role=alert`); esqueleto com a forma da página (cinco blocos) e `role=status`, que também cobre a
  consulta ainda desligada (sem perfil) — antes só o título na tela. Com alunos mas NINGUÉM preencheu: um aviso só ("Ninguém preencheu ainda…"), não cinco cartões iguais.
- Lista de verdade (`ul/li`), barras `aria-hidden` (o número está em texto ao lado), textos >= 12px (o "N de M preencheram" era 11,5px e o rótulo da média 10,5px), barras em `bg-foreground/70`
  (o dourado é "ação positiva", não dado), grupos do maior para o menor, ordem pelo uso (Peso, Altura, Envergadura, Lateralidade, Guarda, Sexo) e uma linha de resumo no topo ("12 alunos. Cada cartão
  diz quantos preencheram aquele dado."). Os nomes das guardas já vinham em português; não mudaram.

**Não conferido:** o visual real (a captura do navegador da galeria vem preta; só textos e atributos), os dados reais de alunos, foco/leitor de tela, e o comportamento com dados de verdade em
turmas pequenas.

**Deixado para depois (registrado, não pedido):** agregar no servidor (ver acima); renomear a tela ("A turma"/"Como é a turma") e um atalho no cartão "Alunos"; uma ação para lembrar os alunos de
preencher (WhatsApp); a divisão "N de M" por dado versus as % (base diferente) continua em cada cartão.

### Barras de navegação de baixo (aluno e professor): rodada de crítica (2026-09-29) — sem migration nova

`StudentBottomNav.tsx`, `AdminBottomNav.tsx` e, NOVOS, `BottomNavItem.tsx` e `BottomNavShell.tsx` (montadas em `layouts/StudentLayout.tsx` e `AdminLayout.tsx`): crítica **25/40**, relatório em
`.impeccable/critique/*bottomnav*`. Quatro passos na `dev`, testados pelo Lucas. Na página de amostras ("Barras de navegação (aluno e professor)": dez quadros, um por situação). **Continua SEM crítica só
a tela 404 (`NotFound`).**

**Decisões do Lucas (não reabrir sem ele):**
- **A barra do professor tem 5 abas** (eram 6): **Painel, Agenda, Alunos, Aulas, Conta.** **"Pedidos" SAIU da barra**; a tela continua em `/admin/solicitacoes`, acessível pelo "Resolver agora" do
  Painel e pelo sino, e **acende a aba Painel**. Com seis abas cada uma tinha 49-58px e o rótulo era de 9,5px. **O número de pendências vive na aba Painel** (ver contador abaixo).
- **Mapa central de "onde estou"** (cada barra declara, ao lado de cada aba, os prefixos que lhe pertencem — `prefixos` de `BottomNavItem`): aluno — detalhe da aula (`/app/aula`) acende **Aulas**;
  Pacotes e Perfil de Boxe (`/app/pacotes`, `/app/perfil-lutador`) acendem **Conta**. Professor — detalhe da aula (`/admin/aula`) acende **Agenda**; `/admin/pacotes`, `/admin/disponibilidade`,
  `/admin/orientacoes`, `/admin/perfil-alunos`, `/admin/configuracoes` acendem **Conta**; `/admin/solicitacoes` acende **Painel**. **O detalhe da aula do professor SEMPRE acende Agenda**, mesmo vindo de Aulas
  ou do detalhe de um aluno (guardar a origem exigiria estado de navegação): escolha minha, aceita. **Ao criar uma tela nova de segundo nível, acrescente o prefixo na aba certa** (senão nenhuma acende).
  O caso especial que só existia para `/admin/alunos/` era redundante (a aba Alunos já casa por prefixo) e saiu.
- **Contador do Painel = pedidos de pacote/aula avulsa + pedidos de horário/remarcação** (`purchase_requests` pendentes + `bookings` em `pending_confirmation`, o mesmo conjunto do "Resolver agora" e do
  sino). Antes só contava os de pacote, e o painel, o sino e a aba discordavam.

**O que mudou / armadilhas:**
- **`BottomNavItem` é o item ÚNICO das duas barras** (as duas eram cópias que divergiram: rótulo 12px x 9,5px, cinza cheio x `/70` a 3,81:1, `gap` e ícones diferentes). Usa `Link` (não `NavLink`) e calcula
  a aba ativa com `casaPrefixo(pathname, [to, ...prefixos])`, pelo limite do segmento ("/app/aula" casa "/app/aula/7", não "/app/aulas"); põe `aria-current="page"` ele mesmo. **Aba ativa = cor + um traço de 2px no topo +
  rótulo em negrito** (a cor sozinha não é uma marca de forma). Rótulo `text-xs` (12px) em todas; inativa em `text-muted-foreground` cheio; `focus-visible:ring-2`; ícones `aria-hidden`.
- **Contador (`countPendenciasDoProfessor`, api.ts):** dois `count: "exact", head: true`, só CONTAM (antes a barra usava `getPurchaseRequests`, que trazia alunos, modelos, pacotes e saldos a cada 15s em TODA tela do professor
  para olhar `.length`). Atualiza a cada **60s**, só com o app visível, `staleTime` 30s. **A chave da consulta é `["admin-dashboard", "pendencias", id]` DE PROPÓSITO:** Pedidos, Painel, Agenda e o detalhe da aula já
  invalidam o prefixo `["admin-dashboard"]` ao decidir algo, então o número acompanha sem essas telas conhecerem a chave. Selo de 12px, círculo de 20px, "9+", e texto `sr-only` ("3 pendências"; o `aria-label`
  fixo que escondia o número saiu).
- **`BottomNavShell`:** `<nav>` das duas, com a altura `calc(62px + max(22px, env(safe-area-inset-bottom)))` e o mesmo valor de `padding-bottom` (antes 84px/22px fixos: num iPhone com barra de gesto grande os alvos ficavam sob o
  indicador; `viewport-fit=cover` já existia). **No celular (`pointer: coarse`), enquanto um campo de TEXTO (input de texto/e-mail/senha/busca, textarea, select, contenteditable; checkbox/botão/faixa não contam) está com o foco, a barra desce
  (`translate-y-full`) e volta ao perder o foco.** No computador nada muda. `.page-container` mantém `pb-28` (112px), maior que a barra mesmo com a área segura.
- **Galeria:** as barras são `fixed`; cada quadro tem um contêiner com `[transform:translateZ(0)]` que as prende ao quadro (a mesma armadilha do `.page-container`, agora usada a favor). O contador dos quadros do professor é semeado em
  `["admin-dashboard", "pendencias", PROFESSOR.id]` (um número).

**Não conferido:** o visual real (a captura do navegador da galeria vem preta), a margem da barra de gesto e o teclado escondendo a barra (dependem de aparelho de toque), o contador com dados reais, foco por Tab e leitor de tela.

**Deixado para depois (registrado, não pedido):** guardar a aba de ORIGEM do detalhe da aula do professor (Aulas/Alunos em vez de sempre Agenda); renomear "Aulas" do professor (é o histórico de todos os alunos, o do aluno é "suas aulas"); tirar o
`backdrop-blur-xl` da barra (custa GPU em aparelhos fracos e quase não aparece com 92% de opacidade); "Agendar" do aluno aparece e some enquanto o modo carrega (salto de 4 para 3 abas); ícones 21px x 20px antes (agora 21px nos dois);
`staleTime: Infinity` no modo (a troca do modo só aparece ao recarregar).

### Tela 404 e abertura do app: rodada de crítica (2026-09-29) — sem migration nova

`src/pages/NotFound.tsx` (rota `*`), e, do mesmo caminho, `App.tsx` (`PostLoginRedirect`), `ProtectedRoute.tsx`, `Login.tsx` e o componente NOVO `TelaDeAbertura.tsx`: crítica **15/40** (a mais baixa do app depois de Pacotes do aluno),
relatório em `.impeccable/critique/*notfound*`. Três passos na `dev`, testados pelo Lucas. Na página de amostras ("Página não encontrada": 404 logado, 404 deslogado, abertura do app).
**Com esta rodada, todas as telas do app já passaram por uma crítica.**

**FATOS (código e configuração) — não desfazer sem decisão:**
- **Um endereço desconhecido NUNCA dá um 404 de verdade:** o `vite-plugin-pwa` (sem `navigateFallback`/`workbox`, o `NavigationRoute` padrão para `index.html`) e o `vercel.json` (rewrite `/(.*)` → `/index.html`) devolvem o app para
  QUALQUER endereço; a 404 é só da SPA (status 200), online e offline. **No app instalado (`display: standalone`) não há barra de endereço nem botão de voltar do navegador**: os botões da 404 são a única saída.
- A rota `*` fica FORA dos layouts e do `ProtectedRoute`: sem barra de navegação, mesmo logado. Nenhuma outra tela define `document.title`.
- **Sem `.env` local o `AuthProvider` lança "Supabase não configurado"; ANTES não havia error boundary e qualquer rota, inclusive a 404, ficava em branco** (só afeta quem roda sem credenciais, como o navegador desta sessão). **Resolvido depois da rodada: ver "Error boundary" no fim desta seção.**

**Decisões do Lucas (não reabrir sem ele):**
- **Texto da 404 em português, marca e dois botões:** marca "BAHIA BOXE" + ícone `SearchX`, título **"NÃO ACHAMOS ESSA PÁGINA"**, "O link pode estar antigo ou incompleto. Volte ao início e siga por lá." (**os textos são meus, aprovados**).
  Botão principal pela SESSÃO: logado **"Ir para o início"** (`/`, que já manda cada papel para a sua home), deslogado **"Entrar"** (`/login`); **"Voltar"** (secundário, `navigate(-1)`) só quando há para onde voltar
  (`window.history.state.idx > 0`, posição que o React Router guarda). Enquanto a sessão carrega os botões esperam (esqueleto de 52px: senão "Entrar" apareceria por um instante para quem está logado). Título da aba "Página
  não encontrada · Bahia Boxe" (restaurado ao sair) e foco no título (`tabIndex={-1}`) para o leitor de tela anunciar a mudança.
- **Abertura do app: corrigir o "pisca" do login.** Antes `PostLoginRedirect` NÃO consultava `AuthContext.loading`: ao abrir `/` (`start_url` do PWA) já logado, `profile` ainda era null e ele mandava para `/login`; o Login só voltava
  para a home DEPOIS (`if (profile)`), então o **formulário de login piscava a cada abertura**, e as rotas protegidas mostravam `return null` (tela vazia). Agora `PostLoginRedirect`, `ProtectedRoute` e `Login` mostram
  `TelaDeAbertura` (a marca "BAHIA BOXE" com `animate-bb-pulse`, desligada com "reduzir movimento"; `role="status"` sr-only "Abrindo o Bahia Boxe…") enquanto `loading` é verdadeiro. `loading` só vale para a carga INICIAL
  (`signIn` não o mexe), então entrar pelo formulário não passa pela tela de abertura. **Risco aceito: se a verificação da sessão nunca responder (rede que trava sem falhar), a pessoa fica na tela de abertura em vez de ver o
  login; uma falha de rede comum termina em erro e cai no login normalmente.**
- **Rota do OUTRO papel: aviso ao redirecionar** (aluno em `/admin/...`, professor em `/app/...`): `RedirecionaPapelErrado` em `ProtectedRoute.tsx` dispara `toast("Esse endereço não é para o seu tipo de conta.", { id: "papel-errado" })`
  e leva à própria home, como antes. Neutro (`toast`, não âmbar/vermelho: não é erro de quem abriu), `id` fixo para não repetir no StrictMode. A alternativa de mostrar a 404 nesse caso foi oferecida e recusada.
- Escopo: tudo, na ordem.

**O que mudou / armadilhas:**
- `NotFound` aceita `amostra` (SÓ para a galeria: não mexe no título nem no foco da página de amostras) e usa `useAuth` (`profile`, `loading`): **não renderizá-la fora do `AuthProvider`.**
- **Toda tela que decide por `profile` antes de a sessão carregar tem que esperar `loading`** (a lição do pisca): `PostLoginRedirect`, `ProtectedRoute` e `Login` já esperam; uma tela pública nova que redirecione por `profile` deve fazer o mesmo.

**Não conferido:** o "pisca" com sessão real (só a tela de abertura na galeria), o botão "Voltar" e o foco no título (a galeria não tem histórico), o aviso de papel errado (a galeria não tem o `Toaster` nem sessão), o app instalado em aparelho real.

**Deixado para depois (registrado, não pedido):** "Falar com o professor" (WhatsApp) na 404 do aluno logado (exigiria uma consulta na 404); a 404 dentro do layout do papel, com a barra de baixo;
um título de aba próprio em TODAS as telas; redirecionar endereços desconhecidos para a home com aviso em vez de mostrar a 404.

**Error boundary (2026-09-29, pedido do Lucas logo depois da rodada; um passo na `dev`, testado):** `src/components/ErrorBoundary.tsx`, montado em volta de `<App />` em `main.tsx`. Um erro de RENDERIZAÇÃO ou de
EFEITO em qualquer tela derrubava o app numa tela em branco, sem nada a fazer; agora aparece **"ALGO DEU ERRADO"** (marca + `TriangleAlert`, `role="alert"`), com **"Recarregar o app"** (`location.reload()`) e **"Ir para o início"**
(`location.assign("/")`, recarga completa: o estado quebrado ficaria na memória com um link do Router). **Os textos são meus, aprovados pelo Lucas:** "O app encontrou um problema e não conseguiu continuar. Recarregar costuma resolver.
Se voltar a acontecer, fale com o seu professor."
- **Conferido de verdade:** o app real SEM `.env` (o caso que deixava a tela em branco) passou a mostrar a tela de erro; a galeria tem o quadro "Erro inesperado" (`BombaDeAmostra` lança de propósito; o React registra o erro no console, é esperado).
- **Fica FORA do Router e do `AuthContext` de propósito** (podem ser justamente o que quebrou): só HTML, o `Button` e recarga completa. **Não usar `Link`/`useNavigate`/`useAuth` ali.**
- **NÃO pega:** erro em manipulador de clique, `setTimeout` e promessa (esses têm aviso de erro nas telas: `onError` das mutations, `ErrorState` das consultas). **Não recarrega sozinho** (um erro persistente viraria um laço de recargas).
- Só em DESENVOLVIMENTO aparece a mensagem técnica do erro (pequena, embaixo); em produção, nunca. O erro sempre vai para o `console.error`.
- **Continua sem:** relato automático do erro (não há serviço de monitoramento); um erro numa tela específica derruba o app inteiro em vez de só aquela tela (um boundary por rota seria o passo seguinte, se fizer falta).

### Endurecimento (`harden`) das telas que salvam dados (2026-09-30) — sem migration nova

Três passos na `dev`, testados pelo Lucas. Escopo escolhido por ele: telas que gravam dados.

**Passo 1 — avisos de erro legíveis (`src/lib/erros.ts`, `mensagemDeErro(err, fallback)`, com testes).** ~33 telas faziam `err instanceof Error ? err.message : fallback` e o usuário via o texto CRU do servidor
("Failed to fetch", "JWT expired", "not_allowed", "row-level security"). Agora: sem internet/falha de rede → "Sem conexão com a internet…"; sessão vencida → "Sua sessão venceu. Entre de novo…"; código snake_case ou mensagem técnica
(Postgres/PostgREST/JS) → o texto de reserva da tela; o resto passa como veio (as RPCs e o `api.ts` já lançam português de propósito). **Todo `onError` novo usa `mensagemDeErro`, nunca `err.message` direto.**
Exceção deliberada: `Agendar.tsx` (`scheduleBookingErrorMessage`) lê o CÓDIGO da RPC e traduz por mapa — não passar pelo tradutor.

**Passo 2 — textos longos.** `overflow-wrap: anywhere` no `body` (`index.css`): nome/e-mail sem espaço quebra em vez de estourar o cartão ("anywhere", não "break-word", porque também reduz o mínimo de itens flex). Antes, 5 de 38 pontos
da galeria estouravam com um nome de 79 letras. `maxLength`: nome 80, e-mail 254, senhas 72, nome do modelo de pacote 60, descrição 300, recado ao recusar aula 300, WhatsApp 20, peso 6. **Limite conhecido:** a medição da galeria
apontou 1 item restante, achado tratado como falso positivo (fora do quadro medido); não confirmado em tela.

**Passo 3 — offline.** `FaixaSemInternet` (faixa âmbar no topo, `role="status"`, some ao reconectar; `useSyncExternalStore` sobre `navigator.onLine`, só aparece quando é falso) montada em `App.tsx`. `QueryClient`:
`mutations: { networkMode: "always" }` — gravação offline FALHA NA HORA e cai no `onError`, em vez de pausar com o botão em "Salvando…" para sempre; consultas continuam no padrão (pausam sem rede e retomam sozinhas).

**Não feito (registrado, não pedido):** conexão lenta (as chamadas não têm tempo limite); o que o app instalado mostra offline além da faixa (o service worker só guarda o cache do próprio app); outras partes do `harden`
(RTL/i18n não se aplicam: o app é só em português; listas com centenas de itens não foram testadas além do que já é paginado).

### Endurecimento (`harden`) da entrada e da sessão (2026-09-30) — sem migration nova

Um passo na `dev`, testado pelo Lucas. Continuação do `harden` das telas que salvam dados (seção acima); alvo escolhido por ele: entrada e sessão.

**ERRO REAL corrigido (por leitura do código): falha ao carregar o perfil virava "sem perfil" e mandava a pessoa para o login com a sessão ainda válida.** `loadProfile` (`auth.ts`) devolvia `null` tanto para "a linha não existe"
quanto para qualquer erro (sem rede, servidor fora, token em renovação). Consequências: abrir o app instalado SEM SINAL caía no login; e a cada renovação do login (`onAuthStateChange`) numa conexão ruim a pessoa era jogada para fora no meio do uso.
Agora `loadProfile` LANÇA `AuthError` (`code = "profile_load_failed"`) em erro e só devolve `null` quando a linha realmente não existe.
- `AuthProvider` ganhou `loadError` e `retry` (opcionais no tipo do contexto, para a galeria não precisar informá-los). Se o perfil não carrega na abertura: `loadError = true` e `loading = false` — **não** vira "deslogado".
  Se falha numa renovação durante o uso, a pessoa continua onde está (o listener engole o erro em vez de chamar `cb(null)`). `refreshProfile` também tem `.catch`.
- **`TelaSessaoNaoCarregou`** ("NÃO CONSEGUIMOS ABRIR SUA CONTA", "Tentar de novo" e "Entrar com outra conta"; textos meus, aprovados) é mostrada por `PostLoginRedirect` (`App.tsx`) e `ProtectedRoute` quando `!profile && loadError`, no lugar do redirecionamento ao login.
  "Entrar com outra conta" encerra a sessão local. Está na galeria ("Sessão sem perfil").
- **Aviso quando a sessão termina sozinha** (vencida, revogada ou encerrada em outra aba): `toast("Sua sessão terminou. Entre de novo para continuar.", { id: "sessao-terminou" })`. Não aparece quando a própria pessoa toca em Sair
  (`saidaManual` ref + `profileRef`). Neutro, não vermelho.
- **Regra:** `loadProfile` não pode voltar a engolir o erro; qualquer novo chamador precisa tratar a exceção (signIn e cadastro já a mostram na tela).

**Não conferido:** a abertura offline do app instalado em aparelho real (o service worker pode nem entregar o app sem cache); o aviso de "sessão terminou" quando o Supabase só notifica a outra aba com atraso.

**Não feito (registrado, não pedido):** o que o aluno VÊ no app sem vínculo com um professor (segue dependendo da consulta no SQL Editor que o Lucas ficou de rodar); `accept_invite` que falha continua calado (ver "Polish do fluxo do aluno novo");
tempo limite nas chamadas (conexão lenta); `markNotificationRead` em `PerfilLutador.tsx` sem `.catch` (rejeição não tratada no console se a chamada falhar).

### Endurecimento (`harden`) da conexão lenta (2026-09-30) — sem migration nova

Um passo na `dev`, testado pelo Lucas (com "Slow 3G"/offline no Chrome). Fecha o item "conexão lenta" que ficou aberto nas duas seções anteriores de `harden`.

**Problema:** as chamadas ao Supabase não tinham tempo limite. Numa rede que trava SEM falhar, o esqueleto ficava na tela para sempre, sem erro nem explicação.

- **Tempo limite de 25s em toda chamada** (`TEMPO_LIMITE_MS`, `fetchComTempoLimite` em `src/integrations/supabase/client.ts`, passado como `global.fetch` do `createClient`; vale também para o login). Respeita o cancelamento de quem chamou. Ao estourar,
  aborta com `DOMException("conexao_lenta", "TimeoutError")`. **Não passar `fetch` próprio em chamadas novas sem manter o tempo limite.**
- `mensagemDeErro` (`src/lib/erros.ts`) separa "lenta" de "sem internet": `TimeoutError`/`conexao_lenta` → "A conexão está lenta e a resposta não chegou. Tente de novo." (a checagem de `navigator.onLine` falso continua vindo primeiro). Teste novo em `erros.test.ts`.
- **`FaixaConexaoLenta`** (`src/components/FaixaConexaoLenta.tsx`, montada em `App.tsx` ao lado da `FaixaSemInternet`): cartão no rodapé, acima da barra de baixo, "Está demorando mais que o normal. Confira sua conexão; se não carregar, tente de novo."
  quando `useIsFetching() > 0` por mais de 8s; some sozinho. Textos meus, aprovados. Na galeria: "Conexão lenta".
- Sequência que a pessoa vê numa rede ruim: 8s → aviso "demorando"; 25s → a chamada falha (com uma nova tentativa da consulta: `retry: 1`) → `ErrorState` com "Tentar novamente". Nunca mais esqueleto infinito.

**Efeito colateral aceito:** a atualização automática do contador de pendências do professor (a cada 60s) também conta como consulta em andamento; se o servidor demorar mais de 8s nela, o aviso pode aparecer sem a pessoa ter feito nada.

**Não conferido:** o estouro dos 25s em aparelho real com rede travada de verdade (só simulado com o throttling do Chrome); a posição do aviso em telas sem barra de baixo (Login e afins: fica um pouco alto, aceito).

**Não feito (registrado, não pedido):** listas com centenas de itens (Alunos, Aulas, Agenda) não foram testadas para lentidão; tempo limite diferente por tipo de chamada (hoje 25s para tudo); botão "Cancelar" no aviso de demora.

### Endurecimento (`harden`) das listas grandes (2026-09-30) — sem migration nova

Um passo na `dev`, testado pelo Lucas (com poucos alunos: o teste dele foi de "nada quebrou"; os limites abaixo NÃO foram exercitados contra o servidor real). Fecha o último item aberto das seções de `harden` anteriores.

**Medido:** a lista de Alunos com **1.500 alunos** na galeria desenhou os 1.500 cartões em ~85 ms (22 mil elementos no DOM). Sem paginação por enquanto; a busca dessa tela filtra em memória.

**Dois problemas reais achados por leitura do código:**
1. **`.in("coluna", ids)` vai NA URL.** Cada uuid tem ~37 caracteres; com algumas centenas de alunos o endereço passa do limite do servidor (~8 KB, valor típico, **não medido** contra o Supabase de vocês) e a consulta falha inteira.
   Afetava nomes (`profileNames`), pacotes e saldos (Alunos, Alunos em risco, Pedidos) e dados físicos (Perfil dos alunos).
2. **O servidor corta em 1000 linhas por consulta, sem avisar.** "Alunos em risco" busca 120 dias de aulas de TODOS os alunos; passava de 1000 linhas com uma turma média e as mais antigas sumiam em silêncio (escondendo faltas seguidas).

**Correção (`src/integrations/backend/api.ts`, com `lotes.test.ts`):**
- `emLotes(ids, buscar)`: fatia em lotes de `LOTE_IN = 100`, roda os lotes em paralelo e devolve o mesmo formato `{ data, error }` (o primeiro erro) — os chamadores não mudaram de forma. **Toda lista de ids que cresce com o número de alunos/pacotes usa `emLotes`; não escrever `.in("student_id", ids)` direto.**
  Ficaram como estavam, de propósito, as listas curtas por natureza (ids de uma página de 30 aulas, modelos de pacote, ids de antecessores da página).
- `todasAsPaginas(pedir)`: pede `.range()` de 1000 em 1000 até a página vir incompleta. Usada só nas aulas de "Alunos em risco" (dentro de cada lote de alunos; a ordem por aluno se mantém porque cada aluno está em um lote só).
- **Busca por nome na tela Aulas** (`getAdminBookingHistoryPage`): a consulta é UMA, ordenada e paginada, então não dá para fatiar. Se o nome casar com **mais de 100 alunos**, lança `BUSCA_AMPLA_DEMAIS` ("Muitos alunos com esse nome. Digite mais letras para refinar a busca."),
  mostrada no `ErrorState` de `Historico.tsx` (só esse texto; as outras falhas seguem no texto padrão). Solução completa (filtrar por nome no servidor, via embed `students!inner(profiles!inner(name))` ou RPC) não foi feita: exigiria conferir as FKs no banco.

**Não conferido:** o comportamento real acima de ~200 alunos (o professor hoje tem poucos alunos); o limite exato de URL do servidor; o corte de 1000 linhas com dados reais.

**Não feito (registrado, não pedido):** paginar/virtualizar a lista de Alunos (só vale acima de alguns milhares); Agenda com centenas de aulas no mesmo dia (mostra uma por hora, já limitada); `getAdminStudents` e afins ainda baixam TODOS os alunos de uma vez.

### Estado final do projeto (RECORRENCIA, Etapas 1-7) — 2026-09-09

Escrito pra uma sessão nova retomar sem precisar do usuário explicar de novo. Se você é essa
sessão: leia isto primeiro, depois use o resto do arquivo (acima) como referência detalhada por
decisão — não repita trabalho já fechado.

**Pronto e verificado (Etapas 1 a 7, migrations `0008` a `0022`):**

- **Etapa 1-2** — ledger de créditos (`credit_transactions`), `booking_status` ganha
  `'rescheduled'`, tabela `aluno_recorrencia` (dias fixos por aluno), colunas de recorrência em
  `packages`/`bookings`, `_create_package` extraído com defesa em duas camadas.
- **Etapa 3** — `calcular_saldo_pacote(p_pacote_id)`, view de leitura, 8 casos de teste
  (`verify_calcular_saldo_pacote.sql`).
- **Etapa 4-5** — `gerar_pacote_recorrencia` (RPC que materializa `packages`+`bookings` a partir
  dos dias fixos ativos), tela `AlunoRecorrencia.tsx` (dias fixos + gerar pacote + seletor de data
  de início), duas camadas contra overbooking com AUTOSSERVICO, pacote finished não ressuscita
  sozinho, regeneração cancela o pacote anterior em vez de duplicar (`cancelado_por='regeneracao'`,
  aulas descartadas somem das listas do aluno/professor, frequência não conta essas linhas).
- **Etapa 6** — `reagendar_aula`/`cancelar_aula` como RPCs próprias (só professor), status
  `'rescheduled'` com vínculo pra aula nova, `undo_lesson_action` com ramo de recorrência e
  Camada 2 checando overlap do próprio aluno, `useLessonActions` unificado entre Agenda e detalhe
  da aula (mesma lógica nas duas superfícies).
- **Etapa 7** — flag `profiles.modo_agendamento` (`'autosservico'`/`'recorrencia'`, nullable,
  default efetivo via `coalesce` em `modo_agendamento_efetivo()`, nunca por `default` de coluna);
  navegação gateada em `student/Agendar.tsx`, `student/Pacotes.tsx`, `StudentBottomNav`,
  `student/Home.tsx` (CTA principal), com bloqueio por AÇÃO (não por TELA) em
  `admin/AlunoRecorrencia.tsx` — a tela de gerenciar dias fixos fica sempre acessível, só "Gerar
  pacote" é desabilitado fora de `'recorrencia'`. Verificado por script (`verify_modo_agendamento.sql`,
  9/9 `OK`) E pela aplicação de verdade nos dois lados (aluno/professor), nos dois sentidos
  (ligar/desligar a flag) — ver seção acima.
- Todas as 15 migrations (`0008`-`0022`) aplicadas no banco real e confirmadas idempotentes
  (reaplicação sem erro e sem efeito colateral) — inclusive a `0022`, corrigida depois de uma
  reaplicação real ter falhado (ver seção "0022 não era idempotente" acima).
- **Excluir dia fixo de recorrência** (`0023_excluir_aluno_recorrencia.sql`, 2026-09-09) — ver
  seção própria acima. `tsc`/`vitest`/`vite build` verificados; **aplicada e testada na
  aplicação, confirmado pelo usuário.**

**Dívida conhecida, registrada, não bloqueia nada (detalhe completo em "Pontos ainda em aberto"
acima — não duplicar aqui, só apontar):**

- `availability_slots.is_active` nunca volta a `true` depois que uma aula que ocupava o slot deixa
  de existir (cancelamento/recusa/remarcação/descarte por regeneração) — vazamento silencioso e
  PRÉ-EXISTENTE, sem relação com RECORRENCIA, precisa de decisão de design antes de corrigir
  (separar "despublicado" de "ocupado" são dois conceitos hoje colapsados na mesma coluna).
- `undo_lesson_action` só tem um ponto de entrada, o toast de 9 segundos após concluir/marcar
  falta — sem UI permanente pra desfazer depois disso, mesmo a RPC continuando válida.
- Lista de dias fixos em `AlunoRecorrencia.tsx` — excluir uma recorrência nunca usada já é
  possível (`0023`, 2026-09-09); falta só o agrupamento/ordenação (ativos primeiro, por exemplo) —
  sub-pendência de UX ainda aberta, não bloqueia nada.
- "Mudança de recorrência" sem decisão — hoje editar dias fixos nunca retroage sobre pacote já
  gerado, só o próximo a ser gerado lê o conjunto atual; não há UI de "editar" uma linha existente,
  só ativar/desativar/criar.
- Feriados não são tratados na geração de pacote (gera todas as ocorrências do dia da semana, sem
  pular nem sinalizar) — sem tabela de feriados no banco hoje.
- ~~**Limpeza de dados de teste antes de produção**~~ — FECHADO e EXECUTADO (2026-09-09, ver seção
  acima): LK ficou como estava, `32d4c001` e todo o resto do aluno de teste `b12decb8` foram
  removidos via `supabase/limpeza_aluno_teste_b12decb8.sql`, confirmado pelo usuário. Nada
  pendente aqui.

**Fora do escopo — Etapa 8, NÃO iniciada (não implementar sem sinal explícito do usuário):**

`aviso_ausencia` (ou nome equivalente a decidir) — mencionado no roteiro original da feature como
a etapa seguinte à flag `modo_agendamento`, sem nenhum detalhe de requisito, migration, RPC ou tela
ainda discutido nesta conversa. Uma sessão nova não deve inferir escopo desta etapa a partir do
nome sozinho — o primeiro passo, quando for a hora, é o mesmo desta feature inteira: levantar
requisito com o usuário, propor decisões de design ambíguas registrando alternativas e
recomendação, e só depois desenhar migration.

**Como este projeto trabalha (pra uma sessão nova manter a disciplina, não só o código):** nenhuma
migration destrutiva; toda migration idempotente (`if not exists`/`drop ... if exists` + `add`
nomeado); toda alegação sobre o banco real vem de um script que o usuário roda e cola o resultado
de volta (nunca assumida); toda decisão de design que resolve ambiguidade do spec é registrada
aqui com a alternativa rejeitada e o motivo, antes de implementar; "não decida sozinho" vale pra
qualquer coisa estrutural ou de segurança — perguntar tem custo baixo, decidir errado sozinho não.
