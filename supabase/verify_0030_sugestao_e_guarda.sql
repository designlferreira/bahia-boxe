-- Verificação da 0030 (RPCs de sugestão + guarda de UPDATE pelo aluno).
--
-- NÃO destrutivo: tudo dentro de UMA transação terminada em `rollback` — as aulas de teste criadas
-- aqui somem no fim, junto com qualquer efeito. Mesma técnica de verify_modo_agendamento.sql:
-- vereditos saem como resultado do SELECT final (o SQL Editor do Supabase não mostra NOTICE).
--
-- As aulas de teste ficam 400+ dias no futuro, às 03:00 UTC, pra não colidir com agenda real na
-- exclusion constraint da 0028.
--
-- Pra testar como ALUNO, o script troca o papel da sessão pra `authenticated` e injeta o JWT do
-- aluno (`request.jwt.claims`) — exatamente como o PostgREST faz numa chamada do app.
--
-- COMO USAR: rode a 0030 primeiro. Depois rode este arquivo inteiro. Procure "DIVERGIU" ou "ERRO".

begin;

create temp table resultados_0030 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0030 to authenticated;

do $$
declare
  v_admin uuid;
  v_student uuid;
  v_student_profile uuid;
  v_sug1 uuid; -- pra aceitar
  v_sug2 uuid; -- pra recusar + desfazer
  v_sch uuid;  -- agendada, pra testar a guarda
  v_base timestamptz := date_trunc('day', now()) + interval '400 days' + interval '3 hours';
  v_row record;
  v_err text;
begin
  -- Aluno real com aula disponível (aceitar exige crédito, como schedule_booking).
  select s.id, s.profile_id, s.admin_id into v_student, v_student_profile, v_admin
  from public.students s
  where s.profile_id is not null and public.available_credits_for_student(s.id) > 0
  limit 1;

  if v_student is null then
    insert into resultados_0030 values (0, 'setup', 'ERRO', 'nenhum aluno com aula disponível — o caso de aceitar precisa de um');
    return;
  end if;

  begin
    insert into public.bookings (student_id, admin_id, start_time, end_time, status, suggested_start_time, suggested_end_time)
    values (v_student, v_admin, v_base, v_base + interval '1 hour', 'rejected_with_suggestion',
            v_base + interval '1 day', v_base + interval '1 day 1 hour')
    returning id into v_sug1;
    insert into public.bookings (student_id, admin_id, start_time, end_time, status, suggested_start_time, suggested_end_time)
    values (v_student, v_admin, v_base + interval '2 days', v_base + interval '2 days 1 hour', 'rejected_with_suggestion',
            v_base + interval '3 days', v_base + interval '3 days 1 hour')
    returning id into v_sug2;
    -- A aula AGENDADA do teste da guarda (v_sch) só é criada depois do caso 4: ela reserva uma aula
    -- do aluno, e um aluno com 1 aula livre ficaria sem crédito pro caso 1 (aceitar) — foi o que
    -- aconteceu na primeira execução (no_credits).
  exception when others then
    insert into resultados_0030 values (0, 'setup: criar aulas de teste', 'ERRO', sqlerrm);
    return;
  end;

  -- ===== como ALUNO =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_student_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_student_profile::text, true);
  execute 'set local role authenticated';

  -- 1. aceitar
  begin
    perform public.aceitar_sugestao(v_sug1);
    select status, start_time, suggested_start_time into v_row from public.bookings where id = v_sug1;
    insert into resultados_0030 values (1, '1. aluno aceita a sugestão',
      case when v_row.status = 'scheduled' and v_row.start_time = v_base + interval '1 day' and v_row.suggested_start_time is null
           then 'OK' else 'DIVERGIU' end,
      format('status=%s start=%s', v_row.status, v_row.start_time));
  exception when others then
    insert into resultados_0030 values (1, '1. aluno aceita a sugestão', 'ERRO', sqlerrm);
  end;

  -- 2. recusar
  begin
    perform public.recusar_sugestao(v_sug2);
    select status, suggested_start_time into v_row from public.bookings where id = v_sug2;
    insert into resultados_0030 values (2, '2. aluno recusa (sugestão fica guardada)',
      case when v_row.status = 'rejected' and v_row.suggested_start_time is not null then 'OK' else 'DIVERGIU' end,
      format('status=%s sugerido=%s', v_row.status, v_row.suggested_start_time));
  exception when others then
    insert into resultados_0030 values (2, '2. aluno recusa', 'ERRO', sqlerrm);
  end;

  -- 3. desfazer
  begin
    perform public.desfazer_recusa_sugestao(v_sug2);
    select status into v_row from public.bookings where id = v_sug2;
    insert into resultados_0030 values (3, '3. aluno desfaz a recusa',
      case when v_row.status = 'rejected_with_suggestion' then 'OK' else 'DIVERGIU' end, format('status=%s', v_row.status));
  exception when others then
    insert into resultados_0030 values (3, '3. aluno desfaz a recusa', 'ERRO', sqlerrm);
  end;

  -- 4. aceitar de novo o que já foi aceito -> recusado com código legível
  begin
    perform public.aceitar_sugestao(v_sug1);
    insert into resultados_0030 values (4, '4. aceitar sugestão que não existe mais é recusado', 'DIVERGIU', 'passou sem erro');
  exception when others then
    insert into resultados_0030 values (4, '4. aceitar sugestão que não existe mais é recusado',
      case when sqlerrm like '%suggestion_not_available%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
  begin
    insert into public.bookings (student_id, admin_id, start_time, end_time, status)
    values (v_student, v_admin, v_base + interval '4 days', v_base + interval '4 days 1 hour', 'scheduled')
    returning id into v_sch;
  exception when others then
    insert into resultados_0030 values (5, 'setup: aula agendada da guarda', 'ERRO', sqlerrm);
    return;
  end;
  execute 'set local role authenticated';

  -- 5. guarda: cancelar pelo cliente tentando se passar por "professor" -> vira "aluno"
  begin
    update public.bookings set status = 'cancelled', cancelado_por = 'professor' where id = v_sch;
    select status, cancelado_por into v_row from public.bookings where id = v_sch;
    insert into resultados_0030 values (5, '5. cancelar direto grava cancelado_por = aluno',
      case when v_row.status = 'cancelled' and v_row.cancelado_por = 'aluno' then 'OK' else 'DIVERGIU' end,
      format('status=%s cancelado_por=%s', v_row.status, v_row.cancelado_por));
  exception when others then
    insert into resultados_0030 values (5, '5. cancelar direto grava cancelado_por = aluno', 'ERRO', sqlerrm);
  end;

  execute 'reset role';
  -- volta a aula pra agendada (como postgres, fora da guarda) pro próximo caso
  update public.bookings set status = 'scheduled', cancelado_por = null where id = v_sch;
  execute 'set local role authenticated';

  -- 6. guarda: cancelar E mexer em outra coluna junto -> recusado
  begin
    update public.bookings set status = 'cancelled', teacher_note = 'forjado' where id = v_sch;
    insert into resultados_0030 values (6, '6. cancelar mexendo em outra coluna é recusado', 'DIVERGIU', 'passou sem erro');
  exception when others then
    insert into resultados_0030 values (6, '6. cancelar mexendo em outra coluna é recusado',
      case when sqlerrm like '%not_allowed%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  -- ===== como PROFESSOR =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  -- 7. professor continua podendo fazer UPDATE direto (ex.: observação)
  begin
    update public.bookings set teacher_note = 'nota do professor' where id = v_sch;
    select teacher_note into v_row from public.bookings where id = v_sch;
    insert into resultados_0030 values (7, '7. professor segue com UPDATE direto',
      case when v_row.teacher_note = 'nota do professor' then 'OK' else 'DIVERGIU' end, coalesce(v_row.teacher_note, 'null'));
  exception when others then
    insert into resultados_0030 values (7, '7. professor segue com UPDATE direto', 'ERRO', sqlerrm);
  end;

  -- 8. professor não pode aceitar sugestão em nome do aluno
  begin
    perform public.aceitar_sugestao(v_sug2);
    insert into resultados_0030 values (8, '8. professor não aceita sugestão pelo aluno', 'DIVERGIU', 'passou sem erro');
  exception when others then
    insert into resultados_0030 values (8, '8. professor não aceita sugestão pelo aluno',
      case when sqlerrm like '%not_allowed%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
end;
$$;

select * from resultados_0030 order by ordem;

rollback;
