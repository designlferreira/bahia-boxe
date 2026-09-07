-- Etapa 4 / RECORRENCIA — RPC pública gerar_pacote_recorrencia: o professor materializa N aulas
-- concretas em `bookings` a partir de uma ou mais linhas ativas de `aluno_recorrencia`, e cria (via
-- `_create_package`, decisão 6) o pacote que as vincula.
--
-- FUSO HORÁRIO (Pontos em aberto do CLAUDE.md, agora resolvido por reaproveitamento): os timestamps
-- chegam em `p_slots` já resolvidos em UTC. A conversão BRT→UTC acontece no cliente com
-- `fromZonedTime`, exatamente como `saveAvailabilityInterval`/`upsert_availability_slots` já fazem
-- em `api.ts` — não reimplementada aqui em PL/pgSQL. Evita duas fontes de verdade sobre fuso.
--
-- MÚLTIPLOS DIAS POR ALUNO (decisão nova, registrada no CLAUDE.md): um aluno pode ter mais de uma
-- linha ativa em `aluno_recorrencia` (ex.: segunda 18h E quarta 19h) — são a MESMA rotina semanal,
-- não rotinas independentes, porque o índice `ux_packages_one_active_purchase_per_student` já
-- impede fisicamente dois pacotes `active` não-trial simultâneos pro mesmo aluno (decisão 5). Por
-- isso `p_slots` é um único array cobrindo TODOS os dias/horários ativos entrelaçados
-- cronologicamente, gerando UM pacote só. `packages.recorrencia_id` fica com o `recorrencia_id` do
-- primeiro slot do array — `calcular_saldo_pacote()` só verifica `is not null` (nunca lê o
-- conteúdo, ver 0013), então qual das linhas específicas é referenciada ali não afeta o cálculo de
-- saldo; o vínculo por linha que importa de verdade é `bookings.recorrencia_id`, preenchido por
-- aula individualmente a partir do mesmo `p_slots`.
--
-- FERIADOS (Pontos em aberto do CLAUDE.md — AINDA SEM DECISÃO): esta versão não trata feriados de
-- forma nenhuma. Os slots que o cliente manda são inseridos como vieram, sem pular nem sinalizar
-- nada. Quando a decisão for tomada, o ajuste é na geração client-side de `p_slots`, não aqui.
--
-- p_slots: jsonb array de objetos {"start_time": timestamptz iso, "end_time": timestamptz iso,
-- "recorrencia_id": uuid}. O total de aulas do pacote é `jsonb_array_length(p_slots)` — sem
-- parâmetro `p_total_aulas` separado que pudesse divergir do array de verdade.

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
