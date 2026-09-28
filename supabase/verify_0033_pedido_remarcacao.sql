-- Verificação da 0033 — pedido de remarcação pelo aluno de recorrência.
--
-- NÃO destrutivo: uma transação terminada em `rollback`. Cria, só dentro dela, um dia fixo, um
-- pacote de recorrência e uma aula agendada daqui a ~400 dias às 10h (São Paulo) pra um aluno real,
-- e roda o ciclo inteiro como aluno e como professor. Tudo some no rollback.
--
-- COMO USAR: rode a 0033 primeiro. Depois rode este arquivo inteiro. Procure "DIVERGIU" ou "ERRO".

begin;

create temp table resultados_0033 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0033 to authenticated;

do $$
declare
  v_admin uuid;
  v_student uuid;
  v_profile uuid;
  v_rec uuid;
  v_pkg uuid;
  v_orig uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date + 400;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_row record;
  v_livres timestamptz[];
  v_saldo record;
  -- Horários calculados antes de trocar de papel: `_inicio_hora_sp` é revogada pro app (0033).
  v_h10 timestamptz; v_h11 timestamptz; v_h1130 timestamptz; v_h12 timestamptz; v_h13 timestamptz;
begin
  select s.id, s.profile_id, s.admin_id into v_student, v_profile, v_admin
  from public.students s where s.profile_id is not null limit 1;
  if v_student is null then
    insert into resultados_0033 values (0, 'setup', 'ERRO', 'nenhum aluno'); return;
  end if;

  v_h10 := public._inicio_hora_sp(v_dia, 10);
  v_h11 := public._inicio_hora_sp(v_dia, 11);
  v_h1130 := v_h11 + interval '30 minutes';
  v_h12 := public._inicio_hora_sp(v_dia, 12);
  v_h13 := public._inicio_hora_sp(v_dia, 13);

  begin
    insert into public.aluno_recorrencia (aluno_id, dia_semana, horario, duracao)
    values (v_student, extract(dow from v_dia)::int, '10:00', interval '1 hour') returning id into v_rec;
    update public.packages set status = 'finished'
    where student_id = v_student and status = 'active' and origin <> 'trial';
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
    values (v_student, 4, 0, 'active', 'recurrence', 'package', v_rec, true) returning id into v_pkg;
    insert into public.bookings (student_id, admin_id, start_time, end_time, status, pacote_id, recorrencia_id)
    values (v_student, v_admin, v_h10, v_h11, 'scheduled', v_pkg, v_rec)
    returning id into v_orig;
    update public.bookings set cadeia_id = id where id = v_orig;
  exception when others then
    insert into resultados_0033 values (0, 'setup: dados de teste', 'ERRO', sqlerrm); return;
  end;

  -- ===== ALUNO =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_profile::text, true);
  execute 'set local role authenticated';

  begin
    select array_agg(inicio) into v_livres from public.horarios_livres_remarcacao(v_orig, v_dia);
    insert into resultados_0033 values (1, '1. horários livres: 10h ocupada (a própria aula), 11h livre',
      case when not (v_h10 = any(v_livres)) and v_h11 = any(v_livres)
           then 'OK' else 'DIVERGIU' end, format('%s horários livres', coalesce(array_length(v_livres, 1), 0)));
  exception when others then
    insert into resultados_0033 values (1, '1. horários livres', 'ERRO', sqlerrm);
  end;

  begin
    perform public.pedir_remarcacao(v_orig, v_h1130);
    insert into resultados_0033 values (2, '2. horário quebrado (11h30) é recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0033 values (2, '2. horário quebrado (11h30) é recusado',
      case when sqlerrm like '%invalid_time%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  begin
    v_p1 := public.pedir_remarcacao(v_orig, v_h11);
    select status, replacement_for_booking_id, pacote_id into v_row from public.bookings where id = v_p1;
    insert into resultados_0033 values (3, '3. pedido criado pendente e ligado à original',
      case when v_row.status = 'pending_confirmation' and v_row.replacement_for_booking_id = v_orig and v_row.pacote_id = v_pkg
           then 'OK' else 'DIVERGIU' end, format('status=%s', v_row.status));
  exception when others then
    insert into resultados_0033 values (3, '3. pedido criado', 'ERRO', sqlerrm);
  end;

  begin
    perform public.pedir_remarcacao(v_orig, v_h12);
    insert into resultados_0033 values (4, '4. segundo pedido com um pendente é recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0033 values (4, '4. segundo pedido com um pendente é recusado',
      case when sqlerrm like '%request_already_pending%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  begin
    perform public.cancelar_pedido_remarcacao(v_p1);
    select status, replacement_for_booking_id, pacote_id into v_row from public.bookings where id = v_p1;
    insert into resultados_0033 values (5, '5. aluno cancela o pedido (sai da cadeia)',
      case when v_row.status = 'cancelled' and v_row.replacement_for_booking_id is null and v_row.pacote_id is null
           then 'OK' else 'DIVERGIU' end, format('status=%s', v_row.status));
  exception when others then
    insert into resultados_0033 values (5, '5. aluno cancela o pedido', 'ERRO', sqlerrm);
  end;

  begin
    perform public._desligar_pedido_da_cadeia(v_orig, 'cancelled', null);
    insert into resultados_0033 values (6, '6. função auxiliar não é chamável pelo app', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0033 values (6, '6. função auxiliar não é chamável pelo app',
      case when sqlstate = '42501' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  begin
    v_p2 := public.pedir_remarcacao(v_orig, v_h12);
  exception when others then
    insert into resultados_0033 values (7, '7. novo pedido (12h)', 'ERRO', sqlerrm);
  end;

  -- ===== PROFESSOR recusa =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  begin
    perform public.recusar_remarcacao(v_p2, 'não posso nesse horário');
    select status, replacement_for_booking_id into v_row from public.bookings where id = v_p2;
    insert into resultados_0033 values (7, '7. professor recusa: pedido rejected e fora da cadeia',
      case when v_row.status = 'rejected' and v_row.replacement_for_booking_id is null then 'OK' else 'DIVERGIU' end,
      format('status=%s', v_row.status));
    select status into v_row from public.bookings where id = v_orig;
    insert into resultados_0033 values (8, '8. original continua agendada após a recusa',
      case when v_row.status = 'scheduled' then 'OK' else 'DIVERGIU' end, format('status=%s', v_row.status));
  exception when others then
    insert into resultados_0033 values (7, '7. professor recusa', 'ERRO', sqlerrm);
  end;

  -- ===== ALUNO pede de novo, PROFESSOR aprova =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_profile::text, true);
  execute 'set local role authenticated';
  begin
    v_p3 := public.pedir_remarcacao(v_orig, v_h13);
  exception when others then
    insert into resultados_0033 values (9, '9. pedido (13h)', 'ERRO', sqlerrm);
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  begin
    perform public.aprovar_remarcacao(v_p3);
    select status into v_row from public.bookings where id = v_orig;
    insert into resultados_0033 values (9, '9. aprovar: original vira rescheduled',
      case when v_row.status = 'rescheduled' then 'OK' else 'DIVERGIU' end, format('status=%s', v_row.status));
    select status, start_time into v_row from public.bookings where id = v_p3;
    insert into resultados_0033 values (10, '10. aprovar: pedido vira scheduled às 13h',
      case when v_row.status = 'scheduled' and v_row.start_time = v_h13 then 'OK' else 'DIVERGIU' end,
      format('status=%s', v_row.status));
  exception when others then
    insert into resultados_0033 values (9, '9. professor aprova', 'ERRO', sqlerrm);
  end;

  execute 'reset role';
  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  insert into resultados_0033 values (11, '11. saldo do pacote: nada consumido (4 restantes)',
    case when v_saldo.consumidas = 0 and v_saldo.restantes = 4 then 'OK' else 'DIVERGIU' end,
    format('consumidas=%s restantes=%s', v_saldo.consumidas, v_saldo.restantes));
end;
$$;

select * from resultados_0033 order by ordem;

rollback;
