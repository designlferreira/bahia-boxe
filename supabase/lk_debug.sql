-- Leitura pura, só pra aluna cujo nome contém "LK". Uma consulta só, mesmo padrão dos outros
-- arquivos. Antes de tentar corrigir o "0/6", preciso ver exatamente: quais pacotes ela tem (bar
-- status), o que está em credit_transactions pra cada um, e as aulas dela — em vez de adivinhar
-- qual pacote está ativo agora e se ele realmente deveria mostrar uso.

with student as (
  select s.id
  from public.students s
  join public.profiles p on p.id = s.profile_id
  where p.name ilike '%LK%'
  limit 1
),
pacotes as (
  select
    1 as ord, 'PACOTES' as secao,
    p.id || ' | status=' || p.status || ' | origin=' || p.origin || ' | kind=' || p.kind
      || ' | total=' || p.total_classes || ' | used=' || p.used_classes
      || ' | created_at=' || p.created_at as linha,
    p.created_at::text as sub
  from public.packages p, student
  where p.student_id = student.id
),
bookings as (
  select
    2, 'BOOKINGS',
    b.id || ' | status=' || b.status || ' | start_time=' || b.start_time
      || ' | is_replacement=' || b.is_replacement || ' | billing_kind=' || b.billing_kind,
    b.start_time::text
  from public.bookings b, student
  where b.student_id = student.id
),
ledger as (
  select
    3, 'LEDGER',
    ct.created_at || ' | delta=' || ct.delta || ' | reason=' || ct.reason
      || ' | package_id=' || coalesce(ct.package_id::text, '-')
      || ' | booking_id=' || coalesce(ct.booking_id::text, '-'),
    ct.created_at::text
  from public.credit_transactions ct, student
  where ct.student_id = student.id
)
select secao, linha
from (
  select * from pacotes
  union all select * from bookings
  union all select * from ledger
) t(ord, secao, linha, sub)
order by ord, sub;
