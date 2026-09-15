-- Etapa 3/5 da migration de "is_active — Opção B" (CLAUDE.md, "Pontos ainda em aberto").
--
-- Resposta à pergunta (b) do usuário: "o que acontece quando a constraint rejeita?" Hoje, nos dois
-- outros lugares que inserem em `bookings` além de `schedule_booking` (0025), uma rejeição da
-- exclusion constraint (0028) apareceria como erro cru do Postgres. Tratamento novo:
--
-- 1. `gerar_pacote_recorrencia` (0021) — o loop que insere a grade nova fica dentro de um bloco
--    aninhado que captura `exclusion_violation`. As duas checagens que já existem (contra outro
--    aluno, contra o próprio) cobrem o caso comum; isto é só a rede de segurança para a corrida
--    entre a checagem e o insert (TOCTOU) — ex.: um aluno se autoagenda por AUTOSSERVICO no meio da
--    geração da grade, bem no meio do horário que a grade está prestes a ocupar.
--
-- 2. `reagendar_aula` (0020) — MESMA lacuna do `schedule_booking` antes da 0025: a checagem de
--    sobreposição olha só `status = 'scheduled'`, nunca `pending_confirmation`. Corrigida junto,
--    mesma razão de sempre (ampliar comparação por igualdade/status incompleto em mais um lugar
--    seria espalhar o bug, não fechá-lo). Ganha o mesmo bloco aninhado com `exclusion_violation`
--    para a mesma corrida.
--
-- Nenhuma das duas mudanças depende da constraint existir — os `exception when exclusion_violation`
-- ficam dormentes até a 0028 rodar, exatamente como em 0025.

-- ---------------------------------------------------------------------------------------------
-- 1. gerar_pacote_recorrencia — corpo idêntico ao de 0021, só o loop final ganha o bloco aninhado.
-- ---------------------------------------------------------------------------------------------

create or replace function public.gerar_pacote_recorrencia(p_aluno_id uuid, p_slots jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total int;
  v_falta_consome boolean;
  v_pkg_id uuid;
  v_slot jsonb;
  v_booking_id uuid;
  v_recorrencia_ids uuid[];
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_aluno_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  v_total := jsonb_array_length(p_slots);
  if v_total is null or v_total <= 0 then
    raise exception 'invalid_slots';
  end if;

  select array_agg(distinct (elem->>'recorrencia_id')::uuid)
    into v_recorrencia_ids
  from jsonb_array_elements(p_slots) elem;

  if exists (
    select 1 from unnest(v_recorrencia_ids) rid
    where not exists (
      select 1 from public.aluno_recorrencia ar
      where ar.id = rid and ar.aluno_id = p_aluno_id and ar.ativo = true
    )
  ) then
    raise exception 'recorrencia_invalida';
  end if;

  update public.bookings
  set status = 'cancelled', cancelado_por = 'regeneracao'
  where student_id = p_aluno_id
    and admin_id = auth.uid()
    and status = 'scheduled'
    and pacote_id is not null
    and replacement_for_booking_id is null
    and start_time > now();

  if exists (
    select 1
    from jsonb_array_elements(p_slots) slot
    join public.bookings b
      on b.admin_id = auth.uid()
     and b.student_id <> p_aluno_id
     and b.status = 'scheduled'
     and (slot->>'start_time')::timestamptz < b.end_time
     and (slot->>'end_time')::timestamptz > b.start_time
  ) then
    raise exception 'Um ou mais horários da grade coincidem com uma aula já marcada de OUTRO aluno. Ajuste os dias fixos ou resolva o conflito na agenda antes de gerar.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_slots) slot
    join public.bookings b
      on b.admin_id = auth.uid()
     and b.student_id = p_aluno_id
     and b.status = 'scheduled'
     and (slot->>'start_time')::timestamptz < b.end_time
     and (slot->>'end_time')::timestamptz > b.start_time
  ) then
    raise exception 'Já existe aula marcada para este aluno em um dos horários da grade. Cancele ou remarque essa aula antes de gerar o pacote.';
  end if;

  select coalesce(no_show_consumes_class, true) into v_falta_consome
  from public.profiles where id = auth.uid();

  v_pkg_id := public._create_package(p_aluno_id, v_total, 'recurrence', 'package');

  update public.packages
  set recorrencia_id = (p_slots->0->>'recorrencia_id')::uuid,
      falta_consome_credito = v_falta_consome
  where id = v_pkg_id;

  -- Bloco aninhado novo: rede de segurança contra a corrida entre as checagens acima e o insert.
  begin
    for v_slot in select * from jsonb_array_elements(p_slots)
    loop
      v_booking_id := gen_random_uuid();
      insert into public.bookings (
        id, student_id, admin_id, start_time, end_time, status, billing_kind,
        pacote_id, recorrencia_id, cadeia_id
      ) values (
        v_booking_id, p_aluno_id, auth.uid(),
        (v_slot->>'start_time')::timestamptz, (v_slot->>'end_time')::timestamptz,
        'scheduled', 'package', v_pkg_id, (v_slot->>'recorrencia_id')::uuid, v_booking_id
      );
    end loop;
  exception
    when exclusion_violation then
      raise exception 'Um dos horários da grade colidiu com uma aula marcada bem na hora da geração. Tente gerar de novo — se persistir, revise a grade.';
  end;

  return v_pkg_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 2. reagendar_aula — corpo idêntico ao de 0020, com `pending_confirmation` na checagem de
--    sobreposição e o insert dentro de um bloco aninhado com `exclusion_violation`.
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

  if exists (
    select 1 from public.bookings b
    where b.admin_id = auth.uid()
      and b.id <> p_booking_id
      and b.status in ('scheduled', 'pending_confirmation')
      and p_novo_inicio < b.end_time
      and p_novo_fim > b.start_time
  ) then
    raise exception 'Já existe uma aula marcada nesse horário.';
  end if;

  v_cadeia_id := coalesce(v_orig.cadeia_id, v_orig.id);

  update public.bookings
  set status = 'rescheduled',
      cadeia_id = v_cadeia_id
  where id = p_booking_id;

  v_novo_id := gen_random_uuid();
  begin
    insert into public.bookings (
      id, student_id, admin_id, start_time, end_time, status, billing_kind,
      pacote_id, recorrencia_id, cadeia_id, replacement_for_booking_id, is_replacement
    ) values (
      v_novo_id, v_orig.student_id, v_orig.admin_id, p_novo_inicio, p_novo_fim,
      'scheduled', coalesce(v_orig.billing_kind, 'package'),
      v_orig.pacote_id, v_orig.recorrencia_id, v_cadeia_id, p_booking_id, true
    );
  exception
    when exclusion_violation then
      raise exception 'Já existe uma aula marcada nesse horário.';
  end;

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
