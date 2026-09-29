-- 0030 — Sugestão de horário via RPC + guarda contra alteração indevida pelo aluno (2026-09-28)
--
-- CONTEXTO (lido do banco real via pg_policies / information_schema, 2026-09-28):
--
-- 1. BUG: aceitar / recusar sugestão NUNCA funcionaram pro aluno. O app fazia UPDATE direto em
--    `bookings`, mas a única policy de UPDATE do aluno (`bookings_student_update`) exige no USING
--    `status = 'scheduled'` — e uma aula com sugestão está `rejected_with_suggestion`. O UPDATE
--    afetava 0 linhas, sem erro, e o app mostrava uma mensagem enganosa. Além disso o WITH CHECK
--    exige que o horário novo seja um `availability_slot` publicado, o que um horário sugerido pelo
--    professor não precisa ser. Correção: três RPCs `security definer` com checagem de posse e de
--    estado — mesmo padrão de `reagendar_aula`/`cancelar_aula` (0020).
--
-- 2. FURO DE CRÉDITO: dentro do que a policy permite (aula própria, `scheduled`, >= 6h antes), o
--    aluno pode atualizar QUALQUER coluna (o grant de UPDATE pra `authenticated` cobre todas). Pelo
--    cliente, sem passar pelo app, ele poderia cancelar marcando `cancelado_por = 'professor'`
--    (que nunca consome crédito na recorrência — regra da 0013), mover a aula pra outro horário
--    publicado sem aprovação, ou mexer em `pacote_id`/`cadeia_id`/`teacher_note`...
--    Correção: trigger BEFORE UPDATE que, quando a escrita vem DIRETO do cliente (current_user
--    `authenticated`/`anon`) e quem escreve NÃO é o professor dono da aula, só aceita o que o app
--    realmente faz: cancelar (`scheduled` -> `cancelled`), e carimba `cancelado_por = 'aluno'`.
--
--    Por que `current_user` distingue: dentro de uma função `security definer`, current_user é o
--    DONO da função (não `authenticated`) — então todas as RPCs (as desta migration, as do
--    professor, schedule_booking...) passam direto pela guarda. Só UPDATE vindo do PostgREST com o
--    papel do usuário é inspecionado.
--
--    Consequência de crédito, deliberada: cancelamento feito pelo aluno passa a gravar
--    `cancelado_por = 'aluno'` (antes ficava NULL). No AUTOSSERVICO (`pacote_id is null`) isso não
--    muda nada — ali quem manda é o ledger. Na RECORRENCIA, "cancelada pelo aluno" consome crédito
--    se `falta_consome_credito` — que é a regra documentada; o NULL de antes caía no `else 0` da
--    whitelist da 0013 (fail-open) e nunca consumia.
--    (Se o aluno de recorrência deveria poder cancelar é outra decisão — CLAUDE.md, Etapa 8 — e
--    não é tratada aqui: o comportamento atual, cancelar é permitido, continua.)
--
-- Idempotente: create or replace + drop trigger if exists. Nenhum dado é alterado.

-- ---------------------------------------------------------------------------------------------
-- Helper: a aula é do aluno logado?
-- ---------------------------------------------------------------------------------------------
create or replace function public._booking_do_aluno_logado(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and s.profile_id = auth.uid()
  );
$function$;

-- ---------------------------------------------------------------------------------------------
-- aceitar_sugestao — o aluno aceita o horário que o professor sugeriu ao recusar o pedido.
-- ---------------------------------------------------------------------------------------------
create or replace function public.aceitar_sugestao(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b record;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;

  if v_b.id is null or not public._booking_do_aluno_logado(v_b.student_id) then
    raise exception 'not_allowed';
  end if;
  if v_b.status <> 'rejected_with_suggestion'
     or v_b.suggested_start_time is null
     or v_b.suggested_end_time is null then
    raise exception 'suggestion_not_available';
  end if;
  if v_b.suggested_start_time <= now() then
    raise exception 'suggestion_expired';
  end if;
  -- Mesma exigência de schedule_booking: precisa ter aula disponível. A reserva original foi
  -- liberada quando o professor recusou; aceitar reserva de novo.
  if public.available_credits_for_student(v_b.student_id) < 1 then
    raise exception 'no_credits';
  end if;

  begin
    update public.bookings
    set start_time = v_b.suggested_start_time,
        end_time = v_b.suggested_end_time,
        status = 'scheduled',
        suggested_start_time = null,
        suggested_end_time = null
    where id = p_booking_id;
  exception when exclusion_violation then
    -- 0028: o horário sugerido foi ocupado por outra aula do professor nesse meio-tempo.
    raise exception 'slot_taken';
  end;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- recusar_sugestao — o aluno diz "não" ao horário sugerido. A aula fica `rejected` (mesmo estado
-- de uma recusa sem sugestão). O horário sugerido é MANTIDO nas colunas `suggested_*` pra que
-- desfazer não precise receber horário nenhum do cliente (nada a forjar).
-- ---------------------------------------------------------------------------------------------
create or replace function public.recusar_sugestao(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b record;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;

  if v_b.id is null or not public._booking_do_aluno_logado(v_b.student_id) then
    raise exception 'not_allowed';
  end if;
  if v_b.status <> 'rejected_with_suggestion' then
    raise exception 'suggestion_not_available';
  end if;

  update public.bookings set status = 'rejected' where id = p_booking_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- desfazer_recusa_sugestao — volta a sugestão, se a aula ainda está `rejected` com o horário
-- sugerido guardado e no futuro.
-- ---------------------------------------------------------------------------------------------
create or replace function public.desfazer_recusa_sugestao(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b record;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;

  if v_b.id is null or not public._booking_do_aluno_logado(v_b.student_id) then
    raise exception 'not_allowed';
  end if;
  if v_b.status <> 'rejected'
     or v_b.suggested_start_time is null
     or v_b.suggested_start_time <= now() then
    raise exception 'suggestion_not_available';
  end if;

  update public.bookings set status = 'rejected_with_suggestion' where id = p_booking_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Guarda: UPDATE direto do cliente, por quem não é o professor dono da aula.
-- ---------------------------------------------------------------------------------------------
create or replace function public._guarda_update_booking_pelo_cliente()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Escrita de dentro de RPC security definer (current_user = dono da função): não é com esta guarda.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Professor dono da aula: segue exatamente como antes (as policies dele já valem).
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and old.admin_id = auth.uid()
  ) then
    return new;
  end if;

  -- Daqui pra baixo é o aluno (ou alguém sem papel de professor nesta aula). O app só faz uma
  -- coisa por UPDATE direto: cancelar a própria aula agendada. Tudo além disso é recusado.
  if old.status = 'scheduled'
     and new.status = 'cancelled'
     and (to_jsonb(new) - 'status' - 'cancelado_por' - 'cancel_reason')
         = (to_jsonb(old) - 'status' - 'cancelado_por' - 'cancel_reason') then
    new.cancelado_por := 'aluno';
    return new;
  end if;

  raise exception 'not_allowed';
end;
$function$;

drop trigger if exists trg_guarda_update_booking_pelo_cliente on public.bookings;
create trigger trg_guarda_update_booking_pelo_cliente
  before update on public.bookings
  for each row execute function public._guarda_update_booking_pelo_cliente();
