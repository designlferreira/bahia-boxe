-- RECORRENCIA — CAMADA contra duplicação de bookings ao regenerar um pacote pro MESMO aluno
-- (CLAUDE.md). `computeRecorrenciaSlots` (client) não tem como saber que o aluno já tem aulas
-- futuras `scheduled` de um pacote de recorrência anterior ainda não esgotado — ele sempre calcula
-- "as próximas N ocorrências a partir de agora/da data escolhida", então regenerar produzia datas
-- idênticas às já agendadas, deixando o aluno com duas aulas `scheduled` no mesmo horário.
--
-- Opção descartada: rejeitar a geração (como a CAMADA 2 de overlap faz pra OUTRO aluno). Travaria
-- uma renovação legítima — pior que o problema.
--
-- Solução: as aulas futuras `scheduled` do PRÓPRIO aluno, ligadas a QUALQUER pacote de recorrência
-- (`pacote_id is not null` — não só o pacote imediatamente anterior; cobre também sobras de
-- gerações antigas de antes desta correção existir), são canceladas com `cancelado_por =
-- 'professor'` antes de gerar as novas. Não é escolha arbitrária: cancelamento por professor NUNCA
-- consome crédito (regra já existente, testada — CLAUDE.md, "Crédito — regra única") — as aulas
-- descartadas não viram falta do aluno nem gastam nada do pacote velho.
--
-- Só aulas FUTURAS (`start_time > now()`) e `scheduled` são candidatas — passadas, `completed`,
-- `no_show`, `cancelled` ou `rescheduled` ficam intactas, elas já são o registro real do que
-- aconteceu. O cancelamento roda DENTRO desta função, antes de `_create_package`/dos inserts em
-- `bookings` — mesma transação da geração (toda chamada de RPC já é uma transação): se qualquer
-- coisa depois falhar (checagem de recorrência, camada 2, o que for), a exceção desfaz o
-- cancelamento junto, nada fica cancelado sem o pacote novo ter sido criado.
--
-- Escopo aceito, não resolvido aqui: o pacote antigo (agora `finished`) não tem seu `used_classes`
-- resincronizado por este cancelamento — ele só é tocado por `complete_booking`/`mark_no_show`
-- (0017). Mesma classe de dívida já registrada pro gap do `undo_lesson_action` (decisão 10):
-- `calcular_saldo_pacote()`/`saldo_pacotes` continuam corretos a qualquer momento; só a cópia
-- materializada de um pacote já fechado pode ficar momentaneamente desatualizada, sem consequência
-- prática (não é mais "o pacote ativo" de ninguém).
--
-- A tela avisa o professor ANTES de gerar, com a contagem real (`countAulasCancelaveisRecorrencia`
-- em api.ts) — nada disso acontece silenciosamente.

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
  -- próprio aluno (não é overbooking renovar pro mesmo aluno — ver comentário na 0016).
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

  -- Cancela as aulas futuras scheduled do PRÓPRIO aluno vindas de recorrência (qualquer pacote
  -- anterior) antes de gerar as novas — evita duplicação ao regenerar (ver comentário no topo).
  update public.bookings
  set status = 'cancelled', cancelado_por = 'professor'
  where student_id = p_aluno_id
    and admin_id = auth.uid()
    and status = 'scheduled'
    and pacote_id is not null
    and start_time > now();

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
