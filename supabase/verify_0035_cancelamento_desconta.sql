-- Verificação da 0035 — o aluno lê se cancelar desconta uma aula.
--
-- NÃO destrutivo: transação terminada em `rollback`. Usa um aluno real e cria, só dentro dela, dois
-- pacotes de recorrência (um com regra "desconta", outro "não desconta") e uma aula avulsa, todas
-- bem no futuro.
-- COMO USAR: rode a 0035 primeiro; depois este arquivo inteiro. Procure "DIVERGIU" ou "ERRO".

begin;

create temp table resultados_0035 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0035 to authenticated;

do $$
declare
  v_admin uuid; v_student uuid; v_profile uuid;
  v_pk_sim uuid; v_pk_nao uuid;
  v_b_sim uuid; v_b_nao uuid; v_b_avulsa uuid;
  v_base timestamptz := date_trunc('day', now()) + interval '500 days' + interval '3 hours';
  v_r boolean;
begin
  select s.id, s.profile_id, s.admin_id into v_student, v_profile, v_admin
  from public.students s where s.profile_id is not null limit 1;
  if v_student is null then
    insert into resultados_0035 values (0, 'setup', 'ERRO', 'nenhum aluno'); return;
  end if;

  begin
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, falta_consome_credito)
    values (v_student, 4, 0, 'finished', 'recurrence', 'package', true) returning id into v_pk_sim;
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, falta_consome_credito)
    values (v_student, 4, 0, 'finished', 'recurrence', 'package', false) returning id into v_pk_nao;
    insert into public.bookings (student_id, admin_id, start_time, end_time, status, pacote_id)
    values (v_student, v_admin, v_base, v_base + interval '1 hour', 'scheduled', v_pk_sim) returning id into v_b_sim;
    insert into public.bookings (student_id, admin_id, start_time, end_time, status, pacote_id)
    values (v_student, v_admin, v_base + interval '1 day', v_base + interval '1 day 1 hour', 'scheduled', v_pk_nao) returning id into v_b_nao;
    insert into public.bookings (student_id, admin_id, start_time, end_time, status)
    values (v_student, v_admin, v_base + interval '2 days', v_base + interval '2 days 1 hour', 'scheduled') returning id into v_b_avulsa;
  exception when others then
    insert into resultados_0035 values (0, 'setup: dados de teste', 'ERRO', sqlerrm); return;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_profile::text, true);
  execute 'set local role authenticated';

  begin
    v_r := public.cancelamento_desconta_aula(v_b_sim);
    insert into resultados_0035 values (1, '1. pacote com regra desconta -> true', case when v_r is true then 'OK' else 'DIVERGIU' end, coalesce(v_r::text, 'null'));
  exception when others then insert into resultados_0035 values (1, '1. pacote com regra desconta', 'ERRO', sqlerrm); end;

  begin
    v_r := public.cancelamento_desconta_aula(v_b_nao);
    insert into resultados_0035 values (2, '2. pacote com regra nao desconta -> false', case when v_r is false then 'OK' else 'DIVERGIU' end, coalesce(v_r::text, 'null'));
  exception when others then insert into resultados_0035 values (2, '2. pacote com regra nao desconta', 'ERRO', sqlerrm); end;

  begin
    v_r := public.cancelamento_desconta_aula(v_b_avulsa);
    insert into resultados_0035 values (3, '3. aula sem pacote (autosservico) -> false', case when v_r is false then 'OK' else 'DIVERGIU' end, coalesce(v_r::text, 'null'));
  exception when others then insert into resultados_0035 values (3, '3. aula sem pacote', 'ERRO', sqlerrm); end;

  -- Quem não é o aluno da aula (o professor) é recusado.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  begin
    v_r := public.cancelamento_desconta_aula(v_b_sim);
    insert into resultados_0035 values (4, '4. quem nao e o aluno da aula e recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0035 values (4, '4. quem nao e o aluno da aula e recusado', case when sqlerrm like '%not_allowed%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
end;
$$;

select * from resultados_0035 order by ordem;

rollback;
