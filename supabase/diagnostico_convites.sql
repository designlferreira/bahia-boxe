-- Rode isto no SQL Editor do Supabase e cole o resultado de volta no chat.
-- É só leitura: não cria, não altera e não apaga nada. NÃO mostra nenhum token de convite.
-- Objetivo: descobrir como os convites existem hoje no banco (tabela, colunas, regras e funções)
-- antes de desenhar a criação de convite dentro do app.
--
-- UMA única consulta de propósito (o SQL Editor só mostra o resultado da ÚLTIMA instrução).

with tabelas as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname ilike '%invit%'
),
cols as (
  select 1 as ord, 'COLUNAS' as secao,
         c.table_name || '.' || c.column_name || ' | ' || c.data_type || ' | '
           || case when c.is_nullable = 'YES' then 'null' else 'not null' end
           || ' | default: ' || coalesce(c.column_default, '-') as linha,
         c.table_name || '.' || lpad(c.ordinal_position::text, 4, '0') as sub
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name in (select relname from tabelas)
),
rls as (
  select 2, 'RLS LIGADA?', t.relname || ' | rls: ' || t.relrowsecurity::text, t.relname from tabelas t
),
policies as (
  select 3, 'POLICIES',
         p.tablename || ' | ' || p.policyname || ' | ' || p.cmd || ' | roles: ' || p.roles::text
           || ' | using: ' || coalesce(p.qual, '-') || ' | check: ' || coalesce(p.with_check, '-'),
         p.tablename || p.policyname
  from pg_policies p where p.schemaname = 'public' and p.tablename in (select relname from tabelas)
),
constraints as (
  select 4, 'CONSTRAINTS',
         t.relname || ' | ' || con.conname || ' | ' || pg_get_constraintdef(con.oid),
         t.relname || con.conname
  from pg_constraint con join tabelas t on t.oid = con.conrelid
),
indices as (
  select 5, 'INDICES', i.tablename || ' | ' || i.indexdef, i.tablename || i.indexname
  from pg_indexes i where i.schemaname = 'public' and i.tablename in (select relname from tabelas)
),
triggers as (
  select 6, 'TRIGGERS', t.relname || ' | ' || pg_get_triggerdef(g.oid), t.relname || g.tgname
  from pg_trigger g join tabelas t on t.oid = g.tgrelid where not g.tgisinternal
),
funcoes as (
  select 7, 'FUNCOES (corpo aplicado)',
         pg_get_functiondef(p.oid),
         p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname ilike '%invite%'
),
permissoes as (
  select 8, 'EXECUTE (quem pode chamar)',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') | anon: '
           || has_function_privilege('anon', p.oid, 'execute')::text
           || ' | authenticated: ' || has_function_privilege('authenticated', p.oid, 'execute')::text,
         p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname ilike '%invite%'
),
contagem as (
  -- Só números, nunca o token. Assume que existe uma tabela com "invit" no nome; se não existir, a seção some.
  select 9, 'LINHAS (total)', t.relname || ' | ' || (xpath('/row/c/text()',
           query_to_xml(format('select count(*) as c from public.%I', t.relname), false, true, '')))[1]::text,
         t.relname
  from tabelas t
),
resumo as (
  select 10, 'TABELAS ACHADAS', coalesce(string_agg(relname, ', '), '(nenhuma tabela com "invit" no nome)'), 'x' from tabelas
)
select secao, linha from (
  select * from cols union all select * from rls union all select * from policies
  union all select * from constraints union all select * from indices union all select * from triggers
  union all select * from funcoes union all select * from permissoes union all select * from contagem
  union all select * from resumo
) u(ord, secao, linha, sub)
order by ord, sub;
