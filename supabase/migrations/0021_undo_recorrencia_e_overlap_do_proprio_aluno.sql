-- RECORRENCIA — duas emendas aprovadas juntas (CLAUDE.md):
--   1. `undo_lesson_action` ganha o ramo de recorrência que faltava (era a última das quatro RPCs
--      de ciclo de vida ainda mexendo em `used_classes` à moda antiga).
--   2. `gerar_pacote_recorrencia` cancela a grade ANTES de checar sobreposição, e passa a checar
--      também contra o PRÓPRIO aluno.

-- ---------------------------------------------------------------------------------------------
-- 1. undo_lesson_action — ramo de recorrência + REABERTURA CONDICIONADA.
--
-- Antes desta migration, desfazer uma conclusão/falta de aula de recorrência voltava o status do
-- booking mas NÃO ressincronizava `used_classes`: a busca no ledger não achava nada (o ramo de
-- recorrência de complete_booking/mark_no_show nunca escreve em `credit_transactions`) e a função
-- retornava ali. A cópia materializada ficava mentindo até a próxima conclusão em qualquer aula do
-- mesmo pacote — e ela alimenta a barra de progresso do card E `available_credits_for_student`.
--
-- ASSIMETRIA DELIBERADA COM A 0017/0020 — NÃO "UNIFORMIZAR":
-- `complete_booking`/`mark_no_show` nunca escrevem `status` quando o pacote já não está `active`
-- (0017), porque ali a ação pode ser INCIDENTAL sobre uma aula órfã de um pacote já substituído —
-- concluir uma aula solta não deve ressuscitar o pacote antigo. `undo_lesson_action` é o oposto:
-- é ação EXPLÍCITA do professor sobre AQUELE pacote, e desfazer a conclusão que fechou o pacote
-- deve reabri-lo. Regras diferentes para intenções diferentes não é inconsistência.
--
-- A reabertura é condicionada por dois testes:
--   a) `consumidas >= total` → não reabre (o pacote continua cheio, não sobrou crédito).
--   b) existe OUTRO pacote `active` não-trial do mesmo aluno → não reabre: esse pacote foi
--      SUBSTITUÍDO, não esgotado. O predicado é literalmente o do índice
--      `ux_packages_one_active_purchase_per_student` — sem ele, um `status = 'active'` cego daria
--      erro de chave duplicada na cara do professor, sem explicação nenhuma.
-- Só quando os dois falham (fechou por exaustão, ninguém o substituiu) o pacote volta a `active`.
--
-- O resync de `used_classes` acontece SEMPRE, independente do que o `status` faça — decisão 4 vale
-- aqui como nas outras três.

create or replace function public.undo_lesson_action(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_id uuid;
  v_student_id uuid;
  v_status public.booking_status;
  v_pacote_id uuid;
  v_tx record;
  v_saldo record;
begin
  if not public.is_admin() then
    raise exception 'Only admin can undo';
  end if;

  select admin_id, student_id, status, pacote_id
    into v_admin_id, v_student_id, v_status, v_pacote_id
  from public.bookings where id = p_booking_id for update;

  if v_admin_id is null then
    raise exception 'Booking not found';
  end if;
  if v_admin_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  if v_status = 'scheduled' then
    return; -- idempotente: já não há nada a desfazer
  end if;
  if v_status not in ('completed', 'no_show') then
    raise exception 'Cannot undo a booking in status %', v_status;
  end if;

  update public.bookings set status = 'scheduled' where id = p_booking_id;

  -- RECORRENCIA: quem decide crédito é a cadeia, não o ledger (decisão 4). Nenhuma linha nova em
  -- credit_transactions — desfazer aqui é só recalcular e reescrever a cópia materializada.
  if v_pacote_id is not null then
    perform 1 from public.packages where id = v_pacote_id for update;
    select * into v_saldo from public.calcular_saldo_pacote(v_pacote_id);
    update public.packages
    set used_classes = v_saldo.consumidas,
        status = case
          when v_saldo.consumidas >= v_saldo.total then 'finished'
          when exists (
            select 1 from public.packages p2
            where p2.student_id = v_student_id
              and p2.id <> v_pacote_id
              and p2.status = 'active'
              and p2.origin <> 'trial'
          ) then status
          else 'active'
        end
    where id = v_pacote_id;
    return;
  end if;

  -- AUTOSSERVICO — byte-idêntico ao de 0001. Aqui `status = 'active'` continua incondicional: o
  -- ledger é a autoridade nesse fluxo e o estorno só existe se houve cobrança neste pacote.
  select * into v_tx
  from public.credit_transactions
  where booking_id = p_booking_id
    and reason in ('lesson_completed', 'absence_charge')
    and not exists (
      select 1 from public.credit_transactions r where r.reverses_transaction_id = credit_transactions.id
    )
  order by created_at desc
  limit 1;

  if v_tx.id is null then
    return; -- não tinha consumido crédito (ex.: falta com "preserva crédito", ou reposição)
  end if;

  insert into public.credit_transactions
    (student_id, package_id, booking_id, delta, reason, reverses_transaction_id, created_by)
  values
    (v_tx.student_id, v_tx.package_id, p_booking_id, -v_tx.delta, 'undo', v_tx.id, auth.uid());

  update public.packages
  set used_classes = greatest(used_classes - 1, 0),
      status = 'active'
  where id = v_tx.package_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 2. gerar_pacote_recorrencia — CANCELA ANTES DE CHECAR, e checa o próprio aluno também.
--
-- A exclusão `b.student_id <> p_aluno_id` da Camada 2 (0016) existia porque
-- `computeRecorrenciaSlots` não consulta bookings existentes: a grade anterior do próprio aluno
-- sempre colidiria consigo mesma e toda regeneração seria recusada. Cancelar a grade PRIMEIRO
-- torna essa exclusão desnecessária — depois do cancelamento, as únicas linhas futuras
-- `scheduled` do próprio aluno que sobraram são as que a regeneração deliberadamente não toca:
-- reposições/remarcações (`replacement_for_booking_id is not null`, 0019) e aulas do AUTOSSERVICO
-- que o próprio aluno agendou (`pacote_id is null`). Ambas são conflito real se colidirem com a
-- grade nova — antes desta migration, passavam batido e o aluno ficava com duas aulas no mesmo
-- horário.
--
-- Tudo na mesma transação: se qualquer das duas checagens levantar, o cancelamento do passo
-- anterior é desfeito junto — nunca fica "cancelado sem pacote novo".
--
-- Duas mensagens distintas de propósito: conflito com OUTRO aluno e conflito com o PRÓPRIO aluno
-- pedem ações diferentes do professor, então dizer só "deu conflito" não serve.
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

  -- Defesa: cada recorrencia_id citado no array precisa ser uma linha ATIVA de aluno_recorrencia
  -- deste aluno especificamente — não confia às cegas no array vindo do cliente.
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

  -- Descarta a grade anterior do próprio aluno ANTES das checagens de sobreposição (ver comentário
  -- acima). REPOSIÇÃO fica de fora: `replacement_for_booking_id is not null` é compromisso
  -- individualizado, não grade.
  update public.bookings
  set status = 'cancelled', cancelado_por = 'regeneracao'
  where student_id = p_aluno_id
    and admin_id = auth.uid()
    and status = 'scheduled'
    and pacote_id is not null
    and replacement_for_booking_id is null
    and start_time > now();

  -- Sobreposição real de intervalo com a agenda de OUTRO aluno do mesmo professor.
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

  -- Sobreposição com o que sobrou do PRÓPRIO aluno: reposição/remarcação (que a regeneração não
  -- cancela) ou aula do AUTOSSERVICO que ele mesmo agendou.
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

  -- _create_package fecha qualquer outro pacote active não-trial deste aluno antes de inserir —
  -- satisfaz ux_packages_one_active_purchase_per_student por construção (decisão 5).
  v_pkg_id := public._create_package(p_aluno_id, v_total, 'recurrence', 'package');

  update public.packages
  set recorrencia_id = (p_slots->0->>'recorrencia_id')::uuid,
      falta_consome_credito = v_falta_consome
  where id = v_pkg_id;

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

  return v_pkg_id;
end;
$function$;
