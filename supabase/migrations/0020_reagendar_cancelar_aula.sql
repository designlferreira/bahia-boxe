-- Etapa 6 / RECORRENCIA — `reagendar_aula` e `cancelar_aula`, professor-only, validadas no SERVIÇO
-- (CLAUDE.md: "esconder o botão não é autorização").
--
-- `mark_as_replacement` (AUTOSSERVICO) NÃO é tocada — decisão 2. Reagendar é uma RPC NOVA porque
-- faz uma coisa que aquela nunca fez: marcar o ANTECESSOR como `rescheduled`. No AUTOSSERVICO o
-- antecessor já chega pronto em `no_show`/`cancelled` antes de ser vinculado.
--
-- Reagendar NUNCA edita a linha existente (decisão registrada): marca a original como
-- `rescheduled` e cria uma linha NOVA, com `replacement_for_booking_id` apontando pra ela e
-- `cadeia_id` HERDADO. Assim "quantas vezes esta aula foi remarcada" = `count` por `cadeia_id`
-- menos 1, e a regra de crédito continua olhando só o terminal da cadeia (decisão 4) — uma aula
-- remarcada 3 vezes tem 4 linhas e consome 1 crédito, não 4.

-- ---------------------------------------------------------------------------------------------
-- 1. complete_booking / mark_no_show — REORDENAÇÃO de duas linhas, necessária pra Etapa 6.
--
--    Ordem antiga (0017): `if v_is_replacement then return; end if;` vinha ANTES do ramo
--    `pacote_id is not null`. Consequência: uma aula de recorrência marcada como reposição saía
--    pela porta do AUTOSSERVICO e NUNCA ressincronizava `used_classes` do pacote. Isso já era
--    alcançável hoje (o professor pode marcar uma aula de recorrência como reposição pelo
--    ReplacementPickerSheet), e a Etapa 6 tornaria sistemático: todo sucessor de reagendamento
--    nasce com `is_replacement = true` (decisão 2).
--
--    Ordem nova: o ramo de recorrência vem PRIMEIRO. Pra quem tem `pacote_id`, quem decide crédito
--    é a cadeia (`calcular_saldo_pacote`), e `is_replacement` é irrelevante — o terminal da cadeia
--    já é a única coisa que conta. Pra `pacote_id is null` (todo o AUTOSSERVICO) nada muda: o
--    early-return de reposição continua exatamente onde estava, antes do ledger.
-- ---------------------------------------------------------------------------------------------

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

  -- RECORRENCIA primeiro: a cadeia decide o crédito, `is_replacement` não muda nada aqui.
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

  -- aula de reposição não cobra crédito novo — a aula original é que já foi (ou não) cobrada.
  if v_is_replacement then
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

  -- RECORRENCIA primeiro (mesma razão de complete_booking). O coalesce de
  -- falta_consome_credito já está embutido em calcular_saldo_pacote (0013).
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

  if v_is_replacement then
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

-- ---------------------------------------------------------------------------------------------
-- 2. reagendar_aula — marca a original como `rescheduled` e cria a sucessora. Retorna o id novo.
-- ---------------------------------------------------------------------------------------------

create or replace function public.reagendar_aula(
  p_booking_id uuid,
  p_novo_inicio timestamptz,
  p_novo_fim timestamptz
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_orig record;
  v_cadeia_id uuid;
  v_novo_id uuid;
  v_saldo record;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  select * into v_orig from public.bookings where id = p_booking_id for update;

  if v_orig.id is null then
    raise exception 'Booking not found';
  end if;
  if v_orig.admin_id <> auth.uid() then
    raise exception 'not_allowed';
  end if;
  if v_orig.status <> 'scheduled' then
    raise exception 'Só uma aula agendada pode ser remarcada.';
  end if;
  if p_novo_inicio is null or p_novo_fim is null or p_novo_fim <= p_novo_inicio then
    raise exception 'Horário inválido: o fim precisa ser depois do início.';
  end if;
  if p_novo_inicio <= now() then
    raise exception 'Não dá para remarcar uma aula para um horário que já passou.';
  end if;

  -- Sobreposição real de intervalo com a agenda do professor, excluindo a PRÓPRIA linha que está
  -- sendo remarcada (senão mover 18:00-19:00 para 18:30-19:30 colidiria consigo mesma). Aqui não
  -- há exclusão por aluno: dois alunos no mesmo horário e o MESMO aluno duas vezes no mesmo
  -- horário são igualmente conflito.
  if exists (
    select 1 from public.bookings b
    where b.admin_id = auth.uid()
      and b.id <> p_booking_id
      and b.status = 'scheduled'
      and p_novo_inicio < b.end_time
      and p_novo_fim > b.start_time
  ) then
    raise exception 'Já existe uma aula marcada nesse horário.';
  end if;

  -- `cadeia_id` pode ser nulo em aulas do AUTOSSERVICO criadas DEPOIS do backfill da 0011
  -- (`schedule_booking` não preenche a coluna). Nesse caso a própria original vira a raiz da
  -- cadeia — sem isso, a contagem de remarcações agruparia por NULL.
  v_cadeia_id := coalesce(v_orig.cadeia_id, v_orig.id);

  update public.bookings
  set status = 'rescheduled',
      cadeia_id = v_cadeia_id
  where id = p_booking_id;

  v_novo_id := gen_random_uuid();
  insert into public.bookings (
    id, student_id, admin_id, start_time, end_time, status, billing_kind,
    pacote_id, recorrencia_id, cadeia_id, replacement_for_booking_id, is_replacement
  ) values (
    v_novo_id, v_orig.student_id, v_orig.admin_id, p_novo_inicio, p_novo_fim,
    'scheduled', coalesce(v_orig.billing_kind, 'package'),
    v_orig.pacote_id, v_orig.recorrencia_id, v_cadeia_id, p_booking_id, true
  );

  -- Não muda o consumo (o terminal da cadeia continua `scheduled`), mas mantém a cópia
  -- materializada em dia — decisão 4: todo RPC que muda status de booking ressincroniza.
  if v_orig.pacote_id is not null then
    perform 1 from public.packages where id = v_orig.pacote_id for update;
    select * into v_saldo from public.calcular_saldo_pacote(v_orig.pacote_id);
    update public.packages
    set used_classes = v_saldo.consumidas,
        status = case
          when status <> 'active' then status
          when v_saldo.consumidas >= v_saldo.total then 'finished'
          else 'active'
        end
    where id = v_orig.pacote_id;
  end if;

  return v_novo_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 3. cancelar_aula — exige o motivo. `'regeneracao'` é REJEITADO aqui de propósito: é valor
--    interno, escrito só por `gerar_pacote_recorrencia` (0019), nunca por ação de tela.
-- ---------------------------------------------------------------------------------------------

create or replace function public.cancelar_aula(p_booking_id uuid, p_cancelado_por text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_orig record;
  v_saldo record;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if p_cancelado_por is null or p_cancelado_por not in ('professor', 'aluno') then
    raise exception 'Motivo de cancelamento inválido: use "professor" ou "aluno".';
  end if;

  select * into v_orig from public.bookings where id = p_booking_id for update;

  if v_orig.id is null then
    raise exception 'Booking not found';
  end if;
  if v_orig.admin_id <> auth.uid() then
    raise exception 'not_allowed';
  end if;
  if v_orig.status = 'cancelled' then
    return; -- idempotente
  end if;
  if v_orig.status <> 'scheduled' then
    raise exception 'Só uma aula agendada pode ser cancelada.';
  end if;

  update public.bookings
  set status = 'cancelled', cancelado_por = p_cancelado_por
  where id = p_booking_id;

  -- Aqui o consumo PODE mudar: cancelada por aluno consome se `falta_consome_credito`; por
  -- professor nunca consome (regra única, decisão 4 — quem aplica é calcular_saldo_pacote).
  if v_orig.pacote_id is not null then
    perform 1 from public.packages where id = v_orig.pacote_id for update;
    select * into v_saldo from public.calcular_saldo_pacote(v_orig.pacote_id);
    update public.packages
    set used_classes = v_saldo.consumidas,
        status = case
          when status <> 'active' then status
          when v_saldo.consumidas >= v_saldo.total then 'finished'
          else 'active'
        end
    where id = v_orig.pacote_id;
  end if;
end;
$function$;
