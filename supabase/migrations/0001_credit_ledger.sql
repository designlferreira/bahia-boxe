-- Lote A / Etapa 1 — ledger de créditos, correção do consumo em dobro, trial automático.
--
-- Rode isto inteiro de uma vez no SQL Editor (é uma transação implícita — se algo falhar no
-- meio, nada é aplicado). Todo passo de escrita é condicional/idempotente (IF NOT EXISTS, ON
-- CONFLICT, filtros de "já processado"), então rodar de novo por engano não duplica nada.
--
-- O que este arquivo NÃO faz: não corrige nenhum saldo de aluno hoje. `reconciliation.sql`
-- (rodado em 2026-09) não encontrou nenhum pacote no padrão determinístico do bug de dupla
-- contagem (`used_classes == 2×consumo_registrado`) — a lógica de correção abaixo existe mesmo
-- assim, condicional, como proteção para qualquer execução futura, mas hoje ela não altera nada.
--
-- Contexto (não repetir aqui o raciocínio completo, já documentado na conversa/PR):
--  - `apply_booking_package_consumption` (trigger) e `complete_booking`/`mark_no_show` (RPCs)
--    escreviam em `packages.used_classes` de forma independente para a MESMA transição de
--    status — toda aula concluída/falta em pacote `kind='package'` consumia 2 créditos. A trigger
--    é removida aqui; as RPCs passam a ser o único escritor.
--  - `booking_package_consumptions` nunca teve esse problema (só a trigger escrevia nela, com
--    `primary key(booking_id)`) — é a evidência usada no backfill abaixo.
--  - Trial e pacote pago passam a poder coexistir como dois pacotes `active` simultâneos,
--    diferenciados por `packages.origin` (não por `kind`, que já significa outra coisa).


-- =============================================================================================
-- 1. LEDGER
-- =============================================================================================

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  package_id uuid references public.packages(id),
  booking_id uuid references public.bookings(id),
  delta int not null check (delta <> 0),
  reason text not null check (reason in (
    'trial_grant', 'purchase_grant', 'admin_grant',
    'lesson_completed', 'absence_charge',
    'undo', 'replacement_refund',
    'legacy_unverified_consumption'
  )),
  -- aponta para a transação que esta linha está revertendo (undo / estorno de reposição).
  -- nunca aponta pra si mesma; uma transação original só pode ser revertida uma vez (índice único
  -- abaixo), então "desfazer" nunca gera saldo além da reversão exata da operação original.
  reverses_transaction_id uuid references public.credit_transactions(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists credit_transactions_single_reversal
  on public.credit_transactions (reverses_transaction_id)
  where reverses_transaction_id is not null;

create index if not exists credit_transactions_student_idx
  on public.credit_transactions (student_id, created_at desc);

create index if not exists credit_transactions_booking_idx
  on public.credit_transactions (booking_id)
  where booking_id is not null;

alter table public.credit_transactions enable row level security;

drop policy if exists credit_transactions_student_select on public.credit_transactions;
create policy credit_transactions_student_select on public.credit_transactions
  for select
  using (exists (
    select 1 from public.students s
    where s.id = credit_transactions.student_id and s.profile_id = auth.uid()
  ));

drop policy if exists credit_transactions_admin_select on public.credit_transactions;
create policy credit_transactions_admin_select on public.credit_transactions
  for select
  using (exists (
    select 1 from public.students s
    where s.id = credit_transactions.student_id and s.admin_id = auth.uid()
  ));
-- Sem policy de insert/update/delete: só funções SECURITY DEFINER escrevem aqui, igual ao padrão
-- já usado em booking_package_consumptions.


-- =============================================================================================
-- 2. ORIGEM DO PACOTE (trial vs. comprado vs. atribuído pelo admin) — dimensão nova, separada de
--    `kind` (que continua distinguindo "pacote de N aulas" de "aula avulsa").
-- =============================================================================================

alter table public.packages
  add column if not exists origin text not null default 'purchase'
    check (origin in ('trial', 'purchase', 'admin_grant'));

-- No máximo um trial por aluno, para sempre — reforçado no banco, não só por convenção do app.
create unique index if not exists packages_one_trial_per_student
  on public.packages (student_id)
  where origin = 'trial';


-- =============================================================================================
-- 3. REPOSIÇÃO — vínculo explícito com a aula original.
-- =============================================================================================

alter table public.bookings
  add column if not exists is_replacement boolean not null default false,
  add column if not exists replacement_for_booking_id uuid references public.bookings(id);


-- =============================================================================================
-- 4. AUDITORIA — snapshot de todo pacote kind='package' antes/depois desta migration, com a
--    classificação (ok / duplo_deterministico / sem_evidencia / ambiguo / sem_atividade). Fica
--    permanente pra consulta futura: `select * from public._migration_0001_credit_audit`.
-- =============================================================================================

create table if not exists public._migration_0001_credit_audit (
  package_id uuid primary key,
  student_id uuid not null,
  used_classes_before int not null,
  consumo_registrado int not null,
  used_classes_after int not null,
  classificacao text not null,
  recorded_at timestamptz not null default now()
);

insert into public._migration_0001_credit_audit
  (package_id, student_id, used_classes_before, consumo_registrado, used_classes_after, classificacao)
select
  p.id, p.student_id, p.used_classes, coalesce(c.qtd, 0), p.used_classes,
  case
    when coalesce(c.qtd, 0) = 0 and p.used_classes = 0 then 'sem_atividade'
    when p.used_classes = coalesce(c.qtd, 0) then 'ok'
    when coalesce(c.qtd, 0) > 0 and p.used_classes = 2 * coalesce(c.qtd, 0) then 'duplo_deterministico'
    when coalesce(c.qtd, 0) = 0 and p.used_classes > 0 then 'sem_evidencia'
    else 'ambiguo'
  end
from public.packages p
left join (
  select package_id, count(*) as qtd from public.booking_package_consumptions group by package_id
) c on c.package_id = p.id
where p.kind = 'package'
  and not exists (select 1 from public._migration_0001_credit_audit a where a.package_id = p.id);


-- =============================================================================================
-- 5. CORREÇÃO — só os casos deterministicamente explicados pelo bug (used_classes == 2×consumo).
--    Hoje isso não afeta nenhum pacote real (ver comentário no topo); fica condicional para
--    qualquer execução futura desta migration não corrigir cegamente casos ambíguos.
-- =============================================================================================

with alvo as (
  select package_id, consumo_registrado as consumo
  from public._migration_0001_credit_audit
  where classificacao = 'duplo_deterministico'
)
update public.packages p
set used_classes = alvo.consumo
from alvo
where p.id = alvo.package_id;

update public._migration_0001_credit_audit a
set used_classes_after = alvo.consumo
from (
  select package_id, consumo_registrado as consumo
  from public._migration_0001_credit_audit
  where classificacao = 'duplo_deterministico'
) alvo
where a.package_id = alvo.package_id;


-- =============================================================================================
-- 6. BACKFILL DO LEDGER — reconstrói o histórico a partir de evidência real, não do valor atual
--    de configurações que podem ter mudado (ex.: no_show_consumes_class).
-- =============================================================================================

-- 6a. Concessões: uma linha por pacote existente, na data de criação do pacote.
insert into public.credit_transactions (student_id, package_id, delta, reason, created_at)
select
  p.student_id, p.id, p.total_classes,
  case when p.origin = 'trial' then 'trial_grant'
       when p.origin = 'admin_grant' then 'admin_grant'
       else 'purchase_grant' end,
  p.created_at
from public.packages p
where p.total_classes > 0
  and not exists (
    select 1 from public.credit_transactions ct
    where ct.package_id = p.id and ct.reason in ('trial_grant', 'purchase_grant', 'admin_grant')
  );

-- 6b. Consumo com evidência real (booking_package_consumptions nunca duplicou — só a trigger
--     escrevia nela, uma vez por booking).
insert into public.credit_transactions (student_id, package_id, booking_id, delta, reason, created_at)
select
  p.student_id, c.package_id, c.booking_id, -c.delta,
  case when b.status = 'no_show' then 'absence_charge' else 'lesson_completed' end,
  c.created_at
from public.booking_package_consumptions c
join public.packages p on p.id = c.package_id
join public.bookings b on b.id = c.booking_id
where not exists (
  select 1 from public.credit_transactions ct
  where ct.booking_id = c.booking_id and ct.reason in ('lesson_completed', 'absence_charge')
);

-- 6c. Consumo sem evidência (pacotes 'sem_evidencia'/'ambiguo' na auditoria) — uma única linha
--     agregada por pacote, sem booking_id, claramente rotulada como não rastreável. Não inventa
--     histórico por aula; só reconcilia o total pra o ledger explicar o contador sem fingir saber
--     o que não sabe.
insert into public.credit_transactions (student_id, package_id, booking_id, delta, reason, created_at)
select
  a.student_id, a.package_id, null, -(a.used_classes_after - a.consumo_registrado),
  'legacy_unverified_consumption', p.created_at
from public._migration_0001_credit_audit a
join public.packages p on p.id = a.package_id
where a.classificacao in ('sem_evidencia', 'ambiguo')
  and (a.used_classes_after - a.consumo_registrado) > 0
  and not exists (
    select 1 from public.credit_transactions ct
    where ct.package_id = a.package_id and ct.reason = 'legacy_unverified_consumption'
  );


-- =============================================================================================
-- 7. "Finalizar pacote ativo anterior" nunca deve incluir o trial — comprar um pacote pago não
--    pode apagar um crédito experimental ainda disponível.
-- =============================================================================================

create or replace function public.assign_package_from_template(p_student_id uuid, p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template record;
  v_new_package_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  select * into v_template
  from public.package_templates
  where id = p_template_id and admin_id = auth.uid() and is_active = true;

  if v_template.id is null then
    raise exception 'template_not_found_or_inactive';
  end if;

  update public.packages
  set status = 'finished'
  where student_id = p_student_id and status = 'active' and origin <> 'trial';

  insert into public.packages (student_id, total_classes, used_classes, status, origin)
  values (p_student_id, v_template.total_classes, 0, 'active', 'purchase')
  returning id into v_new_package_id;

  return v_new_package_id;
end;
$function$;

create or replace function public.assign_package_to_student(p_student_id uuid, p_total_classes int)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_package_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  if p_total_classes is null or p_total_classes <= 0 then
    raise exception 'invalid_total_classes';
  end if;

  update public.packages
  set status = 'finished'
  where student_id = p_student_id and status = 'active' and origin <> 'trial';

  insert into public.packages (student_id, total_classes, used_classes, status, origin)
  values (p_student_id, p_total_classes, 0, 'active', 'admin_grant')
  returning id into v_new_package_id;

  return v_new_package_id;
end;
$function$;

create or replace function public.remove_active_package(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  update public.packages
  set status = 'finished'
  where student_id = p_student_id and status = 'active' and origin <> 'trial';
end;
$function$;


-- =============================================================================================
-- 8. SALDO DISPONÍVEL — regra canônica única. O frontend (creditsAvailableFor) chama esta função
--    em vez de reimplementar a fórmula em TypeScript.
-- =============================================================================================

create or replace function public.available_credits_for_student(p_student_id uuid)
returns int
language sql
stable
security definer
set search_path to 'public'
as $function$
  select greatest(0,
    coalesce((
      select sum(total_classes - used_classes)
      from public.packages
      where student_id = p_student_id and status = 'active'
    ), 0)
    -
    coalesce((
      select count(*)
      from public.bookings
      where student_id = p_student_id
        and status in ('scheduled', 'pending_confirmation')
        and start_time > now()
    ), 0)
  );
$function$;


-- =============================================================================================
-- 9. AGENDAR — trava e soma TODOS os pacotes ativos do aluno (trial + pago), não só "o" mais
--    recente. Mantém a mesma proteção de concorrência de antes (travar as linhas antes de contar
--    evita que dois agendamentos simultâneos passem os dois pela checagem de crédito).
-- =============================================================================================

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

  if exists (select 1 from public.bookings b where b.slot_id = p_slot_id and b.status = 'scheduled') then
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

  insert into public.bookings (student_id, admin_id, slot_id, start_time, end_time, status, billing_kind)
  values (v_student_id, v_student_admin, p_slot_id, v_start, v_end, 'scheduled', 'package');

  update public.availability_slots set is_active = false where id = p_slot_id;
end;
$function$;


-- =============================================================================================
-- 10. CONCLUIR / FALTA — únicos escritores de packages.used_classes e do ledger a partir daqui.
--     Idempotentes: repetir a chamada numa aula que já está no status-alvo não faz nada (nem
--     erro, nem consumo de novo) — a proteção contra duplo clique/retry é o lock da linha da
--     aula + a checagem do status atual, não uma unique constraint em cima do motivo.
-- =============================================================================================

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
  v_pkg_id uuid;
  v_used int;
  v_total int;
begin
  if not public.is_admin() then
    raise exception 'Only admin can complete bookings';
  end if;

  select admin_id, student_id, status, is_replacement
    into v_admin_id, v_student_id, v_status, v_is_replacement
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
  v_consumes boolean;
  v_pkg_id uuid;
  v_used int;
  v_total int;
begin
  if not public.is_admin() then
    raise exception 'Only admin can mark no-show';
  end if;

  select admin_id, student_id, status, is_replacement
    into v_admin_id, v_student_id, v_status, v_is_replacement
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


-- =============================================================================================
-- 11. DESFAZER — reverte a transação de consumo mais recente ainda não revertida daquela aula.
--     Sem janela de tempo artificial: continua válido enquanto a transição em si for válida.
-- =============================================================================================

create or replace function public.undo_lesson_action(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_id uuid;
  v_status public.booking_status;
  v_tx record;
begin
  if not public.is_admin() then
    raise exception 'Only admin can undo';
  end if;

  select admin_id, status into v_admin_id, v_status
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


-- =============================================================================================
-- 12. REPOSIÇÃO — vincula à aula original; estorna o que a aula original cobrou (se ainda não
--     tiver sido estornado) e, se a própria aula marcada já tinha sido concluída/faltada antes de
--     virar reposição, estorna ela também. Nunca é um "+1" solto.
-- =============================================================================================

create or replace function public.mark_as_replacement(p_booking_id uuid, p_replaces_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_id uuid;
  v_student_id uuid;
  v_already boolean;
  v_orig_admin uuid;
  v_orig_student uuid;
  v_tx record;
begin
  if not public.is_admin() then
    raise exception 'Only admin can mark a lesson as replacement';
  end if;
  if p_replaces_booking_id = p_booking_id then
    raise exception 'A booking cannot be a replacement of itself';
  end if;

  select admin_id, student_id, is_replacement
    into v_admin_id, v_student_id, v_already
  from public.bookings where id = p_booking_id for update;

  if v_admin_id is null then
    raise exception 'Booking not found';
  end if;
  if v_admin_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  if v_already then
    return; -- idempotente
  end if;

  select admin_id, student_id into v_orig_admin, v_orig_student
  from public.bookings where id = p_replaces_booking_id;

  if v_orig_admin is null then
    raise exception 'Original booking not found';
  end if;
  if v_orig_admin <> auth.uid() or v_orig_student <> v_student_id then
    raise exception 'Original booking does not belong to the same student/admin';
  end if;

  update public.bookings
  set is_replacement = true, replacement_for_booking_id = p_replaces_booking_id
  where id = p_booking_id;

  -- estorna a cobrança da aula ORIGINAL, se houver uma ainda não revertida
  select * into v_tx
  from public.credit_transactions
  where booking_id = p_replaces_booking_id
    and reason in ('lesson_completed', 'absence_charge')
    and not exists (select 1 from public.credit_transactions r where r.reverses_transaction_id = credit_transactions.id)
  order by created_at desc
  limit 1;

  if v_tx.id is not null then
    insert into public.credit_transactions
      (student_id, package_id, booking_id, delta, reason, reverses_transaction_id, created_by)
    values
      (v_tx.student_id, v_tx.package_id, p_replaces_booking_id, -v_tx.delta, 'replacement_refund', v_tx.id, auth.uid());

    update public.packages
    set used_classes = greatest(used_classes - 1, 0), status = 'active'
    where id = v_tx.package_id;
  end if;

  -- se a PRÓPRIA aula (a reposição) já tinha sido concluída/faltada antes de virar reposição
  -- retroativamente, ela também não deveria ter cobrado — estorna a cobrança dela também.
  select * into v_tx
  from public.credit_transactions
  where booking_id = p_booking_id
    and reason in ('lesson_completed', 'absence_charge')
    and not exists (select 1 from public.credit_transactions r where r.reverses_transaction_id = credit_transactions.id)
  order by created_at desc
  limit 1;

  if v_tx.id is not null then
    insert into public.credit_transactions
      (student_id, package_id, booking_id, delta, reason, reverses_transaction_id, created_by)
    values
      (v_tx.student_id, v_tx.package_id, p_booking_id, -v_tx.delta, 'replacement_refund', v_tx.id, auth.uid());

    update public.packages
    set used_classes = greatest(used_classes - 1, 0), status = 'active'
    where id = v_tx.package_id;
  end if;
end;
$function$;


-- =============================================================================================
-- 13. TRIAL AUTOMÁTICO — acoplado à criação de `students`, não a uma tela específica. Cobre
--     autocadastro, convite, e qualquer caminho futuro que insira em `students`, sem precisar
--     tocar nesses outros lugares. `on conflict (profile_id) do nothing` nos dois callers
--     existentes significa que esta trigger AFTER INSERT só dispara quando a linha é realmente
--     criada — o Postgres não dispara AFTER INSERT para uma linha descartada por ON CONFLICT.
-- =============================================================================================

create or replace function public.grant_trial_credit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pkg_id uuid;
begin
  insert into public.packages (student_id, total_classes, used_classes, status, kind, origin)
  values (new.id, 1, 0, 'active', 'single', 'trial')
  returning id into v_pkg_id;

  insert into public.credit_transactions (student_id, package_id, delta, reason)
  values (new.id, v_pkg_id, 1, 'trial_grant');

  return new;
end;
$function$;

drop trigger if exists trg_grant_trial_credit on public.students;
create trigger trg_grant_trial_credit
  after insert on public.students
  for each row execute function public.grant_trial_credit();


-- =============================================================================================
-- 14. Remove a trigger que causava a dupla contagem — complete_booking/mark_no_show agora são os
--     únicos escritores de used_classes e do ledger.
-- =============================================================================================

drop trigger if exists trg_booking_package_consumption on public.bookings;
drop function if exists public.apply_booking_package_consumption();


-- =============================================================================================
-- 15. Conferência rápida — última instrução, é o que aparece no resultado do SQL Editor.
-- =============================================================================================

select
  (select count(*) from public._migration_0001_credit_audit where classificacao = 'duplo_deterministico') as pacotes_corrigidos,
  (select count(*) from public._migration_0001_credit_audit where classificacao in ('sem_evidencia', 'ambiguo')) as pacotes_legado_sem_evidencia,
  (select count(*) from public.credit_transactions) as linhas_no_ledger,
  (select count(*) from public.packages where origin = 'trial') as trials_concedidos;
