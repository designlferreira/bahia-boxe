-- Etapa 4 / RECORRENCIA — `complete_booking`/`mark_no_show` passam a usar `bookings.pacote_id`
-- como fonte DIRETA quando presente (decisão 7), em vez da busca preguiçosa "pacote active mais
-- antigo com vaga" (`order by (origin = 'trial') desc, created_at asc limit 1`). Quando
-- `pacote_id is null` (todo booking do AUTOSSERVICO, hoje e para sempre — essa coluna só é escrita
-- por `gerar_pacote_recorrencia`), o comportamento é IDÊNTICO ao de `0001_credit_ledger.sql`: mesmo
-- texto, mesma ordem de operações, nada mudou nesse ramo.
--
-- Quando `pacote_id is not null`: nenhum `insert into credit_transactions`, nenhum incremento de
-- `used_classes`. `calcular_saldo_pacote()` já resolve sozinho o `coalesce(falta_consome_credito,
-- no_show_consumes_class)` (decisão 3, embutido em 0013) e a regra de crédito por cadeia (decisão
-- 4) — chamar essa função e SOBRESCREVER `used_classes`/`status` com o resultado é a única escrita.
-- Nenhum código aqui incrementa/decrementa `used_classes` pra pacote de recorrência (decisão 4).
--
-- `status` fica simétrico (`finished` quando `consumidas >= total`, `active` caso contrário) em vez
-- do padrão antigo (só avança pra `finished`, nunca volta) — `calcular_saldo_pacote()` já é "a
-- única autoridade" (decisão 4), então status derivado a cada chamada é mais consistente com isso
-- do que reproduzir a assimetria do caminho antigo (que existe ali só porque `used_classes` era um
-- contador que nunca diminuía sozinho). Ainda não há como `consumidas` cair depois de já ter
-- atingido `total` nesta etapa (reagendar/cancelar são a Etapa 6) — put here now so that etapa
-- doesn't also need to touch this file.
--
-- GAP CONHECIDO, não corrigido nesta migration: `undo_lesson_action` (0001) não foi reescrita — ela
-- não está no roteiro da Etapa 4. Hoje ela só resincroniza `used_classes` quando encontra uma linha
-- em `credit_transactions` pra reverter; como o ramo `pacote_id is not null` abaixo NUNCA escreve
-- em `credit_transactions`, desfazer uma conclusão/falta de uma aula de recorrência volta o
-- `status` do booking para `scheduled` (isso já acontece, incondicional, no início da função) mas
-- NÃO re-sincroniza `packages.used_classes` — ele fica desatualizado até a próxima chamada de
-- `complete_booking`/`mark_no_show` em QUALQUER aula do mesmo pacote. `calcular_saldo_pacote()`/
-- `saldo_pacotes` continuam corretos a qualquer momento (são a autoridade de verdade); só a cópia
-- materializada em `used_classes` fica momentaneamente stale. Registrar aqui em vez de estender o
-- escopo desta etapa sem pedir — mesmo padrão do "crédito de trial parado" (decisão 7).

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
        status = case when v_saldo.consumidas >= v_saldo.total then 'finished' else 'active' end
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
        status = case when v_saldo.consumidas >= v_saldo.total then 'finished' else 'active' end
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
