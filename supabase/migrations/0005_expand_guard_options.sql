-- Amplia `student_profiles.guard` para cobrir as guardas reais do boxe, não só a orientação de
-- base (ortodoxa/southpaw/alternada). Acrescenta os estilos de posicionamento de braço mais
-- reconhecidos: peek-a-boo, cruzada, philly shell (guarda de ombro) e guarda longa.
--
-- O nome da constraint de CHECK inline não foi fixado na 0004 (foi `check (...)` direto na coluna,
-- sem nome), então descobre o nome real em vez de assumir a convenção padrão do Postgres — mais
-- seguro que um DROP CONSTRAINT IF EXISTS com um nome chutado, que falharia silenciosamente se o
-- nome estivesse errado e deixaria a constraint antiga (mais restritiva) no lugar.

do $$
declare
  v_conname text;
begin
  select con.conname into v_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'student_profiles' and con.contype = 'c' and att.attname = 'guard';

  if v_conname is not null then
    execute format('alter table public.student_profiles drop constraint %I', v_conname);
  end if;
end $$;

alter table public.student_profiles
  add constraint student_profiles_guard_check
  check (guard in (
    'orthodox', 'southpaw', 'switch',
    'peekaboo', 'cross_arm', 'philly_shell', 'long_guard'
  ));
