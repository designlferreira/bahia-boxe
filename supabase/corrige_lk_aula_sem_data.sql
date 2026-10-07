-- Correção pontual (2026-10-07): marca a aula que faltava no pacote da LK, mantendo o MESMO pacote.
--
-- Contexto: a aula de 28/09 (20:00 BRT) foi cancelada pelo professor ANTES da 0039 existir, então
-- ninguém marcou a aula que a substitui e o pacote ficou com "1 aula restante" sem data. Este
-- script faz o que `cancelar_aula(..., reposição)` faria hoje: cria uma aula nova LIGADA à
-- cancelada (mesma cadeia, mesmo pacote), no próximo horário fixo ativo da LK que esteja livre,
-- depois da última aula do pacote. O saldo não muda (a aula nova ocupa o lugar da cancelada).
--
-- COMO USAR (em duas passadas, de propósito):
--   1. Rode o arquivo como está. Ele termina em ROLLBACK: mostra qual aula seria criada e não grava nada.
--   2. Se a data estiver certa, troque a última linha `rollback;` por `commit;` e rode de novo.
-- Se qualquer verificação falhar, a tabela de resultado diz o motivo e nada é inserido.

begin;

create temp table resultado_lk (ordem int, item text, valor text);

do $$
declare
  v_pkg uuid := '1f8d9938-7273-4f63-b419-c79183af897d';
  v_student uuid; v_admin uuid; v_rec_pkg uuid;
  v_orig record; v_n int; v_ultimo timestamptz;
  v_slot record; v_cadeia uuid; v_novo uuid := gen_random_uuid();
begin
  select p.student_id, s.admin_id, p.recorrencia_id into v_student, v_admin, v_rec_pkg
  from public.packages p join public.students s on s.id = p.student_id
  where p.id = v_pkg and p.status = 'active' and p.recorrencia_id is not null;
  if v_student is null then
    insert into resultado_lk values (0, 'ERRO', 'pacote nao encontrado, ou nao esta ativo, ou nao e de recorrencia'); return;
  end if;

  -- A aula cancelada pelo professor que ficou sem sucessora (deve ser exatamente UMA).
  select count(*) into v_n
  from public.bookings b
  where b.pacote_id = v_pkg and b.status = 'cancelled' and b.cancelado_por = 'professor'
    and not exists (select 1 from public.bookings x where x.replacement_for_booking_id = b.id);
  if v_n <> 1 then
    insert into resultado_lk values (0, 'ERRO', 'esperava 1 aula cancelada pelo professor sem reposicao, achei ' || v_n || ' (nada foi feito)'); return;
  end if;
  select b.* into v_orig
  from public.bookings b
  where b.pacote_id = v_pkg and b.status = 'cancelled' and b.cancelado_por = 'professor'
    and not exists (select 1 from public.bookings x where x.replacement_for_booking_id = b.id);
  insert into resultado_lk values (1, 'aula cancelada (BRT)', to_char(v_orig.start_time at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));

  -- Depois da última aula do pacote que ainda conta (agendada, pendente, concluída ou falta) e de agora.
  select greatest(now(), coalesce(max(b.start_time), now())) into v_ultimo
  from public.bookings b
  where b.pacote_id = v_pkg and b.status in ('scheduled', 'pending_confirmation', 'completed', 'no_show');

  -- Próximo horário fixo ATIVO do aluno (dia da semana + horário, em BRT) que esteja livre.
  select (d::date + r.horario) at time zone 'America/Sao_Paulo' as inicio,
         (d::date + r.horario) at time zone 'America/Sao_Paulo' + r.duracao as fim,
         r.id as recorrencia_id
    into v_slot
  from public.aluno_recorrencia r
  cross join generate_series(current_date - 1, current_date + 120, interval '1 day') d
  where r.aluno_id = v_student and r.ativo
    and extract(dow from d) = r.dia_semana
    and (d::date + r.horario) at time zone 'America/Sao_Paulo' > v_ultimo
    and not exists (
      select 1 from public.bookings b
      where b.admin_id = v_admin and b.status in ('scheduled', 'pending_confirmation')
        and (d::date + r.horario) at time zone 'America/Sao_Paulo' < b.end_time
        and (d::date + r.horario) at time zone 'America/Sao_Paulo' + r.duracao > b.start_time)
  order by 1 limit 1;

  if v_slot.inicio is null then
    insert into resultado_lk values (0, 'ERRO', 'nenhum horario fixo ativo livre nos proximos 120 dias (nada foi feito)'); return;
  end if;

  v_cadeia := coalesce(v_orig.cadeia_id, v_orig.id);
  update public.bookings set cadeia_id = v_cadeia where id = v_orig.id and cadeia_id is null;

  insert into public.bookings (
    id, student_id, admin_id, start_time, end_time, status, billing_kind,
    pacote_id, recorrencia_id, cadeia_id, replacement_for_booking_id, is_replacement
  ) values (
    v_novo, v_student, v_admin, v_slot.inicio, v_slot.fim, 'scheduled', coalesce(v_orig.billing_kind, 'package'),
    v_pkg, v_slot.recorrencia_id, v_cadeia, v_orig.id, true
  );

  insert into resultado_lk values (2, 'aula nova (BRT)', to_char(v_slot.inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
  insert into resultado_lk values (3, 'ligada a cancelada?', (select (replacement_for_booking_id = v_orig.id and cadeia_id = v_cadeia and pacote_id = v_pkg)::text from public.bookings where id = v_novo));
  insert into resultado_lk values (4, 'aulas futuras agendadas no pacote agora',
    (select count(*)::text from public.bookings where pacote_id = v_pkg and status in ('scheduled', 'pending_confirmation') and start_time > now()));
end;
$$;

select * from resultado_lk order by ordem;

rollback; -- troque por `commit;` depois de conferir a data acima
