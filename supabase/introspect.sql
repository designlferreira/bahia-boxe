-- Rode isto no SQL Editor do Supabase e cole o resultado de volta no chat.
-- É só leitura: não cria, não altera e não apaga nada.
--
-- Por que: o banco deste projeto NÃO está vazio e não corresponde às migrations
-- deste repositório (ex.: `availability_slots` existe mas não tem a coluna `weekday`).
-- Antes de mexer em qualquer coisa, preciso enxergar o schema real.

-- 1) Tabelas e colunas do schema public
select
  table_name,
  ordinal_position as pos,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 2) Views existentes
select table_name
from information_schema.views
where table_schema = 'public'
order by table_name;

-- 3) Funções / RPCs
select routine_name, data_type as returns
from information_schema.routines
where routine_schema = 'public'
order by routine_name;

-- 4) Chaves estrangeiras (como as tabelas se ligam)
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as references_table,
  ccu.column_name as references_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by tc.table_name, kcu.column_name;

-- 5) Políticas de RLS
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 6) Triggers (inclui o on_auth_user_created, que já existe no seu banco)
select
  t.tgname as trigger_name,
  c.relname as table_name,
  n.nspname as schema_name,
  pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('public', 'auth')
order by n.nspname, c.relname, t.tgname;

-- 7) Quantidade de linhas por tabela (o banco tem dados reais?)
select 'profiles' as tabela, count(*) from public.profiles
union all select 'students', count(*) from public.students
union all select 'bookings', count(*) from public.bookings
union all select 'availability_slots', count(*) from public.availability_slots
union all select 'packages', count(*) from public.packages
union all select 'package_templates', count(*) from public.package_templates;
