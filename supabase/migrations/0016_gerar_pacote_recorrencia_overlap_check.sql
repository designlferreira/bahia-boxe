-- RECORRENCIA — CAMADA 2 contra overbooking (CLAUDE.md). A view `available_slots` (preexistente,
-- fora deste repo) exclui slot "livre" por IGUALDADE exata de start_time/end_time, não por
-- sobreposição de intervalo — confirmado por `pg_get_viewdef` em 2026-09-08. A CAMADA 1
-- (`AlunoRecorrencia.tsx`, hora cheia + 60 min fixos) faz a recorrência bater nessa igualdade
-- quando o horário já está publicado como disponibilidade, mas não resolve o caso em que dois
-- ALUNOS DIFERENTES do mesmo professor acabam com recorrências na MESMA célula da grade — nada
-- na Etapa 4 olhava pra agenda existente do professor antes de inserir.
--
-- Esta migration adiciona essa checagem em `gerar_pacote_recorrencia`: REJEITA a geração inteira
-- (nada é escrito — nem pacote, nem aula) se QUALQUER slot de `p_slots` se sobrepõe, por intervalo
-- real (`novo.start < existente.end and novo.end > existente.start`, não igualdade), a um booking
-- `scheduled` do MESMO professor pertencente a OUTRO aluno. Rejeitar em vez de avisar depois é
-- deliberado (CLAUDE.md): a checagem roda ANTES de qualquer escrita, então "nada foi gerado ainda"
-- é automático — não existe um estado parcial pra desfazer.
--
-- NÃO conta contra bookings do PRÓPRIO `p_aluno_id`: reencontrar o mesmo aluno no mesmo horário
-- (ex.: renovar um pacote enquanto aulas antigas da recorrência anterior ainda estão `scheduled`)
-- não é overbooking — é o mesmo corpo no mesmo lugar. O problema descrito é especificamente "dois
-- alunos diferentes esperados pelo mesmo professor ao mesmo tempo".
--
-- Mensagem em português direto (não um código curto tipo 'only_admin' como o resto deste arquivo)
-- porque esta exceção precisa aparecer legível na tela do professor ANTES de gerar (CLAUDE.md) —
-- o front (`gerarPacoteRecorrencia`/`api.ts`) só repassa `error.message` cru, sem tradução.

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

  -- CAMADA 2: sobreposição real de intervalo contra a agenda existente do professor, excluindo o
  -- próprio aluno (ver comentário acima).
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
    raise exception 'Um ou mais horários gerados coincidem com uma aula já marcada de outro aluno neste horário. Ajuste os dias fixos ou resolva o conflito na agenda antes de gerar.';
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
