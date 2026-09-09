-- Diagnóstico SOMENTE LEITURA para embasar a limpeza de dados de teste antes de produção
-- (CLAUDE.md, seção "Limpeza de dados de teste antes de produção"). NÃO escreve, NÃO apaga,
-- NÃO altera nada — é só SELECT.
--
-- IMPORTANTE: é UMA única consulta de propósito, mesmo motivo do introspect.sql — o SQL Editor
-- do Supabase mostra só o resultado da ÚLTIMA instrução de um script. A primeira versão deste
-- arquivo tinha 5 SELECTs separados; só o último (a referência cruzada do bloco C) apareceria.
-- Corrigido pra tudo sair numa tabela só (secao, linha), igual introspect.sql.
--
-- Se uma seção não aparecer nenhuma linha no resultado (além do próprio nome dela em nenhum
-- lugar), é porque o filtro deu zero — normal pros blocos A/B se não houver nada a reportar,
-- não é sinal de que a consulta quebrou.
--
-- Quatro blocos, um por categoria de dado de teste levantada pelo usuário, mais um bloco 0:
--   0) Comportamento real de ON DELETE nas FKs que qualquer limpeza das categorias A/B/C precisa
--      respeitar — reconfirma a suposição usada na proposta (só `credit_transactions.booking_id`
--      e `bookings.replacement_for_booking_id` sem `on delete`), porque essa caracterização vem
--      de um `introspect.sql` rodado numa sessão anterior cujo resultado não está mais disponível
--      nesta sessão.
--   A) aluno real LK (4cd0e555-...) — as 24 aulas cancelled/regeneracao.
--   B) a aula 32d4c001... movida no tempo por SQL + qualquer outra "scheduled" já no passado.
--   C) aluno de teste b12decb8-... — tudo que acumulou, e referência cruzada de outro aluno.
--
-- Nomes de coluna conferidos contra as migrations antes de escrever isto (não assumidos): em
-- `bookings` o vínculo com pacote é `pacote_id` (português, decisão da 0011) — `package_id` só
-- existe em `credit_transactions` (inglês, base do schema, 0001). `bookings` não tem `updated_at`
-- confirmado em nenhuma migration nem no código, por isso não entra na consulta.

with fk_on_delete as (
  select
    1 as ord,
    '0_ON_DELETE' as secao,
    con.conrelid::regclass::text || '.' || a.attname || ' -> ' || con.confrelid::regclass::text
      || ' | on_delete=' || case con.confdeltype
           when 'a' then 'NO ACTION (bloqueia DELETE se houver referência)'
           when 'r' then 'RESTRICT (bloqueia DELETE se houver referência)'
           when 'c' then 'CASCADE'
           when 'n' then 'SET NULL'
           when 'd' then 'SET DEFAULT'
         end as linha,
    con.conrelid::regclass::text || '.' || a.attname as sub
  from pg_constraint con
  join lateral unnest(con.conkey) with ordinality as k(attnum, k_ord) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.contype = 'f'
    and con.conrelid::regclass::text in (
      'public.bookings', 'public.packages', 'public.purchase_requests',
      'public.credit_transactions', 'public.aluno_recorrencia'
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
)

select secao, linha
from (
  select * from fk_on_delete
  union all select * from aluno_lk
  union all select * from horario_artificial
  union all select * from aluno_teste_contagens
  union all select * from referencia_cruzada
) t(ord, secao, linha, sub)
order by ord, sub;
