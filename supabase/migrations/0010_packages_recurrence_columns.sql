-- Etapa 2 / RECORRENCIA — duas colunas novas em `packages` (CLAUDE.md, decisão 5): `pacote` é a
-- própria `packages` existente, não uma tabela nova. Ambas nullable, aditivas — só preenchidas
-- quando o pacote vem de RECORRENCIA; pacotes comprados/admin_grant/trial continuam sem elas.

alter table public.packages
  add column if not exists recorrencia_id uuid references public.aluno_recorrencia(id),
  add column if not exists falta_consome_credito boolean;

-- `origin` ganha um quarto valor. É um CHECK (text), não um enum nativo — diferente de
-- booking_status, dá pra estender numa única migration, sem a limitação de transação do
-- ALTER TYPE (decisão 5). Localiza o CHECK atual pelo attnum da coluna em vez de assumir o nome
-- que o Postgres auto-gerou pra ele em 0001 (nunca foi nomeado explicitamente ali).
do $$
declare
  v_conname text;
  v_attnum smallint;
begin
  select attnum into v_attnum
  from pg_attribute
  where attrelid = 'public.packages'::regclass and attname = 'origin';

  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.packages'::regclass
    and contype = 'c'
    and v_attnum = any(conkey)
  limit 1;

  if v_conname is not null then
    execute format('alter table public.packages drop constraint %I', v_conname);
  end if;
end $$;

alter table public.packages
  add constraint packages_origin_check check (origin in ('trial', 'purchase', 'admin_grant', 'recurrence'));
