-- Etapa 2/5 da migration de "is_active — Opção B" (CLAUDE.md, "Pontos ainda em aberto").
--
-- A view `available_slots` (não tem migration própria neste repo — pré-existente, só conhecida
-- por introspecção de `pg_get_viewdef`; supabase/README.md documenta o comportamento atual) decide
-- "esse horário está livre?" comparando IGUALDADE EXATA de horário e olhando só `status =
-- 'scheduled'`. As duas coisas são bugs da mesma família do `is_active` que nunca reabre:
-- igualdade exata deixa passar qualquer sobreposição parcial, e ignorar `pending_confirmation`
-- deixa a tela oferecer um horário que já tem uma aula aguardando confirmação.
--
-- `CREATE OR REPLACE VIEW` preserva a mesma lista de colunas, na mesma ordem (`slot_id, admin_id,
-- start_time, end_time`) — compatível com o único consumidor (`getAvailableSlotsForDay`,
-- `api.ts`), que só lê `slot_id`. Continua sem filtrar `is_active` — comportamento documentado e
-- deliberado (o cliente já filtra `is_active = true` na consulta de `availability_slots` antes de
-- cruzar com esta view); mudar isso não foi pedido e não foi decidido aqui.

create or replace view public.available_slots as
select s.id as slot_id, s.admin_id, s.start_time, s.end_time
from public.availability_slots s
where not exists (
  select 1 from public.bookings b
  where b.admin_id = s.admin_id
    and b.status in ('scheduled', 'pending_confirmation')
    and b.start_time < s.end_time
    and b.end_time > s.start_time
);
