-- Leitura pura. Uma consulta só (mesmo padrão dos outros arquivos).
--
-- Por quê: `introspect.sql` original só listava constraints via `pg_constraint` (contype in
-- p/f/u/c). Um índice único criado direto com `CREATE UNIQUE INDEX ...` (sem
-- `ALTER TABLE ... ADD CONSTRAINT`) não aparece em `pg_constraint` — só em `pg_index`. Foi assim
-- que `ux_packages_one_active_per_student` passou batido: ele existia no banco desde antes, mas
-- nunca apareceu em nenhuma das minhas consultas anteriores.
--
-- Isso é potencialmente sério: se esse índice for `unique (student_id) where status = 'active'`,
-- ele proíbe, no nível do banco, exatamente o que a Etapa 4 (trial) foi desenhada pra fazer —
-- trial e pacote pago como duas linhas `active` simultâneas. Preciso ver a definição exata antes
-- de decidir como resolver (não vou adivinhar).
--
-- A segunda seção confere se a aluna "LK" tem alguma aula agendada no futuro — se tiver, os
-- números "8 aulas mas mostra 7" fazem sentido sozinhos: o card do aluno mostra "créditos
-- disponíveis" (que desconta reservas futuras), não o total bruto do pacote recém-atribuído.

with indices as (
  select 1 as ord, 'TODOS_OS_INDICES_UNICOS' as secao,
         t.relname || ' | ' || i.relname || ' | ' || pg_get_indexdef(i.oid) as linha,
         t.relname || '.' || i.relname as sub
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and x.indisunique
),
lk_bookings as (
  select 2, 'AULAS_FUTURAS_DE_LK',
         b.id || ' | status=' || b.status || ' | start_time=' || b.start_time,
         b.start_time::text
  from public.bookings b
  join public.students s on s.id = b.student_id
  join public.profiles p on p.id = s.profile_id
  where p.name ilike '%LK%' and b.start_time > now()
)
select secao, linha
from (
  select * from indices
  union all select * from lk_bookings
) t(ord, secao, linha, sub)
order by ord, sub;
