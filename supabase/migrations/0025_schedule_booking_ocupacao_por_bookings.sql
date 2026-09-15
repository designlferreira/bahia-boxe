-- Etapa 1/5 da migration de "is_active — Opção B" (CLAUDE.md, "Pontos ainda em aberto").
--
-- `schedule_booking` deixa de escrever ocupação (`update availability_slots set is_active =
-- false`) — `is_active` volta a significar só "publicado", nunca mais "ocupado". A guarda contra
-- double-booking, que hoje olha só `bookings.slot_id` (só AUTOSSERVICO escreve essa coluna —
-- confirmado por grep em todas as migrations), vira uma checagem geral por SOBREPOSIÇÃO DE
-- INTERVALO contra qualquer booking ativo (`scheduled`/`pending_confirmation`) do mesmo professor
-- — cobre também colisão com aula de RECORRENCIA, que nunca tinha proteção nenhuma de banco (só a
-- tela "Agendar" não oferecia o horário, via a view `available_slots` — barreira de cliente, não
-- de banco).
--
-- Exception handler novo: o `insert` fica dentro de um bloco aninhado que captura
-- `exclusion_violation` (SQLSTATE 23P01). A checagem acima por `if exists` sozinha tem uma janela
-- de corrida clássica (TOCTOU) — dois agendamentos concorrentes no mesmo horário podem passar os
-- dois pela checagem antes de qualquer um commitar. A exclusion constraint (etapa 4, migration
-- 0028) é o freio de verdade para esse caso; o handler aqui só existe para que, quando ela pegar
-- essa corrida, o erro que chega ao aluno seja o mesmo `slot_already_booked` de sempre, não o texto
-- cru do Postgres. Fica dormente até a 0028 existir — não muda nada até lá.

create or replace function public.schedule_booking(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id uuid;
  v_student_admin uuid;
  v_slot_admin uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_remaining int;
  v_scheduled int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student') then
    raise exception 'only_students';
  end if;

  select s.id, s.admin_id into v_student_id, v_student_admin
  from public.students s
  where s.profile_id = auth.uid();

  if v_student_id is null then
    raise exception 'student_not_found';
  end if;

  select sl.admin_id, sl.start_time, sl.end_time
    into v_slot_admin, v_start, v_end
  from public.availability_slots sl
  where sl.id = p_slot_id and sl.is_active = true and sl.start_time > now()
  for update;

  if v_start is null then
    raise exception 'slot_not_available';
  end if;
  if v_slot_admin <> v_student_admin then
    raise exception 'slot_not_for_student';
  end if;

  -- Sobreposição de intervalo contra QUALQUER booking ativo do professor, não só o mesmo slot_id
  -- (que a RECORRENCIA nunca preenche) e não só `scheduled` (pending_confirmation ocupa também).
  if exists (
    select 1 from public.bookings b
    where b.admin_id = v_slot_admin
      and b.status in ('scheduled', 'pending_confirmation')
      and b.start_time < v_end
      and b.end_time > v_start
  ) then
    raise exception 'slot_already_booked';
  end if;

  -- trava todos os pacotes ativos do aluno antes de somar, pra que um segundo agendamento
  -- concorrente espere essa transação terminar em vez de ler o mesmo saldo "livre" duas vezes.
  perform 1 from public.packages
  where student_id = v_student_id and status = 'active'
  for update;

  select coalesce(sum(total_classes - used_classes), 0)
    into v_remaining
  from public.packages
  where student_id = v_student_id and status = 'active';

  if v_remaining <= 0 then
    raise exception 'no_active_package_or_no_credits';
  end if;

  select count(*) into v_scheduled
  from public.bookings b
  where b.student_id = v_student_id and b.status = 'scheduled' and b.start_time > now();

  if (v_remaining - v_scheduled) <= 0 then
    raise exception 'no_credits_left_for_future_bookings';
  end if;

  begin
    insert into public.bookings (student_id, admin_id, slot_id, start_time, end_time, status, billing_kind)
    values (v_student_id, v_student_admin, p_slot_id, v_start, v_end, 'scheduled', 'package');
  exception
    when exclusion_violation then
      raise exception 'slot_already_booked';
  end;
end;
$function$;
