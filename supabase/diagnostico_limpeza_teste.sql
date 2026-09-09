-- Diagnóstico SOMENTE LEITURA para embasar a limpeza de dados de teste antes de produção
-- (CLAUDE.md, seção "Limpeza de dados de teste antes de produção"). NÃO escreve, NÃO apaga,
-- NÃO altera nada — é só SELECT. Rode inteiro e cole o resultado de volta no chat, mesmo padrão
-- de introspect.sql.
--
-- Três blocos, um por categoria de dado de teste levantada pelo usuário, mais um bloco 0 que
-- confirma (ou corrige) a suposição usada na proposta: de todas as FKs relevantes às três
-- categorias, só `credit_transactions.booking_id` e `bookings.replacement_for_booking_id` não têm
-- `on delete` (ou seja, são RESTRICT/NO ACTION — um DELETE que deixasse alguma linha órfã falha
-- em vez de apagar em cascata ou silenciar a referência). Isso é reconstrução de memória de uma
-- sessão anterior (introspect.sql já rodado, resultado não está mais à mão nesta sessão) — por
-- isso o bloco 0 reconfirma antes de qualquer plano de DELETE se apoiar nisso.

-- =============================================================================================
-- 0) Comportamento real de ON DELETE nas FKs que qualquer limpeza das categorias A/B/C precisa
--    respeitar. "a"=NO ACTION, "r"=RESTRICT (as duas bloqueiam o DELETE se houver referência viva),
--    "c"=CASCADE, "n"=SET NULL, "d"=SET DEFAULT.
-- =============================================================================================
select
  con.conrelid::regclass::text as tabela,
  a.attname as coluna,
  con.confrelid::regclass::text as referencia,
  case con.confdeltype
    when 'a' then 'NO ACTION (bloqueia)'
    when 'r' then 'RESTRICT (bloqueia)'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end as on_delete
from pg_constraint con
join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
where con.contype = 'f'
  and con.conrelid::regclass::text in (
    'public.bookings', 'public.packages', 'public.purchase_requests',
    'public.credit_transactions', 'public.aluno_recorrencia'
  )
order by tabela, coluna;

-- =============================================================================================
-- A) Aluno real LK (4cd0e555-728b-47ba-ba3c-073b54d28af3) — as 24 aulas cancelled/regeneracao.
--    Pergunta: alguma delas tem credit_transaction ou é apontada por replacement_for_booking_id
--    de outra aula? Se as duas colunas derem 0 em TODAS as linhas, apagar (se decidido) não
--    esbarra nas duas FKs sem on delete — mas a recomendação da proposta é deixar como está
--    independente disso (ver seção no CLAUDE.md).
-- =============================================================================================
select
  b.id, b.status, b.cancelado_por, b.start_time, b.package_id,
  (select count(*) from public.credit_transactions ct where ct.booking_id = b.id) as credit_transactions_apontando,
  (select count(*) from public.bookings b2 where b2.replacement_for_booking_id = b.id) as referenciada_como_original_de
from public.bookings b
where b.student_id = '4cd0e555-728b-47ba-ba3c-073b54d28af3'
  and b.status = 'cancelled'
  and b.cancelado_por = 'regeneracao'
order by b.start_time;

-- =============================================================================================
-- B) A aula movida manualmente no tempo (id começa com 32d4c001) + qualquer outra "scheduled" já
--    no passado, candidata a ter sofrido o mesmo tipo de manipulação de teste (não é prova
--    definitiva — uma aula real também pode ficar `scheduled` no passado se o professor ainda não
--    abriu pra concluir; usar started_time/updated_at pra julgar caso a caso).
-- =============================================================================================
select
  b.id, b.status, b.cancelado_por, b.start_time, b.created_at, b.updated_at,
  b.student_id, b.package_id, b.replacement_for_booking_id,
  (select count(*) from public.credit_transactions ct where ct.booking_id = b.id) as credit_transactions_apontando,
  (select count(*) from public.bookings b2 where b2.replacement_for_booking_id = b.id) as referenciada_como_original_de
from public.bookings b
where b.id::text like '32d4c001%'
   or (b.status = 'scheduled' and b.start_time < now())
order by b.start_time;

-- =============================================================================================
-- C) Aluno de teste (students.id = b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8) — tudo que acumulou.
-- =============================================================================================
select 'students' as tabela, count(*) as linhas
  from public.students where id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'packages', count(*) from public.packages where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'bookings', count(*) from public.bookings where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'aluno_recorrencia', count(*) from public.aluno_recorrencia where aluno_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'credit_transactions', count(*) from public.credit_transactions where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'purchase_requests', count(*) from public.purchase_requests where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';

-- referência cruzada: alguma aula de OUTRO aluno (fora do b12decb8) aponta pra uma aula do aluno
-- de teste via replacement_for_booking_id? Não deveria existir (recorrência é isolada por aluno),
-- mas isso decide se apagar as bookings do aluno de teste é seguro sozinho ou se precisa mexer em
-- outra linha primeiro.
select b_outro.id as booking_de_outro_aluno, b_outro.student_id, b_outro.replacement_for_booking_id
from public.bookings b_outro
join public.bookings b_teste on b_teste.id = b_outro.replacement_for_booking_id
where b_teste.student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
  and b_outro.student_id <> 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
