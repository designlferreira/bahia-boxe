-- 0033 — Aluno de recorrência pede remarcação; o professor aprova ou recusa (2026-09-28)
--
-- Decisões do Lucas (2026-09-28), fechadas antes deste arquivo:
--   - o aluno de RECORRÊNCIA pode pedir pra remarcar uma aula agendada;
--   - pra QUALQUER horário livre do professor (não só disponibilidade publicada), em horas cheias,
--     das 06h às 22h (horário de São Paulo), todos os dias;
--   - o pedido fica PENDENTE até o professor aprovar; a aula original continua valendo até lá;
--   - antecedência mínima de 24h (da aula original e do horário novo);
--   - um pedido pendente por aula de cada vez; o aluno pode cancelar o próprio pedido.
--
-- MODELO: o pedido é uma linha NOVA em `bookings`, `pending_confirmation`, já ligada à original
-- como sucessora (replacement_for_booking_id + cadeia_id herdado + pacote_id herdado) — o mesmo
-- formato que `reagendar_aula` (0020/0027) cria, só que pendente. Estar `pending_confirmation`
-- reserva o horário na exclusion constraint da 0028: ninguém mais pega esse horário enquanto o
-- professor decide.
--
-- Crédito enquanto pendente: a cadeia tem como terminal o pedido (`pending_confirmation`), que a
-- regra da 0013 conta como 0 — igual à original `scheduled`, que também conta 0. Nada muda no
-- saldo até alguém concluir/marcar falta.
--
-- Aprovar = exatamente o que `reagendar_aula` faz: original -> `rescheduled`, pedido ->
-- `scheduled`, ressincroniza `used_classes` (decisão 4).
--
-- Recusar / cancelar pedido: o pedido sai da cadeia (replacement_for_booking_id = null,
-- cadeia_id = o próprio id, pacote_id = null). OBRIGATÓRIO: se continuasse ligado, ele seria o
-- terminal da cadeia (a original deixaria de ser terminal) e `calcular_saldo_pacote` passaria a
-- aplicar a regra de crédito ao pedido recusado em vez de à aula real.
--
-- Todas as funções são `security definer` com checagem interna (padrão do repo) e passam pela
-- guarda da 0030 (current_user = dono da função). Idempotente: create or replace.

-- ---------------------------------------------------------------------------------------------
-- Início de uma hora cheia, no dia civil de São Paulo, como timestamptz.
-- ---------------------------------------------------------------------------------------------
create or replace function public._inicio_hora_sp(p_dia date, p_hora int)
returns timestamptz
language sql
immutable
as $function$
  select (p_dia::timestamp + make_interval(hours => p_hora)) at time zone 'America/Sao_Paulo';
$function$;

-- ---------------------------------------------------------------------------------------------
-- Aula original válida pra pedido de remarcação pelo aluno logado. Levanta exceção se não for.
-- ---------------------------------------------------------------------------------------------
create or replace function public._original_para_remarcacao(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_orig public.bookings;
begin
  select * into v_orig from public.bookings where id = p_booking_id;

  if v_orig.id is null or not public._booking_do_aluno_logado(v_orig.student_id) then
    raise exception 'not_allowed';
  end if;
  if v_orig.pacote_id is null then
    -- Só aula de recorrência. No autosserviço o aluno já cancela e agenda sozinho.
    raise exception 'not_recurrence';
  end if;
  if v_orig.status <> 'scheduled' then
    raise exception 'not_scheduled';
  end if;
  if v_orig.start_time < now() + interval '24 hours' then
    raise exception 'too_late';
  end if;
  return v_orig;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- horarios_livres_remarcacao — horas cheias livres de um dia, pro aluno escolher. Devolve só o
-- início de cada hora livre: o aluno não vê de quem são as outras aulas do professor.
-- ---------------------------------------------------------------------------------------------
create or replace function public.horarios_livres_remarcacao(p_booking_id uuid, p_dia date)
returns table (inicio timestamptz)
language plpgsql
security definer
stable
set search_path to 'public'
as $function$
declare
  v_orig public.bookings;
  v_dur interval;
  v_h int;
  v_ini timestamptz;
  v_fim timestamptz;
begin
  v_orig := public._original_para_remarcacao(p_booking_id);
  v_dur := v_orig.end_time - v_orig.start_time;

  for v_h in 6..21 loop
    v_ini := public._inicio_hora_sp(p_dia, v_h);
    v_fim := v_ini + v_dur;
    continue when v_fim > public._inicio_hora_sp(p_dia, 22);
    continue when v_ini < now() + interval '24 hours';
    continue when exists (
      select 1 from public.bookings b
      where b.admin_id = v_orig.admin_id
        and b.status in ('scheduled', 'pending_confirmation')
        and v_ini < b.end_time
        and v_fim > b.start_time
    );
    inicio := v_ini;
    return next;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- pedir_remarcacao — cria o pedido pendente. Devolve o id do pedido.
-- ---------------------------------------------------------------------------------------------
create or replace function public.pedir_remarcacao(p_booking_id uuid, p_novo_inicio timestamptz)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_orig public.bookings;
  v_fim timestamptz;
  v_local timestamp;
  v_novo_id uuid;
begin
  select * into v_orig from public.bookings where id = p_booking_id for update;
  v_orig := public._original_para_remarcacao(p_booking_id);

  if exists (
    select 1 from public.bookings b
    where b.replacement_for_booking_id = p_booking_id and b.status = 'pending_confirmation'
  ) then
    raise exception 'request_already_pending';
  end if;

  v_fim := p_novo_inicio + (v_orig.end_time - v_orig.start_time);
  v_local := p_novo_inicio at time zone 'America/Sao_Paulo';
  if p_novo_inicio is null
     or extract(minute from v_local) <> 0 or extract(second from v_local) <> 0
     or extract(hour from v_local) < 6
     or v_fim > public._inicio_hora_sp(v_local::date, 22)
     or p_novo_inicio < now() + interval '24 hours' then
    raise exception 'invalid_time';
  end if;

  if exists (
    select 1 from public.bookings b
    where b.admin_id = v_orig.admin_id
      and b.status in ('scheduled', 'pending_confirmation')
      and p_novo_inicio < b.end_time
      and v_fim > b.start_time
  ) then
    raise exception 'slot_taken';
  end if;

  v_novo_id := gen_random_uuid();
  begin
    insert into public.bookings (
      id, student_id, admin_id, start_time, end_time, status, billing_kind,
      pacote_id, recorrencia_id, cadeia_id, replacement_for_booking_id, is_replacement
    ) values (
      v_novo_id, v_orig.student_id, v_orig.admin_id, p_novo_inicio, v_fim,
      'pending_confirmation', coalesce(v_orig.billing_kind, 'package'),
      v_orig.pacote_id, v_orig.recorrencia_id, coalesce(v_orig.cadeia_id, v_orig.id), p_booking_id, true
    );
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  return v_novo_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Tira um pedido da cadeia (usado ao cancelar e ao recusar). Ver cabeçalho: sem isso o pedido
-- recusado viraria o terminal da cadeia e o saldo erraria.
-- ---------------------------------------------------------------------------------------------
create or replace function public._desligar_pedido_da_cadeia(p_pedido_id uuid, p_status public.booking_status, p_nota text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.bookings
  set status = p_status,
      teacher_note = coalesce(p_nota, teacher_note),
      replacement_for_booking_id = null,
      cadeia_id = id,
      pacote_id = null,
      is_replacement = false
  where id = p_pedido_id;
$function$;

-- ---------------------------------------------------------------------------------------------
-- cancelar_pedido_remarcacao — o aluno desiste do pedido; a aula original segue valendo.
-- ---------------------------------------------------------------------------------------------
create or replace function public.cancelar_pedido_remarcacao(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p public.bookings;
begin
  select * into v_p from public.bookings where id = p_pedido_id for update;
  if v_p.id is null or not public._booking_do_aluno_logado(v_p.student_id) then
    raise exception 'not_allowed';
  end if;
  if v_p.status <> 'pending_confirmation' or v_p.replacement_for_booking_id is null then
    raise exception 'request_not_pending';
  end if;
  perform public._desligar_pedido_da_cadeia(p_pedido_id, 'cancelled', null);
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- aprovar_remarcacao — professor aprova: original -> rescheduled, pedido -> scheduled.
-- ---------------------------------------------------------------------------------------------
create or replace function public.aprovar_remarcacao(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p public.bookings;
  v_orig public.bookings;
  v_saldo record;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  select * into v_p from public.bookings where id = p_pedido_id for update;
  if v_p.id is null or v_p.admin_id <> auth.uid() then
    raise exception 'not_allowed';
  end if;
  if v_p.status <> 'pending_confirmation' or v_p.replacement_for_booking_id is null then
    raise exception 'request_not_pending';
  end if;

  select * into v_orig from public.bookings where id = v_p.replacement_for_booking_id for update;
  if v_orig.status <> 'scheduled' then
    -- A aula original mudou nesse meio-tempo (cancelada, concluída...). Não há o que remarcar.
    raise exception 'original_not_scheduled';
  end if;

  update public.bookings
  set status = 'rescheduled', cadeia_id = coalesce(cadeia_id, id)
  where id = v_orig.id;

  update public.bookings set status = 'scheduled' where id = p_pedido_id;

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

-- ---------------------------------------------------------------------------------------------
-- recusar_remarcacao — professor recusa: o pedido vira `rejected` e sai da cadeia; a original segue.
-- ---------------------------------------------------------------------------------------------
create or replace function public.recusar_remarcacao(p_pedido_id uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p public.bookings;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  select * into v_p from public.bookings where id = p_pedido_id for update;
  if v_p.id is null or v_p.admin_id <> auth.uid() then
    raise exception 'not_allowed';
  end if;
  if v_p.status <> 'pending_confirmation' or v_p.replacement_for_booking_id is null then
    raise exception 'request_not_pending';
  end if;

  perform public._desligar_pedido_da_cadeia(p_pedido_id, 'rejected', nullif(trim(p_nota), ''));
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- As três funções auxiliares (prefixo `_`) só existem pra serem chamadas de DENTRO das RPCs acima.
-- Toda função nova é EXECUTE-ável por PUBLIC por padrão (CLAUDE.md, decisão 6); sem este REVOKE,
-- `_desligar_pedido_da_cadeia` — que não checa quem chama — alteraria QUALQUER aula via
-- supabase.rpc(...). Mesmo mecanismo de `_create_package` (0012). Chamada interna a partir das
-- RPCs `security definer` continua funcionando: roda como o dono da função.
-- ---------------------------------------------------------------------------------------------
revoke execute on function public._desligar_pedido_da_cadeia(uuid, public.booking_status, text) from public, anon, authenticated;
revoke execute on function public._original_para_remarcacao(uuid) from public, anon, authenticated;
revoke execute on function public._inicio_hora_sp(date, int) from public, anon, authenticated;
