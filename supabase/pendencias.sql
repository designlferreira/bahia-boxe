-- Uma consulta só, mesma ideia do introspect.sql: o SQL Editor mostra apenas o último resultado.
--
-- O introspect cortou os corpos das funções em 900 caracteres, e duas delas ficaram sem a parte
-- que interessa: `apply_booking_package_consumption` (o trigger que consome/devolve crédito do
-- pacote) e `schedule_booking` (que decide com que status a aula nasce). Sem esses trechos não dá
-- para saber se reverter uma aula concluída devolve o crédito, nem se o agendamento do aluno cai
-- em 'scheduled' ou 'pending_confirmation'.

select p.proname, pg_get_functiondef(p.oid) as definicao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('apply_booking_package_consumption', 'schedule_booking', 'complete_booking', 'mark_no_show')
order by p.proname;
