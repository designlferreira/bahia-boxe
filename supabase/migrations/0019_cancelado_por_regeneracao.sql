-- RECORRENCIA — `cancelado_por` ganha um TERCEIRO valor, `'regeneracao'`, e a regeneração passa a
-- usá-lo em vez de `'professor'`.
--
-- Por quê: cancelamento POR PROFESSOR e cancelamento POR REGENERAÇÃO são fatos diferentes, e a
-- diferença é observável. Uma aula que o professor cancelou de verdade é reponível legitimamente
-- (o aluno perdeu uma aula que ia acontecer); uma aula descartada pela regeneração nunca existiu
-- como compromisso — foi substituída por outra na grade nova. Colapsar os dois em 'professor'
-- fazia `getReplaceableBookingsForStudent` oferecer as aulas descartadas como candidatas a
-- reposição, e poluía listas/contadores que filtram por motivo.
--
-- Crédito NÃO muda: `calcular_saldo_pacote` (0013) só cobra crédito no caso
-- `cancelled + cancelado_por = 'aluno'`; qualquer outro valor cai no `else 0`. 'regeneracao' já
-- entra como "nunca consome" por construção, sem tocar na 0013.
--
-- ATENÇÃO — esta migration contém um UPDATE DE DADOS, não só DDL. Ver a seção de backfill no fim.

-- ---------------------------------------------------------------------------------------------
-- 1. CHECK estendido. Mesmo padrão da 0010 (`packages.origin`): localiza o CHECK atual pelo attnum
--    da coluna em vez de assumir o nome auto-gerado pelo Postgres na 0011 (nunca foi nomeado lá).
--    Diferente do `booking_status` (enum nativo, decisão 1), um CHECK pode ser estendido e USADO na
--    mesma transação — por isso o backfill abaixo pode gravar 'regeneracao' logo em seguida.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_conname text;
  v_attnum smallint;
begin
  select attnum into v_attnum
  from pg_attribute
  where attrelid = 'public.bookings'::regclass and attname = 'cancelado_por';

  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.bookings'::regclass
    and contype = 'c'
    and v_attnum = any(conkey)
  limit 1;

  if v_conname is not null then
    execute format('alter table public.bookings drop constraint %I', v_conname);
  end if;
end $$;

-- Três valores e nada mais. NULL continua passando (coluna nullable = "não cancelada", ou cancelada
-- sem motivo registrado — todo o AUTOSSERVICO cai aqui). Isso é a rede que pega erro de digitação:
-- a regra de crédito em 0013 é uma WHITELIST de 'aluno' (qualquer outra coisa não consome), então
-- um 'Professor'/'regeneração' com acento entraria silenciosamente como "não consome" — este CHECK
-- rejeita a escrita antes disso acontecer. Ver nota na decisão 8 do CLAUDE.md.
alter table public.bookings
  add constraint bookings_cancelado_por_check
  check (cancelado_por in ('professor', 'aluno', 'regeneracao'));

-- ---------------------------------------------------------------------------------------------
-- 2. `gerar_pacote_recorrencia` — duas mudanças sobre a 0018:
--    a) grava `cancelado_por = 'regeneracao'` (era 'professor');
--    b) NÃO cancela linhas com `replacement_for_booking_id is not null` (reposição).
--
--    (b) é uma decisão tomada ANTES de ser alcançável, de propósito (CLAUDE.md): hoje nenhuma
--    reposição tem `pacote_id` preenchido, então o filtro é inócuo — mas a Etapa 6 (reagendar/
--    cancelar) vai criar sucessores DENTRO do pacote, e aí uma reposição já combinada com o aluno
--    passaria a ser varrida por uma regeneração. Reposição é compromisso individualizado, não parte
--    da grade que está sendo substituída: se precisa sair, o professor cancela explicitamente.
--    Uma linha agora fecha o buraco antes de ele abrir.
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

  -- Descarta a grade anterior do próprio aluno (evita duplicação ao regenerar). REPOSIÇÃO fica de
  -- fora: `replacement_for_booking_id is not null` é compromisso individualizado, não grade.
  update public.bookings
  set status = 'cancelled', cancelado_por = 'regeneracao'
  where student_id = p_aluno_id
    and admin_id = auth.uid()
    and status = 'scheduled'
    and pacote_id is not null
    and replacement_for_booking_id is null
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

-- ---------------------------------------------------------------------------------------------
-- 3. BACKFILL — UPDATE DE DADOS, o único deste arquivo. Reclassifica as linhas que a 0018 já
--    cancelou (gravando 'professor') para 'regeneracao'.
--
--    Por que isso é preciso e não um chute: `cancelado_por` NUNCA foi escrito por nenhum outro
--    caminho. Verificado por grep no repositório inteiro (2026-09-08) — `cancelBooking` (aluno),
--    `rejectBooking`, `mark_as_replacement`, `complete_booking`, `mark_no_show` e a UI admin não
--    tocam nessa coluna; o único `set ... cancelado_por` que existe é o da 0018. Logo, toda linha
--    com `cancelado_por = 'professor'` hoje veio da regeneração, e a reclassificação não pode
--    "roubar" um cancelamento manual do professor — esse caminho não existe ainda.
--
--    Sem este backfill, as linhas já canceladas continuariam marcadas 'professor' e seguiriam
--    aparecendo como candidatas a reposição (o filtro novo mira 'regeneracao'), que é exatamente o
--    sintoma que estamos consertando.
--
--    Para conferir ANTES de rodar (só leitura), o conjunto exato que será alterado:
--      select id, student_id, start_time, pacote_id from public.bookings
--      where status = 'cancelled' and cancelado_por = 'professor' and pacote_id is not null;
--
--    Se em algum momento futuro existir cancelamento manual pelo professor gravando
--    `cancelado_por = 'professor'` (Etapa 6), este backfill NÃO pode ser rodado de novo.
-- ---------------------------------------------------------------------------------------------
update public.bookings
set cancelado_por = 'regeneracao'
where status = 'cancelled'
  and cancelado_por = 'professor'
  and pacote_id is not null;
