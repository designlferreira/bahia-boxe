-- RECORRENCIA — corrige corrupção de estado em complete_booking/mark_no_show (0015): o ramo
-- `pacote_id is not null` sobrescrevia `status` incondicionalmente a partir de
-- `calcular_saldo_pacote()`, sem checar o status ATUAL do pacote. Isso significa que concluir ou
-- marcar falta numa aula órfã — ligada por `pacote_id` a um pacote já `finished` (ex.: fechado por
-- `_create_package` ao gerar um pacote novo pro mesmo aluno) — podia REATIVAR esse pacote
-- (`status` voltando a `active`) como efeito colateral de processar uma aula não relacionada. Basta
-- existir UM booking com `pacote_id` apontando pra um pacote `finished` e ele ser concluído — não
-- depende de duplicação de bookings nem de nenhum outro bug.
--
-- Correção: `used_classes` continua sendo sempre sobrescrito com o valor real de
-- `calcular_saldo_pacote()` (decisão 4 — "única autoridade", nunca deixar o número congelar e ficar
-- errado, mesmo num pacote já fechado). `status` só é escrito quando o valor ATUAL da linha é
-- `active` — se já não for (`finished`), a linha mantém o status que já tinha. Reativar um pacote
-- continua sendo possível, mas só por ação explícita (`undo_lesson_action`), nunca como efeito
-- colateral de processar uma aula de outro pacote.
--
-- `finished` com `used_classes < total_classes` não é um estado novo: `_create_package` já fecha
-- qualquer pacote `active` antes de criar outro (admin_grant/purchase incluídos, desde antes da
-- RECORRENCIA existir) — sobra não usada num pacote `finished` já era possível. O que era novo (e
-- errado) era esse `finished` conseguir voltar a `active` sozinho.
--
-- Rejeitar a operação inteira (não deixar concluir/marcar falta numa aula de pacote não-active) foi
-- descartado: a aula aconteceu de verdade, o professor precisa poder registrar isso independente do
-- ciclo de vida interno do pacote — e a aula ficaria travada em `scheduled` pra sempre, sem caminho
-- normal de fechar.

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_id uuid;
  v_student_id uuid;
  v_status public.booking_status;
  v_is_replacement boolean;
  v_pacote_id uuid;
  v_pkg_id uuid;
  v_used int;
  v_total int;
  v_saldo record;
begin
  if not public.is_admin() then
    raise exception 'Only admin can complete bookings';
  end if;

  select admin_id, student_id, status, is_replacement, pacote_id
    into v_admin_id, v_student_id, v_status, v_is_replacement, v_pacote_id
  from public.bookings
  where id = p_booking_id
  for update;

  if v_admin_id is null then
    raise exception 'Booking not found';
  end if;
  if v_admin_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  if v_status = 'completed' then
    return; -- idempotente
  end if;
  if v_status <> 'scheduled' then
    raise exception 'Only scheduled bookings can be completed';
  end if;

  update public.bookings set status = 'completed' where id = p_booking_id;

  -- aula de reposição não cobra crédito novo — a aula original é que já foi (ou não) cobrada.
  if v_is_replacement then
    return;
  end if;

  if v_pacote_id is not null then
    perform 1 from public.packages where id = v_pacote_id for update;
    select * into v_saldo from public.calcular_saldo_pacote(v_pacote_id);
    update public.packages
    set used_classes = v_saldo.consumidas,
        status = case
          when status <> 'active' then status
          when v_saldo.consumidas >= v_saldo.total then 'finished'
          else 'active'
        end
    where id = v_pacote_id;
    return;
  end if;

  select id, used_classes, total_classes
    into v_pkg_id, v_used, v_total
  from public.packages
  where student_id = v_student_id and status = 'active' and used_classes < total_classes
  order by (origin = 'trial') desc, created_at asc
  limit 1
  for update;

  if v_pkg_id is null then
    raise exception 'Active package not found for student';
  end if;

  insert into public.credit_transactions (student_id, package_id, booking_id, delta, reason, created_by)
  values (v_student_id, v_pkg_id, p_booking_id, -1, 'lesson_completed', auth.uid());

  update public.packages
  set used_classes = used_classes + 1,
      status = case when used_classes + 1 >= total_classes then 'finished' else status end
  where id = v_pkg_id;
end;
$function$;

create or replace function public.mark_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_id uuid;
  v_student_id uuid;
  v_status public.booking_status;
  v_is_replacement boolean;
  v_pacote_id uuid;
  v_consumes boolean;
  v_pkg_id uuid;
  v_used int;
  v_total int;
  v_saldo record;
begin
  if not public.is_admin() then
    raise exception 'Only admin can mark no-show';
  end if;

  select admin_id, student_id, status, is_replacement, pacote_id
    into v_admin_id, v_student_id, v_status, v_is_replacement, v_pacote_id
  from public.bookings
  where id = p_booking_id
  for update;

  if v_admin_id is null then
    raise exception 'Booking not found';
  end if;
  if v_admin_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  if v_status = 'no_show' then
    return; -- idempotente
  end if;
  if v_status <> 'scheduled' then
    raise exception 'Only scheduled bookings can be marked no_show';
  end if;

  update public.bookings set status = 'no_show' where id = p_booking_id;

  if v_is_replacement then
    return;
  end if;

  if v_pacote_id is not null then
    -- coalesce(falta_consome_credito, no_show_consumes_class) já embutido dentro de
    -- calcular_saldo_pacote() (0013) — não repetido aqui.
    perform 1 from public.packages where id = v_pacote_id for update;
    select * into v_saldo from public.calcular_saldo_pacote(v_pacote_id);
    update public.packages
    set used_classes = v_saldo.consumidas,
        status = case
          when status <> 'active' then status
          when v_saldo.consumidas >= v_saldo.total then 'finished'
          else 'active'
        end
    where id = v_pacote_id;
    return;
  end if;

  select no_show_consumes_class into v_consumes
  from public.profiles where id = auth.uid();

  if not coalesce(v_consumes, true) then
    return; -- falta preserva crédito — nada a lançar no ledger (delta 0 não é transação)
  end if;

  select id, used_classes, total_classes
    into v_pkg_id, v_used, v_total
  from public.packages
  where student_id = v_student_id and status = 'active' and used_classes < total_classes
  order by (origin = 'trial') desc, created_at asc
  limit 1
  for update;

  if v_pkg_id is null then
    raise exception 'Active package not found for student';
  end if;

  insert into public.credit_transactions (student_id, package_id, booking_id, delta, reason, created_by)
  values (v_student_id, v_pkg_id, p_booking_id, -1, 'absence_charge', auth.uid());

  update public.packages
  set used_classes = used_classes + 1,
      status = case when used_classes + 1 >= total_classes then 'finished' else status end
  where id = v_pkg_id;
end;
$function$;
