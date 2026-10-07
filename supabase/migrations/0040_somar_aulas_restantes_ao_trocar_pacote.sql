-- 0040 — Ao trocar de pacote, o professor pode SOMAR as aulas que sobraram ao pacote novo.
--
-- Hoje, atribuir/aprovar/gerar um pacote novo ENCERRA o pacote ativo não-experimental
-- (`_create_package`, decisão 5/6) e as aulas que sobravam se perdem. Exemplo: o aluno tem 2 aulas
-- restantes, o professor atribui 8 — o aluno fica com 8, não com 10.
--
-- Decisão do Lucas (2026-10-07): o professor ESCOLHE a cada troca (janela de confirmação, "somar"
-- já marcado). Somar = o pacote novo nasce com `total_classes = novo + sobras`; as sobras ficam
-- registradas em `packages.aulas_transferidas` (auditoria — o total sozinho esconderia de onde veio).
--
-- O QUE CONTA COMO "SOBRA" depende do tipo do pacote que está sendo encerrado, porque o destino das
-- aulas JÁ MARCADAS é diferente (e por isso não dá para somar "tudo" ou "só sem data" para todos):
--   * Pacote SEM recorrência (comprado/concedido): as aulas já marcadas, quando acontecem, debitam o
--     pacote NOVO (a conclusão procura "o mais antigo ativo com vaga" — 0001). Logo, TODAS as
--     restantes (total − usadas) precisam ir para o novo; somar só as "sem data" deixaria o aluno
--     sem as marcadas. É o mesmo número que o app já mostra como "aulas que seriam perdidas".
--   * Pacote de RECORRÊNCIA, atribuindo/aprovando: as aulas marcadas continuam ligadas ao pacote
--     antigo por `pacote_id` e seguem valendo lá. Só as restantes SEM data vão para o novo
--     (restantes − marcadas − a_repor, o mesmo `semData` do cartão do pacote).
--   * Pacote de RECORRÊNCIA, GERANDO outro (`p_descarta_marcadas`): a regeneração CANCELA as aulas
--     futuras marcadas do pacote antigo (0018/0019, `cancelado_por = 'regeneracao'`, não consome).
--     Então as marcadas também viram sobra: restantes − a_repor.
-- Em todos os casos o pacote EXPERIMENTAL (trial) nunca entra: não é encerrado por essas trocas.
--
-- `aulas_transferiveis` é PÚBLICA (professor dono) porque a tela precisa mostrar o número antes de o
-- professor confirmar; o servidor recalcula na hora de gravar — o número da tela nunca é a fonte.

alter table public.packages add column if not exists aulas_transferidas int;
alter table public.packages drop constraint if exists packages_aulas_transferidas_check;
alter table public.packages add constraint packages_aulas_transferidas_check
  check (aulas_transferidas is null or aulas_transferidas >= 0);

create or replace function public.aulas_transferiveis(p_student_id uuid, p_descarta_marcadas boolean default false)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pkg record;
  v_saldo record;
  v_marcadas int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  -- O pacote que seria encerrado: ativo e não-experimental (o índice único garante no máximo um).
  select id, total_classes, used_classes, recorrencia_id into v_pkg
  from public.packages
  where student_id = p_student_id and status = 'active' and origin <> 'trial'
  limit 1;

  if v_pkg.id is null then
    return 0;
  end if;

  if v_pkg.recorrencia_id is null then
    return greatest(0, v_pkg.total_classes - v_pkg.used_classes);
  end if;

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg.id);

  if p_descarta_marcadas then
    return greatest(0, v_saldo.restantes - v_saldo.a_repor);
  end if;

  select count(*) into v_marcadas
  from public.bookings
  where pacote_id = v_pkg.id and status in ('scheduled', 'pending_confirmation');

  return greatest(0, v_saldo.restantes - v_marcadas - v_saldo.a_repor);
end;
$function$;

revoke execute on function public.aulas_transferiveis(uuid, boolean) from public, anon;
grant execute on function public.aulas_transferiveis(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- _create_package: ganha `p_somar_restantes` / `p_descarta_marcadas` (defaults = comportamento antigo).
-- Assinatura nova => a antiga é removida (duas sobrecargas deixariam as chamadas ambíguas). O REVOKE
-- precisa ser refeito: é uma função nova para o Postgres (ver a justificativa na 0012).
-- ---------------------------------------------------------------------------------------------

drop function if exists public._create_package(uuid, int, text, text);

create or replace function public._create_package(
  p_student_id uuid,
  p_total_classes int,
  p_origin text,
  p_kind text default 'package',
  p_somar_restantes boolean default false,
  p_descarta_marcadas boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_package_id uuid;
  v_carry int := 0;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  -- Calculado ANTES de fechar o pacote antigo (depois ele já não é "ativo").
  if p_somar_restantes then
    v_carry := public.aulas_transferiveis(p_student_id, p_descarta_marcadas);
  end if;

  update public.packages
  set status = 'finished'
  where student_id = p_student_id and status = 'active' and origin <> 'trial';

  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, aulas_transferidas)
  values (p_student_id, p_total_classes + v_carry, 0, 'active', p_origin, p_kind,
          case when p_somar_restantes then v_carry else null end)
  returning id into v_new_package_id;

  return v_new_package_id;
end;
$function$;

revoke execute on function public._create_package(uuid, int, text, text, boolean, boolean) from public, authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- assign_package_from_template / approve_purchase_request: parâmetro novo com default false.
-- (assign_package_to_student não muda: o app não a chama.)
-- ---------------------------------------------------------------------------------------------

drop function if exists public.assign_package_from_template(uuid, uuid);

create or replace function public.assign_package_from_template(
  p_student_id uuid,
  p_template_id uuid,
  p_somar_restantes boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template record;
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

  return public._create_package(p_student_id, v_template.total_classes, 'purchase', 'package', p_somar_restantes, false);
end;
$function$;

revoke execute on function public.assign_package_from_template(uuid, uuid, boolean) from public, anon;
grant execute on function public.assign_package_from_template(uuid, uuid, boolean) to authenticated;

drop function if exists public.approve_purchase_request(uuid);

create or replace function public.approve_purchase_request(p_request_id uuid, p_somar_restantes boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_req record;
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'only_admin';
  end if;

  select * into v_req
  from public.purchase_requests
  where id = p_request_id
    and admin_id = auth.uid()
    and status = 'pending'
  for update;

  if v_req.id is null then
    raise exception 'request_not_found_or_not_pending';
  end if;

  update public.purchase_requests
  set status='approved', decided_at=now()
  where id = p_request_id;

  if v_req.kind = 'package' then
    perform public.assign_package_from_template(v_req.student_id, v_req.template_id, p_somar_restantes);
  else
    perform public._create_package(v_req.student_id, 1, 'purchase', 'single', p_somar_restantes, false);
  end if;
end;
$function$;

revoke execute on function public.approve_purchase_request(uuid, boolean) from public, anon;
grant execute on function public.approve_purchase_request(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- gerar_pacote_recorrencia: corpo da 0027 + `p_aulas_transferidas` (o número que a TELA usou para
-- calcular quantos horários gerar). O servidor recalcula e RECUSA se divergir — evita gerar um
-- pacote com o total errado se o saldo do aluno mudou entre a tela e o clique.
-- Os horários (`p_slots`) já incluem as aulas somadas: total do pacote = quantidade de horários.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.gerar_pacote_recorrencia(uuid, jsonb);

create or replace function public.gerar_pacote_recorrencia(
  p_aluno_id uuid,
  p_slots jsonb,
  p_aulas_transferidas int default 0
)
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
  v_carry int;
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

  -- Aulas somadas: conferidas ANTES de qualquer escrita, contra o saldo de agora.
  p_aulas_transferidas := coalesce(p_aulas_transferidas, 0);
  if p_aulas_transferidas > 0 then
    v_carry := public.aulas_transferiveis(p_aluno_id, true);
    if v_carry <> p_aulas_transferidas then
      raise exception 'As aulas restantes do aluno mudaram desde que a tela abriu. Recarregue a página e gere de novo.';
    end if;
    if p_aulas_transferidas >= v_total then
      raise exception 'invalid_slots';
    end if;
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

  -- `_create_package` soma `v_carry` ao total que recebe; como `p_slots` já traz o total FINAL,
  -- passa-se o total menos o somado.
  v_pkg_id := public._create_package(
    p_aluno_id, v_total - coalesce(p_aulas_transferidas, 0), 'recurrence', 'package',
    p_aulas_transferidas > 0, true
  );

  update public.packages
  set recorrencia_id = (p_slots->0->>'recorrencia_id')::uuid,
      falta_consome_credito = v_falta_consome
  where id = v_pkg_id;

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

revoke execute on function public.gerar_pacote_recorrencia(uuid, jsonb, int) from public, anon;
grant execute on function public.gerar_pacote_recorrencia(uuid, jsonb, int) to authenticated;
