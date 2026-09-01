-- Rode isto no SQL Editor do Supabase e cole o resultado de volta no chat.
-- É só leitura: não cria, não altera e não apaga nada.
--
-- IMPORTANTE: é UMA única consulta de propósito. O SQL Editor do Supabase mostra
-- apenas o resultado da ÚLTIMA instrução de um script — foi por isso que a versão
-- anterior deste arquivo (7 selects separados) devolveu só a contagem de linhas.
-- Aqui tudo sai numa tabela só, em duas colunas (secao, linha).
--
-- Dica: no resultado, use "Download CSV" e cole o arquivo; ou copie a grade inteira.

with cols as (
  select 1 as ord, 'COLUNAS' as secao,
         c.table_name || '.' || c.column_name || ' | ' || c.data_type
           || ' | ' || case when c.is_nullable = 'YES' then 'null' else 'not null' end
           || ' | default: ' || coalesce(c.column_default, '-') as linha,
         c.table_name || '.' || lpad(c.ordinal_position::text, 4, '0') as sub
  from information_schema.columns c
  where c.table_schema = 'public'
),
enums as (
  select 2, 'ENUMS',
         t.typname || ' = ' || string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder),
         t.typname
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  group by t.typname
),
constraints as (
  select 3, 'CONSTRAINTS',
         c.conrelid::regclass::text || ' | ' || pg_get_constraintdef(c.oid),
         c.conrelid::regclass::text || '.' || c.conname
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and c.contype in ('p', 'f', 'u', 'c')
),
views as (
  select 4, 'VIEWS',
         v.viewname || ' := ' || left(regexp_replace(v.definition, '\s+', ' ', 'g'), 1200),
         v.viewname
  from pg_views v
  where v.schemaname = 'public'
),
rotinas as (
  select 5, 'FUNCOES',
         p.proname || '(' || pg_get_function_arguments(p.oid) || ') -> '
           || pg_get_function_result(p.oid)
           || ' | ' || case when p.prosecdef then 'security definer' else 'invoker' end
           || ' | ' || left(regexp_replace(coalesce(p.prosrc, ''), '\s+', ' ', 'g'), 900),
         p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
rls as (
  select 6, 'RLS_ATIVO',
         c.relname || ' | ' || case when c.relrowsecurity then 'ON' else 'OFF' end,
         c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
policies as (
  select 7, 'POLICIES',
         p.tablename || ' | ' || p.policyname || ' | ' || p.cmd
           || ' | roles: ' || array_to_string(p.roles, ',')
           || ' | using: ' || coalesce(regexp_replace(p.qual, '\s+', ' ', 'g'), '-')
           || ' | check: ' || coalesce(regexp_replace(p.with_check, '\s+', ' ', 'g'), '-'),
         p.tablename || '.' || p.policyname
  from pg_policies p
  where p.schemaname = 'public'
),
triggers as (
  select 8, 'TRIGGERS',
         n.nspname || '.' || c.relname || ' | ' || pg_get_triggerdef(t.oid),
         n.nspname || '.' || c.relname || '.' || t.tgname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname in ('public', 'auth')
),
amostra_slots as (
  select 9, 'AMOSTRA_availability_slots', to_jsonb(s)::text, '1'
  from (select * from public.availability_slots order by 1 limit 3) s
)
select secao, linha
from (
  select * from cols
  union all select * from enums
  union all select * from constraints
  union all select * from views
  union all select * from rotinas
  union all select * from rls
  union all select * from policies
  union all select * from triggers
  union all select * from amostra_slots
) t(ord, secao, linha, sub)
order by ord, sub;
