-- Diagnóstico SOMENTE LEITURA para a exclusion constraint proposta em "is_active — Opção B"
-- (CLAUDE.md, "Pontos ainda em aberto"). NÃO escreve, NÃO altera nada — é só SELECT.
--
-- Por quê: `EXCLUDE USING gist (admin_id WITH =, tsrange(start_time, end_time) WITH &&)
-- WHERE (status in ('scheduled','pending_confirmation'))` só consegue ser criada se NENHUMA
-- linha violar o invariante hoje. Se já existir alguma sobreposição na base real, a constraint
-- falha ao criar — melhor descobrir isso agora, com uma consulta, do que na hora do CREATE.
--
-- Uma única consulta (o SQL Editor do Supabase só mostra o resultado da ÚLTIMA instrução) —
-- tudo sai numa tabela só (secao, linha).
--
-- Dois blocos:
--   RESUMO — quantos pares de bookings do mesmo professor, ambos scheduled/pending_confirmation,
--     têm intervalos de tempo que se sobrepõem, e de quantos professores diferentes isso vem.
--   AMOSTRA — até 50 pares concretos (ids, horários, status) pra inspecionar de perto. Se o
--     RESUMO der zero, a AMOSTRA sai vazia — não é erro, é a constraint já podendo ser criada.

with overlaps as (
  select
    b1.admin_id,
    b1.id as booking_1,
    b1.start_time as start_1,
    b1.end_time as end_1,
    b1.status as status_1,
    b1.slot_id as slot_id_1,
    b2.id as booking_2,
    b2.start_time as start_2,
    b2.end_time as end_2,
    b2.status as status_2,
    b2.slot_id as slot_id_2
  from public.bookings b1
  join public.bookings b2
    on b1.admin_id = b2.admin_id
   and b1.id < b2.id
   and b1.status in ('scheduled', 'pending_confirmation')
   and b2.status in ('scheduled', 'pending_confirmation')
   and b1.start_time < b2.end_time
   and b1.end_time > b2.start_time
)

select 0 as ord, 0 as sub, 'RESUMO' as secao,
  format('pares sobrepostos: %s | professores distintos afetados: %s',
    (select count(*) from overlaps),
    (select count(distinct admin_id) from overlaps)
  ) as linha

union all

select 1, row_number() over (order by admin_id, start_1), 'AMOSTRA (até 50 pares)',
  format('professor %s | booking %s (%s–%s, %s, slot=%s) x booking %s (%s–%s, %s, slot=%s)',
    admin_id,
    booking_1, start_1, end_1, status_1, coalesce(slot_id_1::text, 'null'),
    booking_2, start_2, end_2, status_2, coalesce(slot_id_2::text, 'null')
  )
from (select * from overlaps order by admin_id, start_1 limit 50) sample_overlaps

order by ord, sub;
