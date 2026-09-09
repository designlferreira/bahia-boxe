-- Diagnóstico SOMENTE LEITURA para embasar a limpeza de dados de teste antes de produção
-- (CLAUDE.md, seção "Limpeza de dados de teste antes de produção"). NÃO escreve, NÃO apaga,
-- NÃO altera nada — é só SELECT.
--
-- v3 (2026-09-09) — duas correções sobre a v2, achadas pelo usuário/nesta revisão:
--
-- 1) O bloco 0 (ON DELETE das FKs) não aparecia na saída, sem erro nenhum. Causa: o filtro
--    comparava `con.conrelid::regclass::text` contra strings QUALIFICADAS ('public.bookings').
--    O cast `regclass::text` no Postgres devolve o nome MAIS CURTO que resolve sem ambiguidade
--    dado o `search_path` da sessão — como `public` está no search_path por padrão, o valor real
--    era `'bookings'` (sem prefixo), então a comparação nunca batia e a CTE devolvia 0 linhas
--    silenciosamente (união vazia não é erro). Corrigido filtrando por `pg_namespace.nspname` +
--    `pg_class.relname` direto (mesmo padrão do `introspect.sql`, que nunca teve esse problema por
--    não comparar contra nome qualificado).
-- 2) Estendido com um bloco E, pra responder duas perguntas que só apareceram depois de ver o
--    resultado da v2: se `b12decb8` tem profile/login próprio (pra saber se a remoção precisa do
--    painel Authentication), e se o `purchase_request` dele está pendente (se está, ele aparece
--    HOJE como pedido real esperando decisão do professor, em produção ou não).
--
-- IMPORTANTE: continua sendo UMA única consulta — o SQL Editor do Supabase só mostra o resultado
-- da ÚLTIMA instrução de um script. Tudo sai numa tabela só (secao, linha).
--
-- Se uma seção não tiver nenhuma linha no resultado, é porque o filtro deu zero — normal pros
-- blocos A/B se não houver nada a reportar, não é sinal de que a consulta quebrou (foi exatamente
-- essa ambiguidade que esconderia o bug do bloco 0 se ele voltasse a dar 0 linhas por outro
-- motivo — por isso ele agora traz uma contagem de conferência, ver comentário no bloco).
--
-- Cinco blocos:
--   0) ON DELETE das FKs relevantes às categorias A/B/C/E — reconfirma a suposição de que só
--      `credit_transactions.booking_id`, `bookings.replacement_for_booking_id` e (achado nesta
--      versão) `credit_transactions.reverses_transaction_id` não têm `on delete`, mais o que
--      `students.profile_id` e `profiles.id` fazem (relevante pro bloco E).
--   A) aluno real LK (4cd0e555-...) — as 24 aulas cancelled/regeneracao.
--   B) a aula 32d4c001... movida no tempo por SQL + qualquer outra "scheduled" já no passado.
--   C) aluno de teste b12decb8-... — tudo que acumulou (contagens) + referência cruzada externa.
--   E) aluno de teste b12decb8-... — checagens extra pra decidir a remoção: profile/login
--      vinculado, status do purchase_request, linhas em tabelas de Perfil de Boxe (cascade
--      automático, só informativo), e se algum OUTRO crédito reverte um dos 2 credit_transactions
--      deste aluno (reverses_transaction_id também não tem on delete).
--
-- Nomes de coluna conferidos contra as migrations antes de escrever isto (não assumidos): em
-- `bookings` o vínculo com pacote é `pacote_id` (português, decisão da 0011) — `package_id` só
-- existe em `credit_transactions` (inglês, base do schema, 0001). `bookings` não tem `updated_at`
-- confirmado em nenhuma migration nem no código, por isso não entra na consulta.

with fk_on_delete as (
  select
    1 as ord,
    '0_ON_DELETE' as secao,
    rel.relname || '.' || a.attname || ' -> ' || con.confrelid::regclass::text
      || ' | on_delete=' || case con.confdeltype
           when 'a' then 'NO ACTION (bloqueia DELETE se houver referência)'
           when 'r' then 'RESTRICT (bloqueia DELETE se houver referência)'
           when 'c' then 'CASCADE'
           when 'n' then 'SET NULL'
           when 'd' then 'SET DEFAULT'
         end as linha,
    rel.relname || '.' || a.attname as sub
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  join lateral unnest(con.conkey) with ordinality as k(attnum, k_ord) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.contype = 'f'
    and ns.nspname = 'public'
    and rel.relname in (
      'bookings', 'packages', 'purchase_requests', 'credit_transactions',
      'aluno_recorrencia', 'students', 'profiles'
    )
),

-- Contagem de conferência: se isto der 0, o bloco 0 acima está vazio por outro motivo (schema
-- mudou, nomes de tabela mudaram) — não assumir "tudo CASCADE" só por ausência de linha.
fk_on_delete_contagem as (
  select 1, '0_ON_DELETE', '(conferência: ' || count(*)::text || ' FKs encontradas no bloco acima — se vier 0, a consulta do bloco 0 tem um problema, não é o schema que não tem FK nenhuma)', '~zzz_contagem'
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where con.contype = 'f'
    and ns.nspname = 'public'
    and rel.relname in (
      'bookings', 'packages', 'purchase_requests', 'credit_transactions',
      'aluno_recorrencia', 'students', 'profiles'
    )
),

aluno_lk as (
  select
    2, 'A_ALUNO_LK_4cd0e555',
    b.id::text || ' | status=' || b.status || ' cancelado_por=' || coalesce(b.cancelado_por, '-')
      || ' start_time=' || b.start_time::text || ' pacote_id=' || coalesce(b.pacote_id::text, '-')
      || ' | credit_transactions_apontando=' ||
         (select count(*) from public.credit_transactions ct where ct.booking_id = b.id)::text
      || ' | referenciada_como_original_de=' ||
         (select count(*) from public.bookings b2 where b2.replacement_for_booking_id = b.id)::text,
    b.start_time::text
  from public.bookings b
  where b.student_id = '4cd0e555-728b-47ba-ba3c-073b54d28af3'
    and b.status = 'cancelled'
    and b.cancelado_por = 'regeneracao'
),

horario_artificial as (
  select
    3, 'B_HORARIO_ARTIFICIAL',
    b.id::text || ' | status=' || b.status || ' cancelado_por=' || coalesce(b.cancelado_por, '-')
      || ' start_time=' || b.start_time::text || ' created_at=' || b.created_at::text
      || ' student_id=' || b.student_id::text || ' pacote_id=' || coalesce(b.pacote_id::text, '-')
      || ' replacement_for_booking_id=' || coalesce(b.replacement_for_booking_id::text, '-')
      || ' is_replacement=' || coalesce(b.is_replacement::text, '-')
      || ' | credit_transactions_apontando=' ||
         (select count(*) from public.credit_transactions ct where ct.booking_id = b.id)::text
      || ' | referenciada_como_original_de=' ||
         (select count(*) from public.bookings b2 where b2.replacement_for_booking_id = b.id)::text,
    b.start_time::text
  from public.bookings b
  where b.id::text like '32d4c001%'
     or (b.status = 'scheduled' and b.start_time < now())
),

aluno_teste_contagens as (
  select 4, 'C_ALUNO_TESTE_b12decb8', tabela || ' = ' || linhas::text, tabela
  from (
    select 'students' as tabela, count(*) as linhas
      from public.students where id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    union all
    select 'packages', count(*) from public.packages
      where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    union all
    select 'bookings', count(*) from public.bookings
      where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    union all
    select 'aluno_recorrencia', count(*) from public.aluno_recorrencia
      where aluno_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    union all
    select 'credit_transactions', count(*) from public.credit_transactions
      where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    union all
    select 'purchase_requests', count(*) from public.purchase_requests
      where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
  ) contagens
),

-- alguma aula de OUTRO aluno aponta pra uma aula do aluno de teste via replacement_for_booking_id?
-- Não deveria existir (recorrência é isolada por aluno) — decide se apagar as bookings do aluno de
-- teste é seguro sozinho ou se precisa mexer em outra linha (de outro aluno!) primeiro.
-- string_agg sem GROUP BY sempre devolve uma linha (NULL se não houver match), daí o coalesce.
referencia_cruzada as (
  select
    5, 'C_REFERENCIA_CRUZADA',
    coalesce(
      string_agg(
        'booking ' || b_outro.id::text || ' do aluno ' || b_outro.student_id::text ||
        ' referencia (replacement_for_booking_id) uma aula do aluno de teste',
        '; '
      ),
      'nenhuma referência cruzada de outro aluno encontrada — OK'
    ),
    '1'
  from public.bookings b_outro
  join public.bookings b_teste on b_teste.id = b_outro.replacement_for_booking_id
  where b_teste.student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    and b_outro.student_id <> 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
),

-- E) checagens extra pra decidir a remoção completa do aluno de teste.
profile_vinculado as (
  select
    6, 'E_PROFILE_E_LOGIN',
    'students.profile_id = ' || coalesce(s.profile_id::text, '(NULL — sem login vinculado, remoção é só SQL)') ||
    coalesce(
      ' | profiles: ' || p.id::text || ' role=' || p.role || ' name=' || coalesce(p.name, '-'),
      ' | AVISO: profile_id aponta pra uma linha que não existe mais em profiles'
    ),
    '1'
  from public.students s
  left join public.profiles p on p.id = s.profile_id
  where s.id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
),

purchase_request_status as (
  select
    7, 'E_PURCHASE_REQUEST_STATUS',
    coalesce(
      string_agg(
        pr.id::text || ' | status=' || pr.status || ' created_at=' || pr.created_at::text ||
        case when pr.status = 'pending'
          then ' | ATENÇÃO: pendente HOJE — aparece em /admin/solicitacoes esperando decisão real do professor, independente da limpeza'
          else ''
        end,
        '; '
      ),
      '(nenhum purchase_request encontrado — inconsistente com a contagem do bloco C, conferir)'
    ),
    '1'
  from public.purchase_requests pr
  where pr.student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
),

perfil_boxe_contagens as (
  select 8, 'E_PERFIL_DE_BOXE_cascade_automatico', tabela || ' = ' || linhas::text, tabela
  from (
    select 'student_profiles' as tabela, count(*) as linhas
      from public.student_profiles where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    union all
    select 'boxing_profile_assessments', count(*)
      from public.boxing_profile_assessments where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
  ) t
),

-- os 2 credit_transactions deste aluno são revertidos por outra transação (reverses_transaction_id
-- aponta pra eles)? Essa FK também não tem on delete (bloco 0 confirma) — se dermos algo aqui,
-- apagar os 2 direto pode falhar ou (pior) apagar histórico de undo de OUTRO registro.
reversao_cruzada as (
  select
    9, 'E_REVERSAO_CRUZADA',
    coalesce(
      string_agg(
        'credit_transaction ' || ct_outra.id::text || ' (reason=' || ct_outra.reason ||
        ') reverte uma transação do aluno de teste',
        '; '
      ),
      'nenhuma reversão cruzada encontrada — OK'
    ),
    '1'
  from public.credit_transactions ct_outra
  join public.credit_transactions ct_teste on ct_teste.id = ct_outra.reverses_transaction_id
  where ct_teste.student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
)

select secao, linha
from (
  select * from fk_on_delete
  union all select * from fk_on_delete_contagem
  union all select * from aluno_lk
  union all select * from horario_artificial
  union all select * from aluno_teste_contagens
  union all select * from referencia_cruzada
  union all select * from profile_vinculado
  union all select * from purchase_request_status
  union all select * from perfil_boxe_contagens
  union all select * from reversao_cruzada
) t(ord, secao, linha, sub)
order by ord, sub;
